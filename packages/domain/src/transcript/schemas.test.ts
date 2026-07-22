import { describe, it, expect } from 'vitest';
import {
  TranscriptSegmentSchema,
  TranscriptRevisionSchema,
  TranslationSegmentSchema,
  EvidenceRefSchema,
  SpeakerSchema,
  CompletenessSchema,
  TranscriptSourceSchema,
  TranslationStatusSchema,
  isSourceSegment,
  isGapSegment,
} from './schemas.js';

const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('TranscriptSource', () => {
  it('accepts api, local, manual', () => {
    expect(TranscriptSourceSchema.parse('api')).toBe('api');
    expect(TranscriptSourceSchema.parse('local')).toBe('local');
    expect(TranscriptSourceSchema.parse('manual')).toBe('manual');
  });

  it('rejects unknown sources', () => {
    const result = TranscriptSourceSchema.safeParse('hybrid');
    expect(result.success).toBe(false);
  });
});

describe('TranscriptSegment', () => {
  const validSegment = {
    id: 'seg-001',
    meetingId: MEETING_ID,
    sequence: 1,
    speakerId: 'spk-001',
    language: 'vi' as const,
    text: 'Xin chào mọi người',
    startMs: 0,
    endMs: 5000,
    confidence: 0.95,
    source: 'api' as const,
    provider: 'deepgram',
    providerEventId: 'dg-ev-001',
    isGap: false,
    createdAt: '2026-07-22T09:00:05.000Z',
  };

  it('accepts valid segment', () => {
    const result = TranscriptSegmentSchema.parse(validSegment);
    expect(result.text).toBe('Xin chào mọi người');
    expect(result.isGap).toBe(false);
  });

  it('accepts gap segment', () => {
    const gap = {
      ...validSegment,
      id: 'gap-001',
      isGap: true,
      text: '',
      gapReason: 'network_loss' as const,
      confidence: undefined,
      providerEventId: undefined,
    };
    const result = TranscriptSegmentSchema.parse(gap);
    expect(result.isGap).toBe(true);
    expect(result.gapReason).toBe('network_loss');
  });

  it('rejects gap segment without gapReason', () => {
    const result = TranscriptSegmentSchema.safeParse({
      ...validSegment,
      id: 'gap-002',
      isGap: true,
      text: '',
      confidence: undefined,
      providerEventId: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('accepts segment with minimum fields', () => {
    const minimal = {
      id: 'seg-002',
      meetingId: MEETING_ID,
      sequence: 2,
      speakerId: 'spk-001',
      language: 'vi' as const,
      text: 'Hello',
      startMs: 5000,
      endMs: 8000,
      source: 'api' as const,
      createdAt: '2026-07-22T09:00:08.000Z',
    };
    const result = TranscriptSegmentSchema.parse(minimal);
    expect(result.text).toBe('Hello');
  });

  it('rejects endMs before startMs', () => {
    const result = TranscriptSegmentSchema.safeParse({
      ...validSegment,
      startMs: 5000,
      endMs: 3000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects equal startMs and endMs', () => {
    const result = TranscriptSegmentSchema.safeParse({
      ...validSegment,
      startMs: 5000,
      endMs: 5000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative startMs', () => {
    const result = TranscriptSegmentSchema.safeParse({
      ...validSegment,
      startMs: -1,
      endMs: 5000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative confidence', () => {
    const result = TranscriptSegmentSchema.safeParse({
      ...validSegment,
      confidence: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects confidence > 1', () => {
    const result = TranscriptSegmentSchema.safeParse({
      ...validSegment,
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer sequence', () => {
    const result = TranscriptSegmentSchema.safeParse({
      ...validSegment,
      sequence: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('isSourceSegment / isGapSegment', () => {
  it('identifies source segment correctly', () => {
    const seg = TranscriptSegmentSchema.parse({
      id: 'seg-001',
      meetingId: MEETING_ID,
      sequence: 1,
      speakerId: 'spk-001',
      language: 'vi' as const,
      text: 'Hello',
      startMs: 0,
      endMs: 5000,
      source: 'api' as const,
      createdAt: '2026-07-22T09:00:05.000Z',
    });
    expect(isSourceSegment(seg)).toBe(true);
    expect(isGapSegment(seg)).toBe(false);
  });

  it('identifies gap segment correctly', () => {
    const gap = TranscriptSegmentSchema.parse({
      id: 'gap-001',
      meetingId: MEETING_ID,
      sequence: 5,
      speakerId: 'spk-001',
      language: 'vi' as const,
      text: '',
      startMs: 5000,
      endMs: 8000,
      source: 'api' as const,
      createdAt: '2026-07-22T09:00:05.000Z',
      isGap: true,
      gapReason: 'network_loss',
    });
    expect(isSourceSegment(gap)).toBe(false);
    expect(isGapSegment(gap)).toBe(true);
  });
});

describe('TranscriptRevision', () => {
  it('accepts valid revision', () => {
    const result = TranscriptRevisionSchema.parse({
      id: 'rev-001',
      segmentId: 'seg-001',
      baseRevisionId: null,
      revisedText: 'Xin chào tất cả mọi người',
      revisedSpeakerId: 'spk-002',
      actorId: 'user-1',
      reason: 'Misheard word',
      createdAt: '2026-07-22T10:00:00.000Z',
    });
    expect(result.revisedText).toBe('Xin chào tất cả mọi người');
  });

  it('accepts chained revision with baseRevisionId', () => {
    const result = TranscriptRevisionSchema.parse({
      id: 'rev-002',
      segmentId: 'seg-001',
      baseRevisionId: 'rev-001',
      revisedText: 'Xin chào các bạn',
      actorId: 'user-1',
      reason: 'Better translation',
      createdAt: '2026-07-22T11:00:00.000Z',
    });
    expect(result.baseRevisionId).toBe('rev-001');
  });

  it('rejects empty revisedText', () => {
    const result = TranscriptRevisionSchema.safeParse({
      id: 'rev-001',
      segmentId: 'seg-001',
      baseRevisionId: null,
      revisedText: '',
      actorId: 'user-1',
      createdAt: '2026-07-22T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('TranslationStatus', () => {
  it('accepts all statuses', () => {
    expect(TranslationStatusSchema.parse('pending')).toBe('pending');
    expect(TranslationStatusSchema.parse('processing')).toBe('processing');
    expect(TranslationStatusSchema.parse('completed')).toBe('completed');
    expect(TranslationStatusSchema.parse('failed')).toBe('failed');
  });
});

describe('TranslationSegment', () => {
  it('accepts valid translation', () => {
    const result = TranslationSegmentSchema.parse({
      id: 'trans-001',
      sourceSegmentId: 'seg-001',
      targetLanguage: 'en',
      translatedText: 'Hello everyone',
      provider: 'deepgram',
      model: 'nova-2',
      status: 'completed' as const,
      createdAt: '2026-07-22T09:30:00.000Z',
    });
    expect(result.translatedText).toBe('Hello everyone');
    expect(result.targetLanguage).toBe('en');
  });

  it('validates targetLanguage is vi or en', () => {
    const valid1 = TranslationSegmentSchema.parse({
      id: 't1',
      sourceSegmentId: 's1',
      targetLanguage: 'vi',
      translatedText: 'Xin chào',
      status: 'completed' as const,
      createdAt: '2026-07-22T09:00:00.000Z',
    });
    expect(valid1.targetLanguage).toBe('vi');

    const invalid = TranslationSegmentSchema.safeParse({
      id: 't1',
      sourceSegmentId: 's1',
      targetLanguage: 'fr',
      translatedText: 'Bonjour',
      status: 'completed' as const,
      createdAt: '2026-07-22T09:00:00.000Z',
    });
    expect(invalid.success).toBe(false);
  });
});

describe('Speaker', () => {
  it('accepts valid speaker', () => {
    const result = SpeakerSchema.parse({
      id: 'spk-001',
      meetingId: MEETING_ID,
      label: 'Speaker 1',
      displayName: 'Nguyen Van A',
    });
    expect(result.displayName).toBe('Nguyen Van A');
  });

  it('defaults label to "Unknown Speaker"', () => {
    const result = SpeakerSchema.parse({
      id: 'spk-001',
      meetingId: MEETING_ID,
    });
    expect(result.label).toBe('Unknown Speaker');
  });
});

describe('EvidenceRef', () => {
  it('accepts valid evidence reference', () => {
    const result = EvidenceRefSchema.parse({
      segmentId: 'seg-001',
      startMs: 1000,
      endMs: 3000,
    });
    expect(result.segmentId).toBe('seg-001');
  });

  it('accepts evidence reference with quoteHash', () => {
    const result = EvidenceRefSchema.parse({
      segmentId: 'seg-001',
      startMs: 1000,
      endMs: 3000,
      quoteHash: 'a'.repeat(64),
    });
    expect(result.quoteHash).toBe('a'.repeat(64));
  });

  it('rejects endMs before startMs', () => {
    const result = EvidenceRefSchema.safeParse({
      segmentId: 'seg-001',
      startMs: 3000,
      endMs: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-hex quoteHash', () => {
    const result = EvidenceRefSchema.safeParse({
      segmentId: 'seg-001',
      startMs: 1000,
      endMs: 3000,
      quoteHash: 'z'.repeat(64),
    });
    expect(result.success).toBe(false);
  });
});

describe('Completeness', () => {
  it('accepts complete state', () => {
    const result = CompletenessSchema.parse({
      audioComplete: true,
      transcriptComplete: true,
      gaps: [],
      pendingRanges: [],
    });
    expect(result.audioComplete).toBe(true);
  });

  it('accepts state with gaps and pending ranges', () => {
    const result = CompletenessSchema.parse({
      audioComplete: false,
      transcriptComplete: false,
      gaps: [{ startMs: 5000, endMs: 8000, reason: 'network_loss' }],
      pendingRanges: [{ startMs: 8000, endMs: 12000 }],
    });
    expect(result.gaps).toHaveLength(1);
    expect(result.pendingRanges).toHaveLength(1);
  });
});
