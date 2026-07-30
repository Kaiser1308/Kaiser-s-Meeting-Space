import type { SpeechEvent, MeetingId } from '@kms/domain';

export interface DeepgramRealtimeAdapter {
  connect(config: {
    language: 'vi' | 'en';
    diarization: boolean;
    brokeredToken: string;
  }): Promise<void>;
  sendAudio(chunk: Uint8Array): void;
  onEvent(cb: (event: SpeechEvent) => void): () => void;
  close(): Promise<void>;
}

interface AdapterState {
  ownerId: string;
  meetingId: MeetingId;
  language: 'vi' | 'en';
}

function parseBrokeredToken(token: string): { ownerId: string; meetingId: MeetingId } {
  const withoutPrefix = token.slice('brokered-'.length);
  const lastDash = withoutPrefix.lastIndexOf('-');
  const main = withoutPrefix.slice(0, lastDash);
  const meetingId = main.slice(-36) as MeetingId;
  const ownerId = main.slice(0, -37);
  return { ownerId, meetingId };
}

type MockSpeechEvent = SpeechEvent & { isSimulated: true };

function emitInterim(state: AdapterState, sequence: number): MockSpeechEvent {
  const startMs = sequence * 100;
  const endMs = startMs + 80;
  return {
    kind: 'interim' as const,
    eventId: 'evt-interim',
    meetingId: state.meetingId,
    ownerId: state.ownerId,
    runId: 'mock-run',
    provider: 'deepgram' as const,
    partId: 'mock-part',
    sequenceInPart: sequence,
    payload: {
      text: `[mock interim ${state.language}]`,
      startMs,
      endMs,
    },
    occurredAt: new Date().toISOString(),
    isSimulated: true,
  };
}

function emitFinal(state: AdapterState, sequence: number): MockSpeechEvent {
  const startMs = sequence * 100;
  const endMs = startMs + 80;
  return {
    kind: 'final_segment' as const,
    eventId: 'evt-final',
    meetingId: state.meetingId,
    ownerId: state.ownerId,
    runId: 'mock-run',
    provider: 'deepgram' as const,
    partId: 'mock-part',
    sequenceInPart: sequence,
    payload: {
      text: `[mock final ${state.language}]`,
      speakerId: 'speaker-0',
      startMs,
      endMs,
      sequenceInPart: sequence,
    },
    occurredAt: new Date().toISOString(),
    isSimulated: true,
  };
}

function emitSpeakerUpdate(state: AdapterState, sequence: number): MockSpeechEvent {
  return {
    kind: 'speaker_update' as const,
    eventId: 'evt-speaker',
    meetingId: state.meetingId,
    ownerId: state.ownerId,
    runId: 'mock-run',
    provider: 'deepgram' as const,
    partId: 'mock-part',
    sequenceInPart: sequence,
    payload: {
      speakerId: 'speaker-0',
      label: 'Speaker 1',
    },
    occurredAt: new Date().toISOString(),
    isSimulated: true,
  };
}

export function createMockDeepgramAdapter(): DeepgramRealtimeAdapter {
  let state: AdapterState | null = null;
  let closed = false;
  let sequence = 0;
  const listeners = new Set<(event: SpeechEvent) => void>();

  return {
    async connect(config) {
      const { ownerId, meetingId } = parseBrokeredToken(config.brokeredToken);
      state = {
        ownerId,
        meetingId,
        language: config.language,
      };
      closed = false;
    },

    sendAudio(_chunk: Uint8Array) {
      if (closed || !state) return;
      const currentState = state;
      const seq = sequence++;

      const events: MockSpeechEvent[] = [
        emitInterim(currentState, seq),
        emitFinal(currentState, seq),
        emitSpeakerUpdate(currentState, seq),
      ];

      for (const event of events) {
        for (const cb of listeners) {
          cb(event);
        }
      }
    },

    onEvent(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    async close() {
      closed = true;
      state = null;
    },
  };
}
