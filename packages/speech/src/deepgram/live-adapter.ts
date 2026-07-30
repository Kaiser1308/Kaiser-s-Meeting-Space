import type { MeetingId, SpeechEvent } from '@kms/domain';

export interface DeepgramSocket {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
}

export type DeepgramSocketFactory = (url: string, protocols: string[]) => DeepgramSocket;

export interface DeepgramLiveConfig {
  ownerId: string;
  meetingId: MeetingId;
  runId: string;
  partId: string;
  language: 'vi' | 'en';
  diarization: boolean;
  brokeredToken: string;
  model?: string;
}

export interface DeepgramLiveAdapter {
  connect(config: DeepgramLiveConfig): Promise<void>;
  sendAudio(chunk: Uint8Array): void;
  onEvent(cb: (event: SpeechEvent) => void): () => void;
  close(): Promise<void>;
}

type LiveSpeechEvent = SpeechEvent & { isSimulated: false };

type DeepgramResult = {
  type?: unknown;
  request_id?: unknown;
  is_final?: unknown;
  start?: unknown;
  duration?: unknown;
  channel?: {
    alternatives?: Array<{
      transcript?: unknown;
      confidence?: unknown;
      words?: Array<{ start?: unknown; end?: unknown; speaker?: unknown }>;
    }>;
  };
};

function defaultSocketFactory(url: string, protocols: string[]): DeepgramSocket {
  const WebSocketCtor = (
    globalThis as unknown as {
      WebSocket?: new (url: string, protocols: string[]) => DeepgramSocket;
    }
  ).WebSocket;
  if (!WebSocketCtor) {
    throw new Error('Deepgram WebSocket unavailable');
  }
  return new WebSocketCtor(url, protocols) as unknown as DeepgramSocket;
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeSafeError(config: DeepgramLiveConfig, code: string): LiveSpeechEvent {
  return {
    kind: 'safe_error',
    eventId: `${config.runId}:${config.partId}:${code}`,
    meetingId: config.meetingId,
    ownerId: config.ownerId,
    runId: config.runId,
    partId: config.partId,
    provider: 'deepgram',
    occurredAt: new Date().toISOString(),
    isSimulated: false,
    payload: {
      code,
      message: 'Deepgram connection failed',
      category: 'provider',
      retryable: true,
    },
  };
}

function normalizeResult(
  config: DeepgramLiveConfig,
  result: DeepgramResult,
  sequence: number,
): LiveSpeechEvent | null {
  if (result.type !== 'Results') return null;
  const alternative = result.channel?.alternatives?.[0];
  const text = typeof alternative?.transcript === 'string' ? alternative.transcript.trim() : '';
  if (!text) return null;

  const words = alternative?.words ?? [];
  const fallbackStart = asFiniteNumber(result.start, 0);
  const fallbackEnd = fallbackStart + asFiniteNumber(result.duration, 0);
  const start = asFiniteNumber(words[0]?.start, fallbackStart);
  const end = asFiniteNumber(words.at(-1)?.end, fallbackEnd);
  const startMs = Math.max(0, Math.round(start * 1000));
  const endMs = Math.max(startMs + 1, Math.round(end * 1000));
  const confidence = asFiniteNumber(alternative?.confidence, -1);
  const speaker = asFiniteNumber(words[0]?.speaker, -1);
  const providerEventId = typeof result.request_id === 'string' ? result.request_id : undefined;
  const base = {
    meetingId: config.meetingId,
    ownerId: config.ownerId,
    runId: config.runId,
    partId: config.partId,
    provider: 'deepgram' as const,
    providerEventId,
    sequenceInPart: sequence,
    occurredAt: new Date().toISOString(),
    isSimulated: false as const,
  };

  if (result.is_final === true) {
    return {
      ...base,
      kind: 'final_segment',
      eventId: `${config.runId}:${config.partId}:final:${sequence}`,
      payload: {
        text,
        speakerId: speaker >= 0 ? `speaker-${speaker}` : 'unknown',
        startMs,
        endMs,
        ...(confidence >= 0 ? { confidence: Math.min(1, confidence) } : {}),
        sequenceInPart: sequence,
      },
    } as LiveSpeechEvent;
  }

  return {
    ...base,
    kind: 'interim',
    eventId: `${config.runId}:${config.partId}:interim:${sequence}`,
    payload: { text, startMs, endMs },
  } as LiveSpeechEvent;
}

export function createDeepgramLiveAdapter(
  socketFactory: DeepgramSocketFactory = defaultSocketFactory,
): DeepgramLiveAdapter {
  let socket: DeepgramSocket | null = null;
  let config: DeepgramLiveConfig | null = null;
  let sequence = 0;
  const listeners = new Set<(event: SpeechEvent) => void>();

  const emit = (event: SpeechEvent) => {
    for (const listener of listeners) listener(event);
  };

  return {
    connect(nextConfig) {
      if (!nextConfig.brokeredToken.trim()) {
        return Promise.reject(new Error('Deepgram token unavailable'));
      }
      if (socket) return Promise.reject(new Error('Deepgram stream already connected'));

      config = nextConfig;
      sequence = 0;
      const query = new URLSearchParams({
        model: nextConfig.model ?? 'nova-3',
        language: nextConfig.language,
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
        interim_results: 'true',
        smart_format: 'true',
        diarize: String(nextConfig.diarization),
      });
      const nextSocket = socketFactory(`wss://api.deepgram.com/v1/listen?${query}`, [
        'token',
        nextConfig.brokeredToken,
      ]);
      socket = nextSocket;

      return new Promise<void>((resolve, reject) => {
        let settled = false;
        nextSocket.onopen = () => {
          settled = true;
          resolve();
        };
        nextSocket.onerror = () => {
          if (!settled) {
            settled = true;
            socket = null;
            config = null;
            reject(new Error('Deepgram connection failed'));
          }
          if (config) emit(makeSafeError(config, 'DEEPGRAM_SOCKET_ERROR'));
        };
        nextSocket.onclose = () => {
          socket = null;
          config = null;
        };
        nextSocket.onmessage = (message) => {
          if (!config) return;
          try {
            const result = JSON.parse(message.data) as DeepgramResult;
            const event = normalizeResult(config, result, sequence);
            if (event) {
              sequence += 1;
              emit(event);
            }
          } catch {
            emit(makeSafeError(config, 'DEEPGRAM_INVALID_MESSAGE'));
          }
        };
      });
    },

    sendAudio(chunk) {
      if (!socket) throw new Error('Deepgram stream is not connected');
      socket.send(chunk);
    },

    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async close() {
      const current = socket;
      if (!current) return;
      current.send(JSON.stringify({ type: 'Finalize' }));
      current.close(1000, 'client_close');
      socket = null;
      config = null;
    },
  };
}
