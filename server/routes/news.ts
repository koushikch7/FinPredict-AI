import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { fetchMarketNews, persistNews, recentNews } from '../services/news.js';

export const newsRouter = Router();
newsRouter.use(authenticate);

newsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const symbols = (req.query.symbols as string | undefined)?.split(',').filter(Boolean) ?? [];
    const cached = recentNews(20);
    if (cached.length > 0 && symbols.length === 0) {
      return res.json(cached);
    }
    const fresh = await fetchMarketNews(symbols);
    persistNews(fresh);
    res.json(fresh);
  }),
);
