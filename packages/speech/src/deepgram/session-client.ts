import type { MeetingId } from '@kms/domain';
import type { DeepgramLiveAdapter } from './live-adapter.js';

interface SessionCredential {
  token: string;
  meetingId: MeetingId;
  provider: 'deepgram';
  expiresAt: string;
  config: {
    language: 'vi' | 'en';
    diarization: boolean;
    model: string;
  };
}

export interface DeepgramSessionClientOptions {
  apiBaseUrl: string;
  ownerId: string;
  meetingId: MeetingId;
  sourceId: string;
  runId: string;
  partId: string;
  language: 'vi' | 'en';
  diarization: boolean;
  fetchImpl?: typeof fetch;
  adapterFactory: () => DeepgramLiveAdapter;
}

export interface ConnectedDeepgramSession {
  adapter: DeepgramLiveAdapter;
  expiresAt: string;
}

function isCredential(value: unknown): value is SessionCredential {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SessionCredential>;
  return (
    typeof candidate.token === 'string' &&
    candidate.token.length > 0 &&
    candidate.provider === 'deepgram' &&
    typeof candidate.meetingId === 'string' &&
    typeof candidate.expiresAt === 'string' &&
    !!candidate.config &&
    (candidate.config.language === 'vi' || candidate.config.language === 'en') &&
    typeof candidate.config.diarization === 'boolean' &&
    typeof candidate.config.model === 'string' &&
    candidate.config.model.length > 0
  );
}

export function createDeepgramSessionClient(
  options: DeepgramSessionClientOptions,
): { connect(): Promise<ConnectedDeepgramSession> } {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async connect() {
      const baseUrl = options.apiBaseUrl.replace(/\/$/, '');
      let response: Response;
      try {
        response = await fetchImpl(
          `${baseUrl}/v1/meetings/${encodeURIComponent(options.meetingId)}/speech-sessions`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              language: options.language,
              sourceId: options.sourceId,
              diarization: options.diarization,
            }),
          },
        );
      } catch {
        throw new Error('Deepgram session unavailable');
      }

      if (!response.ok) {
        throw new Error('Deepgram session unavailable');
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error('Deepgram session unavailable');
      }
      if (!isCredential(payload) || payload.meetingId !== options.meetingId) {
        throw new Error('Deepgram session unavailable');
      }
      if (payload.config.language !== options.language) {
        throw new Error('Deepgram session unavailable');
      }

      const adapter = options.adapterFactory();
      await adapter.connect({
        ownerId: options.ownerId,
        meetingId: options.meetingId,
        runId: options.runId,
        partId: options.partId,
        language: payload.config.language,
        diarization: payload.config.diarization,
        brokeredToken: payload.token,
        model: payload.config.model,
      });
      return { adapter, expiresAt: payload.expiresAt };
    },
  };
}
