import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { listOpportunities, runDiscoveryScan } from '../services/discovery.js';

export const discoveryRouter = Router();
discoveryRouter.use(authenticate);

discoveryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const dir = req.query.direction as 'BUY' | 'HOLD' | 'AVOID' | undefined;
    res.json(listOpportunities(limit, dir));
  }),
);

discoveryRouter.post(
  '/scan',
  asyncHandler(async (req, res) => {
    const r = await runDiscoveryScan(req.user!.id);
    res.json(r);
  }),
);
