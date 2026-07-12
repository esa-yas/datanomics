import { VoiceConversation } from '@elevenlabs/client';

type ErrorSocketEvent = {
  error_event?: {
    error_type?: string;
    message?: string;
    reason?: string;
    code?: unknown;
    debug_message?: string;
    details?: unknown;
  };
};

/** @elevenlabs/client crashes if error_event is missing — patch before any session starts. */
export function patchElevenLabsClient(): void {
  const baseProto = Object.getPrototypeOf(VoiceConversation.prototype) as {
    handleErrorEvent: (event: ErrorSocketEvent) => void;
    __errorPatched?: boolean;
  };

  if (baseProto.__errorPatched) return;

  const original = baseProto.handleErrorEvent;
  baseProto.handleErrorEvent = function handleErrorEventSafe(
    this: { onError?: (message: string, context?: unknown) => void },
    event: ErrorSocketEvent,
  ) {
    if (!event?.error_event) {
      const raw =
        event && typeof event === 'object'
          ? JSON.stringify(event).slice(0, 320)
          : String(event ?? 'empty error payload');
      this.onError?.(
        `Voice connection error. Refresh the page and start again. (${raw})`,
        event,
      );
      return;
    }
    return original.call(this, event);
  };
  baseProto.__errorPatched = true;
}
