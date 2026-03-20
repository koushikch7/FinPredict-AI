import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  LayoutDashboard, 
  Briefcase, 
  TrendingUp, 
  Settings, 
  LogOut, 
  Plus, 
  Search, 
  ChevronRight, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Shield,
  User as UserIcon,
  BarChart3,
  BookOpen,
  HelpCircle,
  ExternalLink,
  Activity,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from './api';

// --- Types ---
interface User {
  id: number;
  username: string;
  role: string;
}

interface Stock {
  id: number;
  symbol: string;
  name: string;
  sector: string;
}

interface PortfolioItem {
  id: number;
  stock_id: number;
  symbol: string;
  name: string;
  quantity: number;
  average_price: number;
}

interface Prediction {
  id: number;
  stock_id: number;
  symbol: string;
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  expected_move_p: number;
  horizon: string;
  confidence: number;
  ai_explanation: string;
  status: string;
  result: string;
  created_at: string;
}

// --- Context ---
const AuthContext = createContext<{
  user: User | null;
  login: (data: any) => Promise<void>;
  logout: () => void;
  loading: boolean;
} | null>(null);

const UIContext = createContext<{
  showNotification: (message: string, type?: 'success' | 'error') => void;
} | null>(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within UIProvider');
  return context;
};

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }: any) => {
  const base = "px-4 py-2 rounded-sm font-medium transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider";
  const variants: any = {
    primary: "bg-[#141414] text-[#E4E3E0] hover:opacity-90",
    secondary: "border border-[#141414] text-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0]",
    ghost: "text-[#141414] hover:bg-[#141414]/5"
  };
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
};

const Card = ({ children, title, className = '' }: any) => (
  <div className={`bg-white border border-[#141414]/10 p-6 ${className}`}>
    {title && <h3 className="col-header mb-4">{title}</h3>}
    {children}
  </div>
);

