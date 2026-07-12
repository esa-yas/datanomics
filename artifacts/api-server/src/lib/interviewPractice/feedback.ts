import { getSupabaseAdmin } from '../supabaseAdmin';
import { logger } from '../logger';
import { interviewPracticeEnv } from './env';
import type { InterviewSessionRow } from './sessions';
import { getSessionMessages, markSessionCompleted, updateRollingSummary } from './sessions';

interface FeedbackReport {
  overall_score: number;
  communication_score: number;
  technical_score: number;
  jd_alignment_score: number;
  confidence_score: number;
  strengths: string[];
  weaknesses: string[];
  missed_keywords: string[];
  suggested_improvements: string[];
  recommended_practice: string[];
  final_summary: string;
  hiring_readiness: 'low' | 'medium' | 'high';
}

const FEEDBACK_MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash-lite'];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function feedbackModels(): string[] {
  const primary = interviewPracticeEnv.geminiFeedbackModel;
  const seen = new Set<string>();
  return [primary, ...FEEDBACK_MODEL_FALLBACKS].filter((m) => {
    if (seen.has(m)) return false;
    seen.add(m);
    return true;
  });
}

async function geminiJson<T>(system: string, user: string): Promise<T> {
  const key = interviewPracticeEnv.geminiApiKey;
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  let lastError = 'Gemini request failed';
  for (const model of feedbackModels()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': key,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: user }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      if (res.status === 429 || res.status === 503) {
        lastError = `Rate limited (${res.status})`;
        await sleep(3000 + attempt * 4000);
        continue;
      }

      if (!res.ok) {
        lastError = await res.text();
        break;
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = 'Empty feedback response';
        break;
      }
      return JSON.parse(text) as T;
    }
  }

  throw new Error(lastError);
}

