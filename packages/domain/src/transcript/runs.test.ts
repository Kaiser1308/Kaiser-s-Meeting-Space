import { describe, it, expect } from 'vitest';
import {
  RunKindSchema,
  RunLocalitySchema,
  RunProviderSchema,
  RunLifecycleStateSchema,
  TranscriptRunSchema,
  TranscriptRunPartSchema,
  TranscriptRunSegmentSchema,
} from './runs.js';

const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000';
const HEX64 = 'a'.repeat(64);
const VALID_POLICY = {
  version: 1 as const,
  language: 'vi' as const,
  live: 'cloud' as const,
  final: 'cloud' as const,
  cloudCheckScope: 'off' as const,
  cloudConsent: 'granted' as const,
};

describe('RunKind', () => {
  it('accepts live, final, cloud_check', () => {
    expect(RunKindSchema.parse('live')).toBe('live');
    expect(RunKindSchema.parse('final')).toBe('final');
    expect(RunKindSchema.parse('cloud_check')).toBe('cloud_check');
  });
  it('rejects unknown', () => {
    expect(RunKindSchema.safeParse('batch').success).toBe(false);
  });
});

describe('RunLocality', () => {
  it('accepts local, cloud', () => {
    expect(RunLocalitySchema.parse('local')).toBe('local');
    expect(RunLocalitySchema.parse('cloud')).toBe('cloud');
  });
  it('rejects unknown', () => {
    expect(RunLocalitySchema.safeParse('edge').success).toBe(false);
  });
});

describe('RunProvider', () => {
  it('accepts deepgram, local-whisper', () => {
    expect(RunProviderSchema.parse('deepgram')).toBe('deepgram');
    expect(RunProviderSchema.parse('local-whisper')).toBe('local-whisper');
  });
  it('rejects unknown', () => {
    expect(RunProviderSchema.safeParse('azure').success).toBe(false);
  });
});

