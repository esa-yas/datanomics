import { Router, type IRouter, type Response } from 'express';
import { requireStaffAuth, type AuthedRequest } from '../middleware/auth';
import { generateRecruiterReply } from '../lib/recruiterReply';
import { REPLY_INTENT_OPTIONS, type ReplyIntent } from '../lib/replyIntents';

const router: IRouter = Router();

const VALID_INTENTS = new Set(REPLY_INTENT_OPTIONS.map((o) => o.value));

/** POST /api/extension/recruiter-reply — authenticated AI reply for Chrome extension */
router.post('/extension/recruiter-reply', requireStaffAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const {
      conversation,
      candidateName,
      targetRole,
      workAuth,
      channel,
      subject,
      extraNotes,
      intent,
    } = req.body as {
      conversation?: string;
      candidateName?: string;
      targetRole?: string;
      workAuth?: string;
      channel?: string;
      subject?: string;
      extraNotes?: string;
      intent?: ReplyIntent;
    };

    if (!conversation?.trim()) {
      res.status(400).json({ error: 'conversation is required' });
      return;
    }
    if (!candidateName?.trim()) {
      res.status(400).json({ error: 'candidateName is required' });
      return;
    }

    const replyIntent: ReplyIntent =
      intent && VALID_INTENTS.has(intent) ? intent : 'interested';

    const reply = await generateRecruiterReply(
      {
        conversation: conversation.trim(),
        candidateName: candidateName.trim(),
        targetRole: targetRole?.trim() || 'Professional',
        workAuth: workAuth?.trim() || 'Not specified',
        channel: channel || 'email',
        subject: subject?.trim(),
        extraNotes: extraNotes?.trim(),
      },
      replyIntent,
    );

    res.json(reply);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Reply generation failed',
    });
  }
});

/** GET /api/extension/intents — reply intent options for extension UI */
router.get('/extension/intents', requireStaffAuth, (_req, res) => {
  res.json({ intents: REPLY_INTENT_OPTIONS });
});

export default router;
