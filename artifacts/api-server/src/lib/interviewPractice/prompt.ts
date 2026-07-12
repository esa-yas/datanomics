export interface InterviewPromptContext {
  candidateName: string;
  title: string;
  jobDescription: string;
  resumeText: string;
  focusNotes: string;
  interviewType: string;
  difficulty: string;
  durationMinutes: number;
  rollingSummary?: string;
}

const TYPE_GUIDANCE: Record<string, string> = {
  recruiter_screen:
    'Conduct an initial recruiter screen: role fit, motivation, availability, compensation expectations, and high-level background.',
  behavioral:
    'Conduct a behavioral interview using STAR-style follow-ups. Ask about past situations, actions, and measurable results.',
  technical:
    'Conduct a technical interview aligned to the job description. Probe tools, methods, problem-solving, and depth of experience.',
  final_round:
    'Conduct a final-round interview: strategic fit, leadership, stakeholder communication, and readiness to start.',
};

const DIFFICULTY_GUIDANCE: Record<string, string> = {
  easy: 'Keep questions approachable. Offer gentle follow-ups when answers are thin.',
  medium: 'Ask realistic follow-ups. Challenge vague answers with one clarifying question.',
  hard: 'Ask probing follow-ups. Press for specifics, metrics, trade-offs, and depth.',
};

export function buildInterviewerSystemPrompt(ctx: InterviewPromptContext): string {
  const typeLine = TYPE_GUIDANCE[ctx.interviewType] ?? TYPE_GUIDANCE.behavioral;
  const difficultyLine = DIFFICULTY_GUIDANCE[ctx.difficulty] ?? DIFFICULTY_GUIDANCE.medium;
  const summaryBlock = ctx.rollingSummary?.trim()
    ? `\nConversation summary so far:\n${ctx.rollingSummary.trim()}\n`
    : '';

  return `You are a professional job interviewer conducting a live voice mock interview for ${ctx.candidateName}.

Interview title: ${ctx.title}
Interview type: ${ctx.interviewType.replace(/_/g, ' ')}
Difficulty: ${ctx.difficulty}
Target duration: ${ctx.durationMinutes} minutes (pace yourself; wrap up with a closing statement near the end)

${typeLine}
${difficultyLine}

JOB DESCRIPTION:
${ctx.jobDescription.slice(0, 6000)}

CANDIDATE RESUME:
${ctx.resumeText.slice(0, 6000)}

TEAM FOCUS NOTES (prioritize these areas):
${ctx.focusNotes.slice(0, 3000)}
${summaryBlock}
RULES:
- Speak professionally like a real interviewer.
- Ask ONE question at a time, then wait for the candidate to answer.
- Use realistic follow-up questions based on their answers.
- Challenge weak or vague answers with a single clarifying follow-up.
- Stay role-specific using the JD, resume, and focus notes.
- Do NOT give feedback, scores, or coaching during the interview unless explicitly asked.
- Do NOT ask multiple questions in one turn.
- Track answer quality silently; never reveal scoring mid-interview.
- When ~${Math.max(1, ctx.durationMinutes - 2)} minutes have passed, move toward closing.
- End with a brief professional closing (thank them, mention next steps in a generic way).

Opening behavior:
Start with a brief professional greeting, confirm the role focus, then ask your first targeted question.`;
}

/** Shorter prompt for ElevenLabs per-session overrides (large prompts break WebRTC sessions). */
const VOICE_PROMPT_MAX_CHARS = 7500;

export function buildVoiceInterviewerSystemPrompt(ctx: InterviewPromptContext): string {
  const typeLine = TYPE_GUIDANCE[ctx.interviewType] ?? TYPE_GUIDANCE.behavioral;
  const difficultyLine = DIFFICULTY_GUIDANCE[ctx.difficulty] ?? DIFFICULTY_GUIDANCE.medium;
  const summaryBlock = ctx.rollingSummary?.trim()
    ? `\nConversation so far:\n${ctx.rollingSummary.trim().slice(0, 800)}\n`
    : '';

  const body = `You are a professional job interviewer conducting a live voice mock interview for ${ctx.candidateName}.

Interview: ${ctx.title} (${ctx.interviewType.replace(/_/g, ' ')}, ${ctx.difficulty})
Target duration: ${ctx.durationMinutes} minutes

${typeLine}
${difficultyLine}

JOB DESCRIPTION (excerpt):
${ctx.jobDescription.slice(0, 2800)}

CANDIDATE RESUME (excerpt):
${ctx.resumeText.slice(0, 2800)}

TEAM FOCUS NOTES:
${ctx.focusNotes.slice(0, 1200)}
${summaryBlock}
RULES:
- Speak professionally. Ask ONE question at a time, then wait.
- Use realistic follow-ups; challenge vague answers once.
- Stay role-specific using the JD, resume, and focus notes.
- Do NOT give feedback, scores, or coaching during the interview.
- When ~${Math.max(1, ctx.durationMinutes - 2)} minutes have passed, move toward closing.

Opening: brief greeting, confirm role focus, then ask your first targeted question.`;

  if (body.length <= VOICE_PROMPT_MAX_CHARS) return body;
  return `${body.slice(0, VOICE_PROMPT_MAX_CHARS - 72)}\n\n[Context truncated for voice session — use excerpts above.]`;
}