describe('RunLifecycleState', () => {
  it('accepts every defined state', () => {
    for (const s of ['pending', 'running', 'completed', 'failed', 'cancelled'] as const) {
      expect(RunLifecycleStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects unknown', () => {
    expect(RunLifecycleStateSchema.safeParse('paused').success).toBe(false);
  });
});

describe('TranscriptRun', () => {
  const valid = {
    id: 'run-001',
    meetingId: MEETING_ID,
    ownerId: 'user-1',
    kind: 'live' as const,
    locality: 'cloud' as const,
    provider: 'deepgram' as const,
    language: 'vi' as const,
    sourceId: 'src-derived-mix',
    policySnapshot: VALID_POLICY,
    lifecycleState: 'running' as const,
    startedAt: '2026-07-27T09:00:00.000Z',
    createdAt: '2026-07-27T09:00:00.000Z',
  };

  it('roundtrips a valid run', () => {
    const result = TranscriptRunSchema.parse(valid);
    expect(result.id).toBe('run-001');
    expect(result.completedAt).toBeUndefined();
    expect(result.safeError).toBeUndefined();
    expect(result.planHash).toBeUndefined();
  });

  it('accepts a completed run with completedAt >= startedAt', () => {
    const result = TranscriptRunSchema.parse({
      ...valid,
      lifecycleState: 'completed',
      completedAt: '2026-07-27T10:00:00.000Z',
      planHash: HEX64,
    });
    expect(result.completedAt).toBe('2026-07-27T10:00:00.000Z');
    expect(result.planHash).toBe(HEX64);
  });

  it('accepts a failed run with safeError', () => {
    const result = TranscriptRunSchema.parse({
      ...valid,
      lifecycleState: 'failed',
      completedAt: '2026-07-27T09:05:00.000Z',
      safeError: {
        code: 'PROVIDER_TIMEOUT',
        message: 'timed out',
        category: 'timeout',
        retryable: true,
      },
    });
    expect(result.safeError?.code).toBe('PROVIDER_TIMEOUT');
  });

  it('rejects completedAt < startedAt', () => {
    const result = TranscriptRunSchema.safeParse({
      ...valid,
      completedAt: '2026-07-27T08:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown kind', () => {
    const result = TranscriptRunSchema.safeParse({ ...valid, kind: 'batch' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown locality', () => {
    const result = TranscriptRunSchema.safeParse({ ...valid, locality: 'edge' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown provider', () => {
    const result = TranscriptRunSchema.safeParse({ ...valid, provider: 'azure' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown lifecycle state', () => {
    const result = TranscriptRunSchema.safeParse({ ...valid, lifecycleState: 'paused' });
    expect(result.success).toBe(false);
  });

  it('rejects language outside vi|en', () => {
    const result = TranscriptRunSchema.safeParse({ ...valid, language: 'fr' });
    expect(result.success).toBe(false);
  });

  it('rejects missing ownerId', () => {
    const result = TranscriptRunSchema.safeParse({ ...valid, ownerId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing meetingId (invalid uuid)', () => {
    const result = TranscriptRunSchema.safeParse({ ...valid, meetingId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid planHash (non-64-hex)', () => {
    const result = TranscriptRunSchema.safeParse({ ...valid, planHash: 'z'.repeat(64) });
    expect(result.success).toBe(false);
  });

  it('rejects policySnapshot with unknown version (!= 1)', () => {
    const result = TranscriptRunSchema.safeParse({
      ...valid,
      policySnapshot: { ...VALID_POLICY, version: 2 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects policySnapshot that fails policy refinement (live=cloud + cloudConsent=not_required)', () => {
    const result = TranscriptRunSchema.safeParse({
      ...valid,
      policySnapshot: {
        version: 1,
        language: 'vi',
        live: 'cloud',
        final: 'none',
        cloudCheckScope: 'off',
        cloudConsent: 'not_required',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown envelope field (strict)', () => {
    const result = TranscriptRunSchema.safeParse({ ...valid, apiKey: 'LEAK' });
    expect(result.success).toBe(false);
  });
});

describe('TranscriptRunPart', () => {
  const valid = {
    id: 'part-001',
    runId: 'run-001',
    meetingId: MEETING_ID,
    ownerId: 'user-1',
    index: 0,
    startMs: 0,
    endMs: 300_000,
    locality: 'local' as const,
    provider: 'local-whisper' as const,
    rawResultHash: HEX64,
    lifecycleState: 'completed' as const,
    createdAt: '2026-07-27T09:05:00.000Z',
  };

  it('accepts a valid part and defaults overlapMs to 0', () => {
    const result = TranscriptRunPartSchema.parse(valid);
    expect(result.overlapMs).toBe(0);
    expect(result.modelId).toBeUndefined();
    expect(result.completedAt).toBeUndefined();
  });

  it('accepts overlapMs and modelId and completedAt', () => {
    const result = TranscriptRunPartSchema.parse({
      ...valid,
      overlapMs: 2000,
      modelId: 'whisper-vi-v1',
      completedAt: '2026-07-27T09:06:00.000Z',
    });
    expect(result.overlapMs).toBe(2000);
    expect(result.modelId).toBe('whisper-vi-v1');
  });

  it('rejects endMs <= startMs', () => {
    const eq = TranscriptRunPartSchema.safeParse({ ...valid, startMs: 1000, endMs: 1000 });
    expect(eq.success).toBe(false);

    const lt = TranscriptRunPartSchema.safeParse({ ...valid, startMs: 2000, endMs: 1000 });
    expect(lt.success).toBe(false);
  });

  it('rejects negative index', () => {
    const result = TranscriptRunPartSchema.safeParse({ ...valid, index: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects rawResultHash that is not 64-hex', () => {
    const short = TranscriptRunPartSchema.safeParse({ ...valid, rawResultHash: 'abc' });
    expect(short.success).toBe(false);

    const nonHex = TranscriptRunPartSchema.safeParse({ ...valid, rawResultHash: 'z'.repeat(64) });
    expect(nonHex.success).toBe(false);
  });

  it('rejects unknown lifecycle state', () => {
    const result = TranscriptRunPartSchema.safeParse({ ...valid, lifecycleState: 'paused' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown field (strict)', () => {
    const result = TranscriptRunPartSchema.safeParse({ ...valid, audio: 'bytes' });
    expect(result.success).toBe(false);
  });
});

describe('TranscriptRunSegment', () => {
  const valid = {
    id: 'seg-001',
    runId: 'run-001',
    partId: 'part-001',
    meetingId: MEETING_ID,
    ownerId: 'user-1',
    sequenceInPart: 0,
    speakerId: 'spk-001',
    language: 'vi' as const,
    text: 'Xin chào',
    startMs: 0,
    endMs: 1500,
    occurredAt: '2026-07-27T09:00:01.500Z',
  };

  it('accepts a valid segment', () => {
    const result = TranscriptRunSegmentSchema.parse(valid);
    expect(result.confidence).toBeUndefined();
  });

  it('accepts confidence', () => {
    const result = TranscriptRunSegmentSchema.parse({ ...valid, confidence: 0.88 });
    expect(result.confidence).toBe(0.88);
  });

  it('rejects endMs <= startMs', () => {
    const result = TranscriptRunSegmentSchema.safeParse({ ...valid, startMs: 2000, endMs: 1000 });
    expect(result.success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const hi = TranscriptRunSegmentSchema.safeParse({ ...valid, confidence: 1.5 });
    expect(hi.success).toBe(false);
  });

  it('rejects language outside vi|en', () => {
    const result = TranscriptRunSegmentSchema.safeParse({ ...valid, language: 'fr' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown field (strict)', () => {
    const result = TranscriptRunSegmentSchema.safeParse({ ...valid, audio: 'bytes' });
    expect(result.success).toBe(false);
  });
});