function buildTranscript(messages: Array<{ role: string; message_text: string }>): string {
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${m.message_text}`)
    .join('\n\n')
    .slice(0, 24000);
}

function heuristicFeedback(
  session: InterviewSessionRow,
  messages: Array<{ role: string; message_text: string }>,
): FeedbackReport {
  const candidateLines = messages.filter((m) => m.role === 'candidate');
  const aiLines = messages.filter((m) => m.role === 'ai');
  const candidateWords = candidateLines.join(' ').split(/\s+/).filter(Boolean).length;
  const base = Math.min(85, 35 + candidateLines.length * 8 + Math.min(candidateWords / 20, 25));

  const jdKeywords = session.job_description
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 4)
    .slice(0, 30);
  const spoken = candidateLines.join(' ').toLowerCase();
  const matched = jdKeywords.filter((k) => spoken.includes(k));

  return {
    overall_score: Math.round(base),
    communication_score: Math.round(base),
    technical_score: Math.round(base - 5),
    jd_alignment_score: Math.round(Math.min(90, 40 + matched.length * 5)),
    confidence_score: Math.round(base),
    strengths:
      candidateLines.length > 2
        ? ['Participated in the full conversation', 'Provided spoken responses to interviewer questions']
        : ['Completed the practice session'],
    weaknesses:
      candidateLines.length < 3
        ? ['Limited spoken responses — practice answering with more detail and examples']
        : ['Some answers could include more metrics and role-specific keywords from the JD'],
    missed_keywords: jdKeywords.filter((k) => !spoken.includes(k)).slice(0, 8),
    suggested_improvements: [
      'Use STAR format: Situation, Task, Action, Result',
      'Reference tools and outcomes mentioned in the job description',
    ],
    recommended_practice: [
      `Re-run a ${session.interview_type.replace(/_/g, ' ')} session with the same JD`,
      'Practice 60-second answers for your top 5 likely questions',
    ],
    final_summary: `This ${session.duration_minutes}-minute practice session included ${aiLines.length} interviewer prompts and ${candidateLines.length} candidate responses. ${
      matched.length > 0
        ? `You referenced ${matched.length} JD-relevant terms.`
        : 'Try weaving more job-description keywords into your answers.'
    } AI scoring was unavailable (API limit), so this report uses transcript-based heuristics.`,
    hiring_readiness: base >= 70 ? 'medium' : 'low',
  };
}

export async function generateRollingSummary(
  sessionId: string,
  recentMessages: Array<{ role: string; text: string }>,
  priorSummary: string,
): Promise<string> {
  const key = interviewPracticeEnv.geminiApiKey;
  if (!key || recentMessages.length === 0) return priorSummary;

  const model = feedbackModels()[0];
  const chunk = recentMessages
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
    .slice(-6000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': key,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Summarize this mock interview conversation for interviewer context. Keep under 1200 characters. Prior summary:\n${priorSummary}\n\nNew turns:\n${chunk}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
        }),
      },
    );
    if (!res.ok) return priorSummary;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return priorSummary;
    await updateRollingSummary(sessionId, text);
    return text;
  } catch {
    return priorSummary;
  }
}

export async function generateInterviewFeedback(
  session: InterviewSessionRow,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const messages = await getSessionMessages(session.id);
  const transcript = buildTranscript(
    messages as Array<{ role: string; message_text: string }>,
  );

  if (!transcript.trim()) {
    await supabase.from('interview_results').upsert(
      {
        interview_session_id: session.id,
        overall_score: 0,
        communication_score: 0,
        technical_score: 0,
        jd_alignment_score: 0,
        confidence_score: 0,
        strengths: [],
        weaknesses: ['No transcript captured'],
        missed_keywords: [],
        suggested_improvements: ['Retry the interview with microphone enabled'],
        recommended_practice: [],
        final_summary: 'Interview ended without captured responses.',
        hiring_readiness: 'low',
      },
      { onConflict: 'interview_session_id' },
    );
    await markSessionCompleted(session.id);
    return;
  }

  const system = `You are an expert interview coach. Analyze a completed mock interview and return JSON only.`;

  const user = `Interview: ${session.title}
Type: ${session.interview_type}
Difficulty: ${session.difficulty}
Duration target: ${session.duration_minutes} minutes

JOB DESCRIPTION:
${session.job_description.slice(0, 4000)}

RESUME:
${session.resume_text.slice(0, 4000)}

FOCUS NOTES:
${session.focus_notes.slice(0, 2000)}

TRANSCRIPT:
${transcript}

Return JSON:
{
  "overall_score": 1-100,
  "communication_score": 1-100,
  "technical_score": 1-100,
  "jd_alignment_score": 1-100,
  "confidence_score": 1-100,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "missed_keywords": ["..."],
  "suggested_improvements": ["..."],
  "recommended_practice": ["..."],
  "final_summary": "2-4 paragraphs",
  "hiring_readiness": "low"|"medium"|"high"
}`;

  try {
    const aiReport = await Promise.race([
      geminiJson<FeedbackReport>(system, user),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
    ]);

    const report =
      aiReport ??
      heuristicFeedback(session, messages as Array<{ role: string; message_text: string }>);

    if (!aiReport) {
      logger.warn({ sessionId: session.id }, 'AI feedback timed out — using fast heuristic report');
    }

    await supabase.from('interview_results').upsert(
      {
        interview_session_id: session.id,
        overall_score: clampScore(report.overall_score),
        communication_score: clampScore(report.communication_score),
        technical_score: clampScore(report.technical_score),
        jd_alignment_score: clampScore(report.jd_alignment_score),
        confidence_score: clampScore(report.confidence_score),
        strengths: report.strengths ?? [],
        weaknesses: report.weaknesses ?? [],
        missed_keywords: report.missed_keywords ?? [],
        suggested_improvements: report.suggested_improvements ?? [],
        recommended_practice: report.recommended_practice ?? [],
        final_summary: report.final_summary ?? '',
        hiring_readiness: report.hiring_readiness ?? 'medium',
      },
      { onConflict: 'interview_session_id' },
    );
  } catch (err) {
    logger.warn({ err, sessionId: session.id }, 'AI feedback failed — using heuristic report');
    const report = heuristicFeedback(
      session,
      messages as Array<{ role: string; message_text: string }>,
    );
    await supabase.from('interview_results').upsert(
      {
        interview_session_id: session.id,
        overall_score: report.overall_score,
        communication_score: report.communication_score,
        technical_score: report.technical_score,
        jd_alignment_score: report.jd_alignment_score,
        confidence_score: report.confidence_score,
        strengths: report.strengths,
        weaknesses: report.weaknesses,
        missed_keywords: report.missed_keywords,
        suggested_improvements: report.suggested_improvements,
        recommended_practice: report.recommended_practice,
        final_summary: report.final_summary,
        hiring_readiness: report.hiring_readiness,
      },
      { onConflict: 'interview_session_id' },
    );
  }

  await markSessionCompleted(session.id);
}

function clampScore(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 50;
  return Math.min(100, Math.max(1, Math.round(v)));
}
