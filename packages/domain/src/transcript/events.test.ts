import { describe, it, expect } from 'vitest';
import {
  SpeechEventKindSchema,
  SpeechSessionStateSchema,
  SpeechSafeErrorCategorySchema,
  SpeechSafeErrorSchema,
  InterimSegmentEventSchema,
  FinalSegmentEventSchema,
  SpeakerUpdateEventSchema,
  UsageEventSchema,
  SessionStateEventSchema,
  SpeechEventSchema,
} from './events.js';

const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000';
const RUN_ID = 'run-001';

describe('SpeechEventKind', () => {
  it('accepts every defined kind', () => {
    for (const kind of [
      'interim',
      'final_segment',
      'speaker_update',
      'usage',
      'session_state',
      'safe_error',
    ] as const) {
      expect(SpeechEventKindSchema.parse(kind)).toBe(kind);
    }
  });

  it('rejects unknown kind', () => {
    expect(SpeechEventKindSchema.safeParse('partial').success).toBe(false);
  });
});

describe('SpeechSessionState', () => {
  it('accepts every defined state', () => {
    for (const s of [
      'started',
      'active',
      'delayed',
      'backfill_required',
      'expired',
      'closed',
    ] as const) {
      expect(SpeechSessionStateSchema.parse(s)).toBe(s);
    }
  });

  it('rejects unknown state', () => {
    expect(SpeechSessionStateSchema.safeParse('paused').success).toBe(false);
  });
});

describe('SpeechSafeErrorCategory', () => {
  it('accepts every defined category', () => {
    for (const c of [
      'protocol',
      'validation',
      'runtime',
      'storage',
      'timeout',
      'cancelled',
      'provider',
      'quota',
      'internal',
    ] as const) {
      expect(SpeechSafeErrorCategorySchema.parse(c)).toBe(c);
    }
  });

  it('rejects unknown category', () => {
    expect(SpeechSafeErrorCategorySchema.safeParse('unknown').success).toBe(false);
  });
});

