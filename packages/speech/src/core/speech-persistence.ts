import { type SpeechEvent } from '@kms/domain';

export type { SpeechEvent };

export interface SpeechEventPersistence {
  persist(event: SpeechEvent, contentHash: string): Promise<'inserted' | 'duplicate' | 'conflict'>;
  getByRun(runId: string, ownerId: string): Promise<SpeechEvent[]>;
  getByRunAndPart(runId: string, partId: string, ownerId: string): Promise<SpeechEvent[]>;
}

export class InMemorySpeechEventPersistence implements SpeechEventPersistence {
  private events: SpeechEvent[] = [];
  private dedupeIndex = new Set<string>();

  private dedupeKey(event: SpeechEvent): string {
    return [
      event.runId,
      event.partId ?? 'null',
      event.provider,
      event.providerEventId ?? 'null',
      event.kind,
      event.sequenceInPart ?? 'null',
    ].join('::');
  }

  async persist(
    event: SpeechEvent,
    _contentHash: string,
  ): Promise<'inserted' | 'duplicate' | 'conflict'> {
    const key = this.dedupeKey(event);

    if (this.dedupeIndex.has(key)) {
      return 'duplicate';
    }

    this.dedupeIndex.add(key);
    this.events.push(event);
    return 'inserted';
  }

  async getByRun(runId: string, ownerId: string): Promise<SpeechEvent[]> {
    return this.events
      .filter((e) => e.runId === runId && e.ownerId === ownerId)
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  }

  async getByRunAndPart(runId: string, partId: string, ownerId: string): Promise<SpeechEvent[]> {
    return this.events
      .filter((e) => e.runId === runId && e.partId === partId && e.ownerId === ownerId)
      .sort((a, b) => (a.sequenceInPart ?? 0) - (b.sequenceInPart ?? 0));
  }
}

export class OwnerMismatchError extends Error {
  constructor() {
    super('SPEECH_RUN_OWNER_MISMATCH');
    this.name = 'OwnerMismatchError';
  }
}

export class MeetingMismatchError extends Error {
  constructor() {
    super('SPEECH_RUN_MEETING_MISMATCH');
    this.name = 'MeetingMismatchError';
  }
}
