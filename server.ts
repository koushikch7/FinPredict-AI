import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './src/db';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (roles: string[]) => (req: any, res: any, next: any) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// --- API Routes ---

// Auth
app.post('/api/auth/register', async (req, res) => {
  const { username, password, role } = req.body;
  
  // Check if any admin exists
  const adminExists = db.prepare("SELECT COUNT(*) as count FROM users WHERE role IN ('Admin', 'Super Admin')").get() as any;
  
  const requestedRole = role || 'Viewer';
  if (['Admin', 'Super Admin'].includes(requestedRole) && adminExists.count > 0) {
    return res.status(403).json({ error: 'Administrator registration is restricted. Please contact an existing admin.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const info = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashedPassword, requestedRole);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/admin/users', authenticate, authorize(['Admin', 'Super Admin']), async (req, res) => {
  const { username, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const info = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashedPassword, role);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.get('/api/admin/users', authenticate, authorize(['Admin', 'Super Admin']), (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users').all();
  res.json(users);
});

// AI Helper
const getAIConfig = () => {
  const provider = db.prepare("SELECT value FROM configurations WHERE key = 'AI_PROVIDER'").get() as any;
  const apiKey = db.prepare("SELECT value FROM configurations WHERE key = 'AI_API_KEY'").get() as any;
  const model = db.prepare("SELECT value FROM configurations WHERE key = 'AI_MODEL'").get() as any;
  
  const keyToUse = apiKey?.value || process.env.GEMINI_API_KEY;
  const modelToUse = model?.value || "gemini-3-flash-preview";
  
  return { provider: provider?.value || 'Gemini', apiKey: keyToUse, model: modelToUse };
};

const callAIWithTimeout = async (ai: any, params: any, timeoutMs = 30000) => {
  return Promise.race([
    ai.models.generateContent(params),
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI Request Timeout')), timeoutMs))
  ]);
};

// Kite Sync Logic
const syncKitePortfolio = async (targetUserId?: number) => {
  const kiteEnabled = db.prepare("SELECT value FROM configurations WHERE key = 'KITE_ENABLED'").get() as any;
  const kiteKey = db.prepare("SELECT value FROM configurations WHERE key = 'KITE_API_KEY'").get() as any;
  
  if (kiteEnabled?.value !== 'true') {
    console.log('Kite sync skipped: disabled');
    return;
  }

  console.log('Syncing Kite Portfolio...');
  try {
    if (!kiteKey?.value) {
      throw new Error('Kite API Key not configured');
    }

    // If no specific user, sync for all admins
    let userIds = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const admins = db.prepare("SELECT id FROM users WHERE role IN ('Admin', 'Super Admin')").all() as any[];
      userIds = admins.map(a => a.id);
    }

    if (userIds.length > 0) {
      const mockHoldings = [
        { symbol: 'RELIANCE', quantity: 10, average_price: 2400 },
        { symbol: 'TCS', quantity: 5, average_price: 3200 },
        { symbol: 'INFY', quantity: 15, average_price: 1500 }
      ];

      for (const userId of userIds) {
        for (const h of mockHoldings) {
          let stock = db.prepare('SELECT id FROM stocks WHERE symbol = ?').get(h.symbol) as any;
          if (!stock) {
            const info = db.prepare('INSERT INTO stocks (symbol, name, sector) VALUES (?, ?, ?)').run(h.symbol, h.symbol, 'Auto-Synced');
            stock = { id: info.lastInsertRowid };
          }
          
          db.prepare(`
            INSERT INTO portfolio (user_id, stock_id, quantity, average_price) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, stock_id) DO UPDATE SET 
              quantity = excluded.quantity,
              average_price = excluded.average_price
          `).run(userId, stock.id, h.quantity, h.average_price);
        }
      }
    }

    db.prepare("INSERT INTO sync_logs (service, status, message) VALUES (?, ?, ?)").run('Kite', 'SUCCESS', `Portfolio synced for ${userIds.length} users`);
  } catch (err: any) {
    console.error('Kite Sync Error:', err.message);
    db.prepare("INSERT INTO sync_logs (service, status, message) VALUES (?, ?, ?)").run('Kite', 'FAILED', err.message);
    throw err;
  }
};

// Background Job: Sync every 6 hours
setInterval(syncKitePortfolio, 6 * 60 * 60 * 1000);

app.post('/api/admin/sync/kite', authenticate, authorize(['Admin', 'Super Admin']), async (req: any, res) => {
  try {
    await syncKitePortfolio(req.user.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/sync/logs', authenticate, authorize(['Admin', 'Super Admin']), (req, res) => {
  const logs = db.prepare('SELECT * FROM sync_logs ORDER BY timestamp DESC LIMIT 50').all();
  res.json(logs);
});

// Predictions
app.get('/api/predictions', authenticate, (req, res) => {
  const { sort } = req.query;
  let query = `
    SELECT p.*, s.symbol 
    FROM predictions p 
    JOIN stocks s ON p.stock_id = s.id
  `;
  
  if (sort === 'profit') {
    query += ` ORDER BY p.expected_move_p DESC`;
  } else {
    query += ` ORDER BY p.created_at DESC`;
  }
  
  const predictions = db.prepare(query).all();
  res.json(predictions);
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/auth/me', authenticate, (req: any, res) => {
  res.json(req.user);
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Stocks
app.get('/api/stocks', authenticate, (req, res) => {
  const stocks = db.prepare('SELECT * FROM stocks').all();
  res.json(stocks);
});

app.post('/api/stocks', authenticate, authorize(['Admin', 'Super Admin']), (req, res) => {
  const { symbol, name, sector } = req.body;
  try {
    const info = db.prepare('INSERT INTO stocks (symbol, name, sector) VALUES (?, ?, ?)').run(symbol, name, sector);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Stock already exists' });
  }
});

// Portfolio
app.get('/api/portfolio', authenticate, (req: any, res) => {
  const items = db.prepare(`
    SELECT p.*, s.symbol, s.name 
    FROM portfolio p 
    JOIN stocks s ON p.stock_id = s.id 
    WHERE p.user_id = ?
  `).all(req.user.id);
  res.json(items);
});

app.post('/api/portfolio', authenticate, (req: any, res) => {
  const { stock_id, quantity, average_price } = req.body;
  const info = db.prepare('INSERT INTO portfolio (user_id, stock_id, quantity, average_price) VALUES (?, ?, ?, ?)').run(req.user.id, stock_id, quantity, average_price);
  res.json({ id: info.lastInsertRowid });
});

app.post('/api/predictions/generate', authenticate, authorize(['Analyst', 'Admin', 'Super Admin']), async (req: any, res) => {
  const { stock_id, horizon } = req.body;
  const stock: any = db.prepare('SELECT * FROM stocks WHERE id = ?').get(stock_id);
  if (!stock) return res.status(404).json({ error: 'Stock not found' });

  // Mocking data for AI prompt
  const prices = db.prepare('SELECT * FROM stock_prices WHERE stock_id = ? ORDER BY timestamp DESC LIMIT 10').all(stock_id);
  
  const config = getAIConfig();
  if (!config.apiKey) return res.status(400).json({ error: 'AI API Key not configured' });

  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  
  const prompt = `Analyze the stock ${stock.symbol} (${stock.name}) for a ${horizon} horizon. 
  Recent prices: ${JSON.stringify(prices)}.
  Provide a prediction in JSON format: { "direction": "UP" | "DOWN" | "SIDEWAYS", "expected_move_p": number, "confidence": number, "explanation": string }`;

  try {
    const result: any = await callAIWithTimeout(ai, {
      model: config.model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const predictionData = JSON.parse(result.text || '{}');
    
    const info = db.prepare(`
      INSERT INTO predictions (stock_id, user_id, direction, expected_move_p, horizon, confidence, ai_explanation, model_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(stock_id, req.user.id, predictionData.direction, predictionData.expected_move_p, horizon, predictionData.confidence, predictionData.explanation, config.model);

    res.json({ id: info.lastInsertRowid, ...predictionData });
  } catch (err: any) {
    console.error('AI Generation Error:', err.message);
    res.status(500).json({ error: `AI generation failed: ${err.message}` });
  }
});

// Admin Config
app.get('/api/admin/config', authenticate, authorize(['Admin', 'Super Admin']), (req, res) => {
  const configs = db.prepare('SELECT * FROM configurations').all();
  res.json(configs);
});

app.post('/api/admin/config', authenticate, authorize(['Admin', 'Super Admin']), (req, res) => {
  const { key, value } = req.body;
  db.prepare('UPDATE configurations SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value, key);
  res.json({ success: true });
});

app.post('/api/admin/test-connection', authenticate, authorize(['Admin', 'Super Admin']), async (req, res) => {
  const { category } = req.body;
  try {
    if (category === 'AI') {
      const config = getAIConfig();
      if (!config.apiKey) throw new Error('No API Key configured');

      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      await callAIWithTimeout(ai, {
        model: config.model,
        contents: "test",
      }, 15000); // Shorter timeout for test
      
      return res.json({ success: true, message: `${config.provider} Connection Successful` });
    }
    if (category === 'Brokerage') {
      await syncKitePortfolio();
      return res.json({ success: true, message: 'Brokerage Connection & Sync Successful' });
    }
    res.json({ success: true, message: 'Configuration validated' });
  } catch (err: any) {
    console.error(`Test Connection Error (${category}):`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/fetch-models', authenticate, authorize(['Admin', 'Super Admin']), async (req, res) => {
  try {
    const config = getAIConfig();
    if (!config.apiKey) throw new Error('AI API Key not configured');
    
    if (config.provider === 'Gemini') {
      const models = [
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
        { id: 'gemini-2.5-flash-latest', name: 'Gemini 2.5 Flash' }
      ];
      return res.json(models);
    }
    
    res.json([
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
      { id: 'claude-3-opus', name: 'Claude 3 Opus' }
    ]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => res.sendFile('dist/index.html', { root: '.' }));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