const Badge = ({ children, variant = 'neutral' }: any) => {
  const variants: any = {
    neutral: "bg-[#141414]/5 text-[#141414]",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-800"
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-tighter ${variants[variant]}`}>
      {children}
    </span>
  );
};

// --- Pages ---

const Dashboard = () => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

  useEffect(() => {
    api.predictions.list().then(setPredictions);
    api.portfolio.list().then(setPortfolio);
  }, []);

  const totalValue = portfolio.reduce((acc, item) => acc + (item.quantity * item.average_price), 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card title="Total Capital">
          <div className="text-4xl font-display font-black tracking-tighter">
            ${totalValue.toLocaleString()}
          </div>
          <div className="text-xs text-[#141414]/50 mt-1 uppercase tracking-widest">Unrealized P&L: +12.4%</div>
        </Card>
        <Card title="Active Predictions">
          <div className="text-4xl font-display font-black tracking-tighter">
            {predictions.filter(p => p.status === 'PENDING').length}
          </div>
          <div className="text-xs text-[#141414]/50 mt-1 uppercase tracking-widest">Across 8 Sectors</div>
        </Card>
        <Card title="Model Accuracy">
          <div className="text-4xl font-display font-black tracking-tighter">
            78.2%
          </div>
          <div className="text-xs text-[#141414]/50 mt-1 uppercase tracking-widest">Self-Learning Active</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Recent Predictions">
          <div className="space-y-0">
            <div className="grid grid-cols-4 col-header pb-2 border-bottom border-[#141414]/10">
              <div>Symbol</div>
              <div>Direction</div>
              <div>Horizon</div>
              <div className="text-right">Confidence</div>
            </div>
            {predictions.slice(0, 5).map(p => (
              <div key={p.id} className="grid grid-cols-4 py-3 data-row text-sm items-center">
                <div className="font-bold">{p.symbol}</div>
                <div>
                  <Badge variant={p.direction === 'UP' ? 'success' : p.direction === 'DOWN' ? 'danger' : 'neutral'}>
                    {p.direction}
                  </Badge>
                </div>
                <div className="text-xs font-mono">{p.horizon}</div>
                <div className="text-right data-value">{(p.confidence * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Portfolio Allocation">
          <div className="space-y-4">
            {portfolio.slice(0, 5).map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-[#141414]/5">
                <div>
                  <div className="font-bold text-sm">{item.symbol}</div>
                  <div className="text-[10px] text-[#141414]/50 uppercase">{item.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm data-value">${(item.quantity * item.average_price).toLocaleString()}</div>
                  <div className="text-[10px] text-emerald-600 font-bold">+2.4%</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

const Portfolio = () => {
  const { showNotification } = useUI();
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState({ stock_id: '', quantity: '', average_price: '' });

  useEffect(() => {
    api.portfolio.list().then(setItems);
    api.stocks.list().then(setStocks);
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.portfolio.add({
      stock_id: parseInt(newEntry.stock_id),
      quantity: parseFloat(newEntry.quantity),
      average_price: parseFloat(newEntry.average_price)
    });
    api.portfolio.list().then(setItems);
    setShowAdd(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-black tracking-tighter uppercase">Portfolio</h1>
          <p className="text-xs text-[#141414]/50 uppercase tracking-widest">Asset Allocation & Performance</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus size={16} /> Add Position</Button>
      </div>

      <Card>
        <div className="grid grid-cols-5 col-header pb-4 border-b border-[#141414]">
          <div>Asset</div>
          <div>Quantity</div>
          <div>Avg Price</div>
          <div>Total Value</div>
          <div className="text-right">P&L</div>
        </div>
        {items.map(item => (
          <div key={item.id} className="grid grid-cols-5 py-4 data-row items-center">
            <div>
              <div className="font-bold">{item.symbol}</div>
              <div className="text-[10px] opacity-50">{item.name}</div>
            </div>
            <div className="data-value">{item.quantity}</div>
            <div className="data-value">${item.average_price.toFixed(2)}</div>
            <div className="data-value">${(item.quantity * item.average_price).toLocaleString()}</div>
            <div className="text-right text-emerald-600 font-bold text-sm">+12.5%</div>
          </div>
        ))}
      </Card>

      <AnimatePresence>
        {showAdd && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#E4E3E0] p-8 max-w-md w-full border border-[#141414]"
            >
              <h2 className="font-display font-black text-2xl uppercase mb-6">Add Position</h2>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="col-header block mb-1">Stock</label>
                  <select 
                    className="w-full bg-white border border-[#141414] p-2 text-sm"
                    value={newEntry.stock_id}
                    onChange={e => setNewEntry({ ...newEntry, stock_id: e.target.value })}
                    required
                  >
                    <option value="">Select Stock</option>
                    {stocks.map(s => <option key={s.id} value={s.id}>{s.symbol} - {s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="col-header block mb-1">Quantity</label>
                  <input 
                    type="number" step="0.01"
                    className="w-full bg-white border border-[#141414] p-2 text-sm"
                    value={newEntry.quantity}
                    onChange={e => setNewEntry({ ...newEntry, quantity: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="col-header block mb-1">Avg Purchase Price</label>
                  <input 
                    type="number" step="0.01"
                    className="w-full bg-white border border-[#141414] p-2 text-sm"
                    value={newEntry.average_price}
                    onChange={e => setNewEntry({ ...newEntry, average_price: e.target.value })}
                    required
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <Button type="submit" className="flex-1">Save Position</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Predictions = () => {
  const { showNotification } = useUI();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState('');
  const [selectedHorizon, setSelectedHorizon] = useState('2-7d');
  const [sortBy, setSortBy] = useState('date');

  useEffect(() => {
    api.predictions.list(sortBy === 'profit' ? 'profit' : undefined).then(setPredictions);
    api.stocks.list().then(setStocks);
  }, [sortBy]);

  const handleGenerate = async () => {
    if (!selectedStock) return;
    setLoading(true);
    try {
      await api.predictions.generate({ stock_id: parseInt(selectedStock), horizon: selectedHorizon });
      api.predictions.list(sortBy === 'profit' ? 'profit' : undefined).then(setPredictions);
    } catch (err) {
      alert('Failed to generate prediction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-black tracking-tighter uppercase">Predictions</h1>
          <p className="text-xs text-[#141414]/50 uppercase tracking-widest">AI-Driven Market Intelligence</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setSortBy('date')}
            className={`text-[10px] uppercase tracking-widest font-bold px-3 py-1 border border-[#141414] ${sortBy === 'date' ? 'bg-[#141414] text-[#E4E3E0]' : ''}`}
          >
            Latest
          </button>
          <button 
            onClick={() => setSortBy('profit')}
            className={`text-[10px] uppercase tracking-widest font-bold px-3 py-1 border border-[#141414] ${sortBy === 'profit' ? 'bg-[#141414] text-[#E4E3E0]' : ''}`}
          >
            Max Profit
          </button>
        </div>
      </div>

      <Card title="Generate New Analysis">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="col-header block mb-1">Target Asset</label>
            <select 
              className="w-full bg-white border border-[#141414] p-2 text-sm"
              value={selectedStock}
              onChange={e => setSelectedStock(e.target.value)}
            >
              <option value="">Select Asset</option>
              {stocks.map(s => <option key={s.id} value={s.id}>{s.symbol} - {s.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="col-header block mb-1">Time Horizon</label>
            <select 
              className="w-full bg-white border border-[#141414] p-2 text-sm"
              value={selectedHorizon}
              onChange={e => setSelectedHorizon(e.target.value)}
            >
              <option value="2-7d">Short Term (2-7 Days)</option>
              <option value="1m">Medium Term (1 Month)</option>
              <option value="3-12m">Long Term (3-12 Months)</option>
              <option value="LT">Multi-Year Thesis</option>
            </select>
          </div>
          <Button onClick={handleGenerate} disabled={loading || !selectedStock} className="min-w-[180px]">
            {loading ? 'Analyzing...' : 'Trigger Analysis'}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {predictions.map(p => (
          <Card key={p.id} className="relative overflow-hidden group">
            <div className="flex flex-col md:flex-row justify-between gap-6">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-display font-black tracking-tighter">{p.symbol}</span>
                  <Badge variant={p.direction === 'UP' ? 'success' : p.direction === 'DOWN' ? 'danger' : 'neutral'}>
                    {p.direction} {p.expected_move_p}%
                  </Badge>
                  <Badge>{p.horizon}</Badge>
                </div>
                <p className="text-sm text-[#141414]/70 leading-relaxed italic">
                  "{p.ai_explanation}"
                </p>
                <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-[#141414]/40">
                  <span>Confidence: <span className="text-[#141414] font-bold">{(p.confidence * 100).toFixed(1)}%</span></span>
                  <span>Model: <span className="text-[#141414] font-bold">Gemini 3 Flash</span></span>
                  <span>Date: <span className="text-[#141414] font-bold">{new Date(p.created_at).toLocaleDateString()}</span></span>
                </div>
              </div>
              <div className="flex flex-col justify-center items-end border-l border-[#141414]/10 pl-6 min-w-[120px]">
                <div className="text-[10px] uppercase opacity-50 mb-1">Status</div>
                <div className="flex items-center gap-2">
                  {p.status === 'PENDING' ? (
                    <>
                      <Clock size={14} className="text-amber-600" />
                      <span className="text-xs font-bold uppercase tracking-tighter">Pending</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <span className="text-xs font-bold uppercase tracking-tighter">{p.result}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const Docs = () => {
  const sections = [
    {
      title: "Getting Started",
      icon: Zap,
      content: "FinPredict is an AI-powered financial analysis tool. To begin, ensure your AI provider is configured in the Admin panel. We recommend using Gemini for the best results."
    },
    {
      title: "AI Predictions",
      icon: TrendingUp,
      content: "Our AI models analyze historical price data, sentiment, and macro indicators to predict stock movements. You can generate predictions for various horizons (1D, 1W, 1M)."
    },
    {
      title: "Brokerage Integration",
      icon: Briefcase,
      content: "Connect your Kite account to automatically sync your portfolio. This allows the AI to provide personalized insights based on your actual holdings."
    },
    {
      title: "Configuration Guide",
      icon: Settings,
      content: "In the Admin panel, you can adjust model weights (Technical vs Fundamental) and set your market region. Use the 'Test Connection' feature to verify your API keys."
    }
  ];

  return (
    <div className="space-y-12 max-w-4xl">
      <div className="space-y-4">
        <h2 className="text-4xl font-display font-black uppercase tracking-tighter">Documentation</h2>
        <p className="opacity-60 text-lg">Learn how to maximize your financial insights with FinPredict.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map(s => (
          <Card key={s.title} title={s.title}>
            <div className="flex gap-4">
              <div className="mt-1 text-[#141414]"><s.icon size={20} /></div>
              <p className="text-sm leading-relaxed opacity-80">{s.content}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Frequently Asked Questions">
        <div className="space-y-6">
          <div>
            <h4 className="font-bold text-sm uppercase tracking-widest mb-2">How accurate are the predictions?</h4>
            <p className="text-sm opacity-70">AI predictions are based on historical data and probabilistic models. They should be used as a tool for research, not as direct financial advice.</p>
          </div>
          <div>
            <h4 className="font-bold text-sm uppercase tracking-widest mb-2">Is my data secure?</h4>
            <p className="text-sm opacity-70">We use industry-standard encryption for all API keys and personal data. Your brokerage credentials are never stored directly on our servers.</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

const Admin = () => {
  const { showNotification } = useUI();
  const [configs, setConfigs] = useState<any[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [newStock, setNewStock] = useState({ symbol: '', name: '', sector: '' });
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'Analyst' });
  const [activeSubTab, setActiveSubTab] = useState('config');
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    api.admin.getConfig().then(setConfigs);
    api.stocks.list().then(setStocks);
    api.admin.getUsers().then(setUsers);
    api.admin.getSyncLogs().then(setSyncLogs);
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.stocks.create(newStock);
      api.stocks.list().then(setStocks);
      setNewStock({ symbol: '', name: '', sector: '' });
      showNotification('Asset registered successfully');
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.admin.createUser(newUser);
      api.admin.getUsers().then(setUsers);
      setNewUser({ username: '', password: '', role: 'Analyst' });
      showNotification('User created successfully');
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleSyncKite = async () => {
    setSyncing(true);
    try {
      await api.admin.syncKite();
      refreshData();
      showNotification('Kite sync completed');
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateConfig = async (key: string, value: string) => {
    try {
      await api.admin.updateConfig({ key, value });
      api.admin.getConfig().then(setConfigs);
      showNotification(`Updated ${key.replace(/_/g, ' ')}`);
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleTestConnection = async (category: string) => {
    setTesting(category);
    try {
      const res = await api.admin.testConnection({ category });
      if (res.success) {
        showNotification(res.message);
      } else {
        showNotification(res.message, 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    try {
      const res = await (api.admin as any).fetchModels();
      setAvailableModels(res);
      showNotification('Models fetched successfully');
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setFetchingModels(false);
    }
  };

  const categories = Array.from(new Set(configs.map(c => c.category)));

  const renderConfigInput = (c: any) => {
    const dropdowns: any = {
      'AI_PROVIDER': ['Gemini', 'OpenAI', 'Anthropic'],
      'MARKET_REGION': ['IN', 'US', 'GLOBAL'],
      'NEWS_PROVIDER': ['NewsAPI', 'CryptoPanic', 'AlphaVantage']
    };

    if (c.key === 'AI_MODEL' && availableModels.length > 0) {
      return (
        <select 
          className="flex-1 bg-white border border-[#141414] p-2 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
          value={c.value}
          onChange={(e) => handleUpdateConfig(c.key, e.target.value)}
        >
          {availableModels.map((m: any) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }

    if (dropdowns[c.key]) {
      return (
        <select 
          className="flex-1 bg-white border border-[#141414] p-2 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
          value={c.value}
          onChange={(e) => handleUpdateConfig(c.key, e.target.value)}
        >
          {dropdowns[c.key].map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    const isPassword = c.key.includes('KEY') || c.key.includes('TOKEN') || c.key.includes('SECRET');

    return (
      <input 
        type={isPassword ? "password" : "text"}
        className="flex-1 bg-white border border-[#141414] p-2 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
        defaultValue={c.value}
        onBlur={(e) => handleUpdateConfig(c.key, e.target.value)}
      />
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex gap-4 border-b border-[#141414]/10 pb-4">
        {['config', 'assets', 'users', 'sync'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`text-[10px] uppercase tracking-widest font-bold px-4 py-2 ${activeSubTab === tab ? 'bg-[#141414] text-[#E4E3E0]' : 'opacity-50'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeSubTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {categories.length > 0 ? categories.map((cat: any) => (
            <Card key={cat} title={`${cat} Configuration`}>
              <div className="space-y-4">
                {configs.filter(c => c.category === cat).map(c => (
                  <div key={c.key} className="space-y-1">
                    <label className="text-[10px] uppercase opacity-50 block font-bold">{c.key.replace(/_/g, ' ')}</label>
                    <div className="flex gap-2">
                      {renderConfigInput(c)}
                    </div>
                  </div>
                ))}
                {['AI', 'Brokerage'].includes(cat as string) && (
                  <div className="pt-4 border-t border-[#141414]/5 space-y-2">
                    {cat === 'AI' && (
                      <Button 
                        variant="ghost" 
                        className="w-full text-[10px] border border-[#141414]/10"
                        onClick={handleFetchModels}
                        disabled={fetchingModels}
                      >
                        {fetchingModels ? 'Fetching...' : 'Fetch Available Models'}
                      </Button>
                    )}
                    <Button 
                      variant="secondary" 
                      className="w-full text-[10px]"
                      onClick={() => handleTestConnection(cat as string)}
                      disabled={testing === cat}
                    >
                      {testing === cat ? 'Testing...' : `Test ${cat} Connection`}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )) : (
            <div className="col-span-2 text-center py-12 opacity-50 uppercase tracking-widest text-sm">
              No configurations found. Please check database initialization.
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'assets' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card title="Register Asset">
            <form onSubmit={handleAddStock} className="grid grid-cols-2 gap-4">
              <input 
                placeholder="Symbol" 
                className="bg-white border border-[#141414] p-2 text-sm"
                value={newStock.symbol}
                onChange={e => setNewStock({ ...newStock, symbol: e.target.value.toUpperCase() })}
                required
              />
              <input 
                placeholder="Sector" 
                className="bg-white border border-[#141414] p-2 text-sm"
                value={newStock.sector}
                onChange={e => setNewStock({ ...newStock, sector: e.target.value })}
                required
              />
              <input 
                placeholder="Company Name" 
                className="col-span-2 bg-white border border-[#141414] p-2 text-sm"
                value={newStock.name}
                onChange={e => setNewStock({ ...newStock, name: e.target.value })}
                required
              />
              <Button type="submit" className="col-span-2">Register Asset</Button>
            </form>
          </Card>
          <Card title="Asset List">
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {stocks.map(s => (
                <div key={s.id} className="flex justify-between items-center py-2 border-b border-[#141414]/5">
                  <span className="font-bold">{s.symbol}</span>
                  <span className="text-xs opacity-50">{s.sector}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeSubTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card title="Add New User">
            <form onSubmit={handleAddUser} className="space-y-4">
              <input 
                placeholder="Username" 
                className="w-full bg-white border border-[#141414] p-2 text-sm"
                value={newUser.username}
                onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                required
              />
              <input 
                type="password"
                placeholder="Password" 
                className="w-full bg-white border border-[#141414] p-2 text-sm"
                value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                required
              />
              <select 
                className="w-full bg-white border border-[#141414] p-2 text-sm"
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="Analyst">Analyst</option>
                <option value="Admin">Admin</option>
                <option value="Viewer">Viewer</option>
              </select>
              <Button type="submit" className="w-full">Create User</Button>
            </form>
          </Card>
          <Card title="User Management">
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex justify-between items-center py-2 border-b border-[#141414]/5">
                  <span className="font-bold">{u.username}</span>
                  <Badge>{u.role}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeSubTab === 'sync' && (
        <div className="space-y-8">
          <Card title="External Integrations">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold">Kite (Zerodha)</h4>
                <p className="text-xs opacity-50">Sync portfolio holdings and positions</p>
              </div>
              <Button onClick={handleSyncKite} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>
          </Card>
          <Card title="Sync History">
            <div className="space-y-2">
              {syncLogs.map(log => (
                <div key={log.id} className="flex justify-between items-center py-2 border-b border-[#141414]/5 text-xs">
                  <div className="flex gap-4">
                    <span className="font-mono opacity-50">{new Date(log.timestamp).toLocaleString()}</span>
                    <span className="font-bold">{log.service}</span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <span className="opacity-70">{log.message}</span>
                    <Badge variant={log.status === 'SUCCESS' ? 'success' : 'danger'}>{log.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

const Login = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'Analyst' });
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        await api.auth.register(formData);
        setIsRegister(false);
      } else {
        await login(formData);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div 
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="max-w-md w-full bg-white border border-[#141414] p-10 shadow-[20px_20px_0px_0px_rgba(20,20,20,0.05)]"
      >
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-display font-black tracking-tighter uppercase leading-none mb-2">FinPredict</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-50">Intelligence Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="col-header block mb-1">Username</label>
            <input 
              className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-3 text-sm focus:bg-white transition-all outline-none"
              value={formData.username}
              onChange={e => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="col-header block mb-1">Password</label>
            <input 
              type="password"
              className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-3 text-sm focus:bg-white transition-all outline-none"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>
          {isRegister && (
            <div>
              <label className="col-header block mb-1">Role</label>
              <select 
                className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-3 text-sm focus:bg-white transition-all outline-none"
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="Analyst">Analyst</option>
                <option value="Admin">Admin</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>
          )}

          {error && <div className="text-rose-600 text-xs font-bold flex items-center gap-2"><AlertCircle size={14} /> {error}</div>}

          <Button type="submit" className="w-full py-4 text-lg">
            {isRegister ? 'Create Account' : 'Authenticate'}
          </Button>
        </form>

        <div className="mt-8 pt-8 border-t border-[#141414]/10 text-center">
          <button 
            onClick={() => setIsRegister(!isRegister)}
            className="text-[10px] uppercase tracking-widest font-bold hover:underline"
          >
            {isRegister ? 'Already registered? Login' : 'New analyst? Register'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    api.auth.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (data: any) => {
    const res = await api.auth.login(data);
    setUser(res.user);
  };

  const logout = () => {
    api.auth.logout();
    setUser(null);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-display font-black text-4xl animate-pulse uppercase tracking-tighter">Initializing...</div>
    </div>
  );

  if (!user) return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      <Login />
    </AuthContext.Provider>
  );

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
    { id: 'predictions', label: 'Predictions', icon: TrendingUp },
    { id: 'admin', label: 'Admin', icon: Settings, roles: ['Admin', 'Super Admin'] },
    { id: 'docs', label: 'Docs', icon: BookOpen },
  ];

  return (
    <UIContext.Provider value={{ showNotification }}>
      <AuthContext.Provider value={{ user, login, logout, loading }}>
        <div className="min-h-screen flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-[#141414] text-[#E4E3E0] flex flex-col p-6">
          <div className="mb-12">
            <h1 className="text-3xl font-display font-black tracking-tighter uppercase leading-none">FinPredict</h1>
            <div className="text-[8px] uppercase tracking-[0.4em] opacity-30 mt-1">v1.0.4 Stable</div>
          </div>

          <nav className="flex-1 space-y-2">
            {tabs.filter(t => !t.roles || t.roles.includes(user.role)).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-widest transition-all ${
                  activeTab === tab.id ? 'bg-[#E4E3E0] text-[#141414] font-black' : 'hover:bg-white/5 opacity-60'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6 border-t border-white/10">
            <div className="flex items-center gap-3 mb-6 px-4">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                <UserIcon size={16} />
              </div>
              <div>
                <div className="text-xs font-bold truncate w-24">{user.username}</div>
                <div className="text-[8px] uppercase opacity-50 tracking-widest">{user.role}</div>
              </div>
            </div>
            <button 
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-widest opacity-60 hover:opacity-100 hover:text-rose-400 transition-all"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-12 overflow-y-auto max-w-7xl mx-auto w-full relative">
          <AnimatePresence>
            {notification && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`fixed top-6 right-6 z-[100] px-6 py-3 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex items-center gap-3 ${
                  notification.type === 'success' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
                }`}
              >
                {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span className="text-xs font-bold uppercase tracking-widest">{notification.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'portfolio' && <Portfolio />}
              {activeTab === 'predictions' && <Predictions />}
              {activeTab === 'admin' && <Admin />}
              {activeTab === 'docs' && <Docs />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </AuthContext.Provider>
  </UIContext.Provider>
);
}
