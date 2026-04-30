import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { listSessions, getMessages, sendMessage } from '../services/chat.js';

export const chatRouter = Router();
chatRouter.use(authenticate);

chatRouter.get('/sessions', (req, res) => {
  res.json(listSessions(req.user!.id));
});

chatRouter.get('/sessions/:id', (req, res) => {
  res.json(getMessages(Number(req.params.id), req.user!.id));
});

const SendSchema = z.object({
  session_id: z.coerce.number().int().positive().nullable().optional(),
  content: z.string().min(1).max(4000),
});

chatRouter.post(
  '/send',
  validate(SendSchema),
  asyncHandler(async (req, res) => {
    const { session_id, content } = req.body as z.infer<typeof SendSchema>;
    const out = await sendMessage(req.user!.id, session_id ?? null, content);
    res.json(out);
  }),
);
