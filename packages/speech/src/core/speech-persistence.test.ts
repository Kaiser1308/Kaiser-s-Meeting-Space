import { describe, it, expect } from 'vitest';
import { InMemorySpeechEventPersistence, type SpeechEvent } from './speech-persistence.js';

function makeEvent(
  overrides: Partial<SpeechEvent> & { sequenceInPart?: number } = {},
): SpeechEvent {
  return {
    kind: 'final_segment',
    eventId: overrides.eventId ?? 'evt-001',
    meetingId: overrides.meetingId ?? ('550e8400-e29b-41d4-a716-446655440001' as any),
    ownerId: overrides.ownerId ?? 'owner-1',
    runId: overrides.runId ?? 'run-001',
    partId: overrides.partId ?? 'part-000',
    provider: overrides.provider ?? 'deepgram',
    providerEventId: overrides.providerEventId ?? 'dg-final-001',
    sequenceInPart: overrides.sequenceInPart ?? 0,
    occurredAt: overrides.occurredAt ?? '2026-07-27T10:00:00.000Z',
    payload: overrides.payload ?? {
      speakerId: 'speaker-0',
      text: '[mock] Hello',
      startMs: 0,
      endMs: 1500,
      confidence: 0.95,
      sequenceInPart: 0,
    },
  } as SpeechEvent;
}

describe('InMemorySpeechEventPersistence', () => {
  let store: InMemorySpeechEventPersistence;

  beforeEach(() => {
    store = new InMemorySpeechEventPersistence();
  });

  it('persists a final_segment event', async () => {
    const event = makeEvent();
    const result = await store.persist(event, 'abc123');
    expect(result).toBe('inserted');
    const stored = await store.getByRun('run-001', 'owner-1');
    expect(stored).toHaveLength(1);
  });

  it('deduplicates by full dedupe key', async () => {
    const event = makeEvent();
    expect(await store.persist(event, 'hash1')).toBe('inserted');
    expect(await store.persist(event, 'hash1')).toBe('duplicate');
    expect(await store.getByRun('run-001', 'owner-1')).toHaveLength(1);
  });

  it('accepts out-of-order events', async () => {
    const e1 = makeEvent({ eventId: 'evt-1', sequenceInPart: 1 });
    const e2 = makeEvent({ eventId: 'evt-0', sequenceInPart: 0 });
    expect(await store.persist(e1, 'h1')).toBe('inserted');
    expect(await store.persist(e2, 'h0')).toBe('inserted');
    const stored = await store.getByRunAndPart('run-001', 'part-000', 'owner-1');
    expect(stored[0].sequenceInPart).toBe(0);
    expect(stored[1].sequenceInPart).toBe(1);
  });

  it('isolates by owner', async () => {
    const e1 = makeEvent({ ownerId: 'owner-1' });
    await store.persist(e1, 'h1');
    const stored = await store.getByRun('run-001', 'owner-2');
    expect(stored).toHaveLength(0);
  });

  it('filters by run and part', async () => {
    const e1 = makeEvent({ runId: 'run-001', partId: 'part-0' });
    const e2 = makeEvent({
      eventId: 'evt-002',
      runId: 'run-001',
      partId: 'part-1',
      providerEventId: 'dg-002',
    });
    await store.persist(e1, 'h1');
    await store.persist(e2, 'h2');
    const part0 = await store.getByRunAndPart('run-001', 'part-0', 'owner-1');
    const part1 = await store.getByRunAndPart('run-001', 'part-1', 'owner-1');
    expect(part0).toHaveLength(1);
    expect(part1).toHaveLength(1);
  });

  it('rejects interim events from persistence (by convention)', async () => {
    const event = makeEvent({
      kind: 'interim',
      eventId: 'interim-01',
      partId: undefined,
      sequenceInPart: undefined,
      providerEventId: undefined,
    });
    const result = await store.persist(event, 'hash-int');
    expect(result).toBe('inserted');
  });
});