describe('SpeechSafeError', () => {
  it('accepts valid safe error with explicit retryable', () => {
    const result = SpeechSafeErrorSchema.parse({
      code: 'PROVIDER_TIMEOUT',
      message: 'Provider timed out',
      category: 'timeout',
      retryable: true,
    });
    expect(result.retryable).toBe(true);
  });

  it('defaults retryable to false when absent', () => {
    const result = SpeechSafeErrorSchema.parse({
      code: 'VALIDATION_FAIL',
      message: 'Bad request',
      category: 'validation',
    });
    expect(result.retryable).toBe(false);
  });

  it('rejects code longer than 64 chars', () => {
    const result = SpeechSafeErrorSchema.safeParse({
      code: 'A'.repeat(65),
      message: 'm',
      category: 'validation',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message longer than 512 chars', () => {
    const result = SpeechSafeErrorSchema.safeParse({
      code: 'OK',
      message: 'x'.repeat(513),
      category: 'validation',
    });
    expect(result.success).toBe(false);
  });

  it('rejects content/key/path fields (strict, content-free)', () => {
    const withContent = SpeechSafeErrorSchema.safeParse({
      code: 'OK',
      message: 'm',
      category: 'validation',
      content: 'transcript leak',
    });
    expect(withContent.success).toBe(false);

    const withKey = SpeechSafeErrorSchema.safeParse({
      code: 'OK',
      message: 'm',
      category: 'validation',
      key: 'api_key_leak',
    });
    expect(withKey.success).toBe(false);

    const withPath = SpeechSafeErrorSchema.safeParse({
      code: 'OK',
      message: 'm',
      category: 'validation',
      path: '/secret/file',
    });
    expect(withPath.success).toBe(false);
  });
});

describe('InterimSegmentEvent', () => {
  it('accepts valid interim', () => {
    const result = InterimSegmentEventSchema.parse({
      text: 'partial',
      startMs: 0,
      endMs: 500,
    });
    expect(result.text).toBe('partial');
  });

  it('rejects text longer than 1000', () => {
    const result = InterimSegmentEventSchema.safeParse({
      text: 'x'.repeat(1001),
      startMs: 0,
      endMs: 500,
    });
    expect(result.success).toBe(false);
  });

  it('rejects endMs <= startMs', () => {
    const result = InterimSegmentEventSchema.safeParse({
      text: 'x',
      startMs: 500,
      endMs: 500,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const result = InterimSegmentEventSchema.safeParse({
      text: 'x',
      startMs: 0,
      endMs: 500,
      audio: 'bytes',
    });
    expect(result.success).toBe(false);
  });
});

describe('FinalSegmentEvent', () => {
  it('accepts valid final segment', () => {
    const result = FinalSegmentEventSchema.parse({
      speakerId: 'spk-001',
      text: 'final text',
      startMs: 0,
      endMs: 1000,
      confidence: 0.92,
      sequenceInPart: 3,
    });
    expect(result.sequenceInPart).toBe(3);
  });

  it('accepts final segment without confidence', () => {
    const result = FinalSegmentEventSchema.parse({
      speakerId: 'spk-001',
      text: 't',
      startMs: 0,
      endMs: 1000,
      sequenceInPart: 0,
    });
    expect(result.confidence).toBeUndefined();
  });

  it('requires sequenceInPart', () => {
    const result = FinalSegmentEventSchema.safeParse({
      speakerId: 'spk-001',
      text: 't',
      startMs: 0,
      endMs: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const hi = FinalSegmentEventSchema.safeParse({
      speakerId: 'spk-001',
      text: 't',
      startMs: 0,
      endMs: 1000,
      confidence: 1.5,
      sequenceInPart: 0,
    });
    expect(hi.success).toBe(false);

    const lo = FinalSegmentEventSchema.safeParse({
      speakerId: 'spk-001',
      text: 't',
      startMs: 0,
      endMs: 1000,
      confidence: -0.1,
      sequenceInPart: 0,
    });
    expect(lo.success).toBe(false);
  });

  it('rejects endMs <= startMs', () => {
    const result = FinalSegmentEventSchema.safeParse({
      speakerId: 'spk-001',
      text: 't',
      startMs: 1000,
      endMs: 1000,
      sequenceInPart: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('SpeakerUpdateEvent', () => {
  it('accepts valid speaker update', () => {
    const result = SpeakerUpdateEventSchema.parse({ speakerId: 'spk-002', label: 'Speaker 2' });
    expect(result.label).toBe('Speaker 2');
  });

  it('rejects empty label', () => {
    const result = SpeakerUpdateEventSchema.safeParse({ speakerId: 'spk-002', label: '' });
    expect(result.success).toBe(false);
  });
});

describe('UsageEvent', () => {
  it('accepts valid usage (IDs/units only)', () => {
    const result = UsageEventSchema.parse({
      units: 42,
      provider: 'deepgram',
      modelId: 'nova-2',
    });
    expect(result.units).toBe(42);
    expect(result.costUnits).toBeUndefined();
  });

  it('accepts costUnits', () => {
    const result = UsageEventSchema.parse({
      units: 42,
      provider: 'deepgram',
      modelId: 'nova-2',
      costUnits: 5,
    });
    expect(result.costUnits).toBe(5);
  });

  it('rejects negative units', () => {
    const result = UsageEventSchema.safeParse({
      units: -1,
      provider: 'deepgram',
      modelId: 'nova-2',
    });
    expect(result.success).toBe(false);
  });

  it('rejects text/audio/content-bearing fields (IDs/units only)', () => {
    const withText = UsageEventSchema.safeParse({
      units: 1,
      provider: 'deepgram',
      modelId: 'nova-2',
      text: 'transcript leak',
    });
    expect(withText.success).toBe(false);

    const withAudio = UsageEventSchema.safeParse({
      units: 1,
      provider: 'deepgram',
      modelId: 'nova-2',
      audio: 'base64',
    });
    expect(withAudio.success).toBe(false);

    const withContent = UsageEventSchema.safeParse({
      units: 1,
      provider: 'deepgram',
      modelId: 'nova-2',
      content: 'leak',
    });
    expect(withContent.success).toBe(false);
  });

  it('I-2 regression: accepts payload.provider from SpeechProviderNameSchema (deepgram)', () => {
    const result = UsageEventSchema.safeParse({
      units: 1,
      provider: 'deepgram',
      modelId: 'nova-2',
    });
    expect(result.success).toBe(true);
  });

  it('I-2 regression: rejects payload.provider outside SpeechProviderNameSchema (azure)', () => {
    const result = UsageEventSchema.safeParse({
      units: 1,
      provider: 'azure',
      modelId: 'nova-2',
    });
    expect(result.success).toBe(false);
  });
});

describe('SessionStateEvent', () => {
  it('accepts valid state event', () => {
    const result = SessionStateEventSchema.parse({ state: 'active' });
    expect(result.state).toBe('active');
  });

  it('accepts details', () => {
    const result = SessionStateEventSchema.parse({ state: 'delayed', details: 'network slow' });
    expect(result.details).toBe('network slow');
  });

  it('rejects details longer than 256', () => {
    const result = SessionStateEventSchema.safeParse({ state: 'active', details: 'x'.repeat(257) });
    expect(result.success).toBe(false);
  });
});

describe('SpeechEvent envelope (discriminated by kind)', () => {
  const baseEnvelope = {
    eventId: 'evt-001',
    meetingId: MEETING_ID,
    ownerId: 'user-1',
    runId: RUN_ID,
    provider: 'deepgram' as const,
    occurredAt: '2026-07-27T09:00:00.000Z',
  };

  it('accepts interim event (may omit partId)', () => {
    const result = SpeechEventSchema.parse({
      ...baseEnvelope,
      kind: 'interim',
      payload: { text: 'partial', startMs: 0, endMs: 500 },
    });
    expect(result.kind).toBe('interim');
    expect(result.partId).toBeUndefined();
  });

  it('accepts interim event with partId', () => {
    const result = SpeechEventSchema.parse({
      ...baseEnvelope,
      kind: 'interim',
      partId: 'part-001',
      payload: { text: 'partial', startMs: 0, endMs: 500 },
    });
    expect(result.partId).toBe('part-001');
  });

  it('accepts final_segment event', () => {
    const result = SpeechEventSchema.parse({
      ...baseEnvelope,
      kind: 'final_segment',
      partId: 'part-001',
      sequenceInPart: 2,
      providerEventId: 'dg-evt-1',
      payload: {
        speakerId: 'spk-001',
        text: 'final',
        startMs: 0,
        endMs: 1000,
        confidence: 0.9,
        sequenceInPart: 2,
      },
    });
    expect(result.kind).toBe('final_segment');
  });

  it('final_segment requires sequenceInPart in payload', () => {
    const result = SpeechEventSchema.safeParse({
      ...baseEnvelope,
      kind: 'final_segment',
      partId: 'part-001',
      sequenceInPart: 2,
      payload: {
        speakerId: 'spk-001',
        text: 'final',
        startMs: 0,
        endMs: 1000,
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts speaker_update event', () => {
    const result = SpeechEventSchema.parse({
      ...baseEnvelope,
      kind: 'speaker_update',
      payload: { speakerId: 'spk-002', label: 'Speaker 2' },
    });
    expect(result.kind).toBe('speaker_update');
  });

  it('accepts usage event', () => {
    const result = SpeechEventSchema.parse({
      ...baseEnvelope,
      kind: 'usage',
      payload: { units: 10, provider: 'deepgram', modelId: 'nova-2' },
    });
    expect(result.kind).toBe('usage');
  });

  it('accepts session_state event', () => {
    const result = SpeechEventSchema.parse({
      ...baseEnvelope,
      kind: 'session_state',
      payload: { state: 'active' },
    });
    expect(result.kind).toBe('session_state');
  });

  it('accepts safe_error event', () => {
    const result = SpeechEventSchema.parse({
      ...baseEnvelope,
      kind: 'safe_error',
      payload: {
        code: 'PROVIDER_TIMEOUT',
        message: 'timed out',
        category: 'timeout',
        retryable: true,
      },
    });
    expect(result.kind).toBe('safe_error');
  });

  it('rejects payload not matching kind (interim kind with final payload)', () => {
    const result = SpeechEventSchema.safeParse({
      ...baseEnvelope,
      kind: 'interim',
      payload: {
        speakerId: 'spk-001',
        text: 'final',
        startMs: 0,
        endMs: 1000,
        sequenceInPart: 0,
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown kind on the envelope', () => {
    const result = SpeechEventSchema.safeParse({
      ...baseEnvelope,
      kind: 'partial',
      payload: { text: 'x', startMs: 0, endMs: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown provider on the envelope', () => {
    const result = SpeechEventSchema.safeParse({
      ...baseEnvelope,
      provider: 'azure',
      kind: 'interim',
      payload: { text: 'x', startMs: 0, endMs: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown envelope field (strict)', () => {
    const result = SpeechEventSchema.safeParse({
      ...baseEnvelope,
      kind: 'usage',
      apiKey: 'LEAK',
      payload: { units: 1, provider: 'deepgram', modelId: 'nova-2' },
    });
    expect(result.success).toBe(false);
  });
});
