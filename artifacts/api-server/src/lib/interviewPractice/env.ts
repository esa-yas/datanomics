function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const interviewPracticeEnv = {
  get geminiApiKey() {
    return optional('GEMINI_API_KEY', optional('VITE_GEMINI_API_KEY'));
  },
  get geminiLiveModel() {
    return optional(
      'GEMINI_LIVE_MODEL',
      optional('VITE_GEMINI_LIVE_MODEL', 'gemini-2.5-flash-native-audio-preview-12-2025'),
    );
  },
  get geminiFeedbackModel() {
    return optional('GEMINI_FEEDBACK_MODEL', optional('VITE_GEMINI_MODEL', 'gemini-2.5-flash'));
  },
  get interviewLinkBaseUrl() {
    return optional(
      'INTERVIEW_LINK_BASE_URL',
      optional('GMAIL_CONNECT_LINK_BASE_URL', 'http://localhost:5173'),
    ).replace(/\/$/, '');
  },
  get defaultLinkTtlDays() {
    const n = Number(optional('INTERVIEW_LINK_TTL_DAYS', '7'));
    return Number.isFinite(n) && n > 0 ? n : 7;
  },
  get elevenLabsApiKey() {
    return optional('ELEVENLABS_API_KEY');
  },
  get speechEngineId() {
    return optional('ELEVENLABS_SPEECH_ENGINE_ID');
  },
  get interviewAgentId() {
    return optional('ELEVENLABS_INTERVIEW_AGENT_ID');
  },
  /** Cheap hosted-agent LLM for voice interviews (ElevenLabs bills this). */
  get elevenLabsAgentLlm() {
    return optional('ELEVENLABS_AGENT_LLM', 'gemini-2.0-flash');
  },
  /** Public wss URL ElevenLabs uses to reach our Speech Engine WebSocket (ngrok in local dev). */
  get speechEnginePublicWsUrl() {
    const explicit = optional('INTERVIEW_SPEECH_WS_PUBLIC_URL');
    if (explicit) return explicit.replace(/\/$/, '');

    const apiBase = optional('API_SERVER_URL', optional('VITE_API_URL'));
    if (!apiBase) return '';
    try {
      const u = new URL(apiBase);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return '';
      const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${u.host}/api/interview-practice/speech-engine/ws`;
    } catch {
      return '';
    }
  },
};
