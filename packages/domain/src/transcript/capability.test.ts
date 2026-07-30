import { describe, it, expect } from 'vitest';
import {
  SpeechProviderNameSchema,
  SpeechCapabilitiesSchema,
  ReadinessSchema,
  SessionRequestSchema,
  FileRequestSchema,
  UsageReportSchema,
  HealthReportSchema,
  CancelSchema,
} from './capability.js';

const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('SpeechProviderName', () => {
  it('accepts deepgram and local-whisper only', () => {
    expect(SpeechProviderNameSchema.parse('deepgram')).toBe('deepgram');
    expect(SpeechProviderNameSchema.parse('local-whisper')).toBe('local-whisper');
  });

  it('rejects unknown provider', () => {
    expect(SpeechProviderNameSchema.safeParse('azure').success).toBe(false);
    expect(SpeechProviderNameSchema.safeParse('openai').success).toBe(false);
  });
});

describe('SpeechCapabilities', () => {
  it('accepts valid capabilities', () => {
    const result = SpeechCapabilitiesSchema.parse({
      languages: ['vi'],
      diarization: true,
      supportsLive: true,
      supportsFile: true,
    });
    expect(result.languages).toEqual(['vi']);
  });

  it('accepts capabilities with optional fields', () => {
    const result = SpeechCapabilitiesSchema.parse({
      languages: ['vi', 'en'],
      diarization: false,
      supportsLive: true,
      supportsFile: false,
      translationTarget: 'en',
      maxStreamDurationMs: 60_000,
    });
    expect(result.translationTarget).toBe('en');
    expect(result.maxStreamDurationMs).toBe(60_000);
  });

  it('requires at least one language', () => {
    const result = SpeechCapabilitiesSchema.safeParse({
      languages: [],
      diarization: true,
      supportsLive: true,
      supportsFile: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects language outside vi|en', () => {
    const result = SpeechCapabilitiesSchema.safeParse({
      languages: ['fr'],
      diarization: true,
      supportsLive: true,
      supportsFile: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive maxStreamDurationMs', () => {
    const zero = SpeechCapabilitiesSchema.safeParse({
      languages: ['vi'],
      diarization: true,
      supportsLive: true,
      supportsFile: true,
      maxStreamDurationMs: 0,
    });
    expect(zero.success).toBe(false);

    const neg = SpeechCapabilitiesSchema.safeParse({
      languages: ['vi'],
      diarization: true,
      supportsLive: true,
      supportsFile: true,
      maxStreamDurationMs: -1,
    });
    expect(neg.success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const result = SpeechCapabilitiesSchema.safeParse({
      languages: ['vi'],
      diarization: true,
      supportsLive: true,
      supportsFile: true,
      apiKey: 'LEAK',
    });
    expect(result.success).toBe(false);
  });
});

describe('Readiness', () => {
  it('accepts ready true with no extras', () => {
    const result = ReadinessSchema.parse({ ready: true });
    expect(result.ready).toBe(true);
  });

  it('accepts degraded state with missing model', () => {
    const result = ReadinessSchema.parse({
      ready: false,
      degraded: ['model_missing'],
      missingModelId: 'whisper-vi-v1',
    });
    expect(result.degraded).toEqual(['model_missing']);
    expect(result.missingModelId).toBe('whisper-vi-v1');
  });

  it('rejects unknown fields (strict)', () => {
    const result = ReadinessSchema.safeParse({ ready: true, secret: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('SessionRequest', () => {
  const valid = {
    meetingId: MEETING_ID,
    ownerId: 'user-1',
    language: 'vi' as const,
    sourceId: 'src-derived-mix',
    diarization: true,
    capabilityVersion: 1,
    expiryMs: 30_000,
    budgetMs: 5_000,
    allowedProvider: 'deepgram' as const,
  };

  it('accepts valid request', () => {
    const result = SessionRequestSchema.parse(valid);
    expect(result.allowedProvider).toBe('deepgram');
  });

  it('accepts expiryMs at the 60s boundary', () => {
    const result = SessionRequestSchema.parse({ ...valid, expiryMs: 60_000 });
    expect(result.expiryMs).toBe(60_000);
  });

  it('rejects expiryMs > 60_000 (short-lived bound)', () => {
    const result = SessionRequestSchema.safeParse({ ...valid, expiryMs: 60_001 });
    expect(result.success).toBe(false);
  });

  it('rejects language outside vi|en', () => {
    const result = SessionRequestSchema.safeParse({ ...valid, language: 'fr' });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive capabilityVersion', () => {
    const result = SessionRequestSchema.safeParse({ ...valid, capabilityVersion: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive budgetMs', () => {
    const result = SessionRequestSchema.safeParse({ ...valid, budgetMs: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown allowedProvider', () => {
    const result = SessionRequestSchema.safeParse({ ...valid, allowedProvider: 'azure' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const result = SessionRequestSchema.safeParse({ ...valid, apiKey: 'LEAK' });
    expect(result.success).toBe(false);
  });
});

describe('FileRequest', () => {
  const valid = {
    runId: 'run-001',
    partId: 'part-001',
    startMs: 0,
    endMs: 300_000,
    language: 'en' as const,
    modelId: 'whisper-en-v1',
    provider: 'local-whisper' as const,
  };

  it('accepts valid request', () => {
    const result = FileRequestSchema.parse(valid);
    expect(result.provider).toBe('local-whisper');
  });

  it('rejects endMs <= startMs', () => {
    const eq = FileRequestSchema.safeParse({ ...valid, startMs: 1000, endMs: 1000 });
    expect(eq.success).toBe(false);

    const lt = FileRequestSchema.safeParse({ ...valid, startMs: 2000, endMs: 1000 });
    expect(lt.success).toBe(false);
  });

  it('rejects unknown provider', () => {
    const result = FileRequestSchema.safeParse({ ...valid, provider: 'google' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const result = FileRequestSchema.safeParse({ ...valid, transcript: 'LEAK' });
    expect(result.success).toBe(false);
  });
});

describe('UsageReport', () => {
  it('accepts valid report', () => {
    const result = UsageReportSchema.parse({
      provider: 'deepgram',
      modelId: 'nova-2',
      units: 1500,
    });
    expect(result.units).toBe(1500);
    expect(result.costUnits).toBeUndefined();
  });

  it('accepts costUnits', () => {
    const result = UsageReportSchema.parse({
      provider: 'deepgram',
      modelId: 'nova-2',
      units: 1500,
      costUnits: 30,
    });
    expect(result.costUnits).toBe(30);
  });

  it('rejects negative units', () => {
    const result = UsageReportSchema.safeParse({
      provider: 'deepgram',
      modelId: 'nova-2',
      units: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects content-bearing fields (strict)', () => {
    const result = UsageReportSchema.safeParse({
      provider: 'deepgram',
      modelId: 'nova-2',
      units: 1,
      text: 'LEAK',
    });
    expect(result.success).toBe(false);
  });
});

describe('HealthReport', () => {
  it('accepts healthy report', () => {
    const result = HealthReportSchema.parse({ provider: 'deepgram', ready: true });
    expect(result.ready).toBe(true);
  });

  it('accepts degraded report', () => {
    const result = HealthReportSchema.parse({
      provider: 'local-whisper',
      ready: false,
      degraded: ['model_missing'],
    });
    expect(result.degraded).toEqual(['model_missing']);
  });

  it('rejects unknown fields (strict)', () => {
    const result = HealthReportSchema.safeParse({ provider: 'deepgram', ready: true, extra: 1 });
    expect(result.success).toBe(false);
  });
});

describe('Cancel', () => {
  it('accepts bare cancel', () => {
    const result = CancelSchema.parse({ runId: 'run-001' });
    expect(result.runId).toBe('run-001');
    expect(result.reason).toBeUndefined();
  });

  it('accepts cancel with reason', () => {
    const result = CancelSchema.parse({ runId: 'run-001', reason: 'user_requested' });
    expect(result.reason).toBe('user_requested');
  });

  it('rejects unknown fields (strict)', () => {
    const result = CancelSchema.safeParse({ runId: 'run-001', force: true });
    expect(result.success).toBe(false);
  });
});
