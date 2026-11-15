// AI panel chat endpoint.
import { Router } from 'express';
import { authRequired } from '../auth.js';
import { answerQuestion } from '../ai/assistant.js';

const router = Router();
router.use(authRequired);

router.post('/chat', async (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'Ask a question first.' });
  if (question.length > 1000) return res.status(400).json({ error: 'Keep it under 1000 characters.' });
  const clientId = req.body?.clientId ? Number(req.body.clientId) : null;
  const conversationId = req.body?.conversationId ? Number(req.body.conversationId) : null;
  try {
    const out = await answerQuestion(question, { user: req.user, clientId, conversationId });
    res.json(out);
  } catch (err) {
    console.error('[ai] chat failed:', err);
    res.status(500).json({ error: 'The AI panel hit an unexpected error. Please try again.' });
  }
});

export default router;
