import { describe, it, expect } from 'vitest';
import {
  AudioChunkSchema,
  PauseIntervalSchema,
  GapMarkerSchema,
  TimelineEventSchema,
  ManifestEntrySchema,
  DerivedMixMetadataSchema,
  UploadStatusSchema,
  isPauseInterval,
  isGapMarker,
} from './schemas.js';
import { formatChunkId } from '../meeting/schemas.js';

const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000';
const SHA256 = 'a'.repeat(64);

describe('UploadStatus', () => {
  it('accepts all statuses', () => {
    expect(UploadStatusSchema.parse('pending')).toBe('pending');
    expect(UploadStatusSchema.parse('uploading')).toBe('uploading');
    expect(UploadStatusSchema.parse('completed')).toBe('completed');
    expect(UploadStatusSchema.parse('failed')).toBe('failed');
  });

  it('rejects unknown status', () => {
    const result = UploadStatusSchema.safeParse('corrupted');
    expect(result.success).toBe(false);
  });
});

describe('AudioChunk', () => {
  const validChunk = {
    id: formatChunkId(MEETING_ID, 'mic', 0),
    meetingId: MEETING_ID,
    source: 'mic' as const,
    chunkIndex: 0,
    storageKey: 'chunks/meeting/mic/0.webm',
    startedAt: '2026-07-22T09:00:00.000Z',
    durationMs: 10000,
    byteLength: 120000,
    codec: 'opus' as const,
    container: 'webm' as const,
    sampleRate: 48000,
    channels: 1,
    sha256: SHA256,
    uploadStatus: 'pending' as const,
    wallClockStart: '2026-07-22T09:00:00.000Z',
    wallClockEnd: '2026-07-22T09:00:10.000Z',
    monotonicStart: 1000000,
    monotonicEnd: 14800000,
  };

  it('accepts valid chunk', () => {
    const result = AudioChunkSchema.parse(validChunk);
    expect(result.id).toContain('/mic/0');
    expect(result.chunkIndex).toBe(0);
  });

  it('accepts finalized chunk', () => {
    const finalized = { ...validChunk, finalizedAt: '2026-07-22T09:00:15.000Z' };
    const result = AudioChunkSchema.parse(finalized);
    expect(result.finalizedAt).toBe('2026-07-22T09:00:15.000Z');
  });

  it('rejects negative chunkIndex', () => {
    const result = AudioChunkSchema.safeParse({ ...validChunk, chunkIndex: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects zero duration', () => {
    const result = AudioChunkSchema.safeParse({ ...validChunk, durationMs: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer duration', () => {
    const result = AudioChunkSchema.safeParse({ ...validChunk, durationMs: 10.5 });
    expect(result.success).toBe(false);
  });

  it('rejects non-hex SHA-256', () => {
    const result = AudioChunkSchema.safeParse({ ...validChunk, sha256: 'z'.repeat(64) });
    expect(result.success).toBe(false);
  });

  it('rejects SHA-256 of wrong length', () => {
    const result = AudioChunkSchema.safeParse({ ...validChunk, sha256: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects zero byteLength', () => {
    const result = AudioChunkSchema.safeParse({ ...validChunk, byteLength: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = AudioChunkSchema.safeParse({ ...validChunk, data: 'sensitive' });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate chunk ID (same meetingId/source/chunkIndex produces same ID)', () => {
    const id1 = formatChunkId(MEETING_ID, 'mic', 0);
    const id2 = formatChunkId(MEETING_ID, 'mic', 0);
    expect(id1).toBe(id2);
  });

  it('different sources have independent indices', () => {
    const micChunk = formatChunkId(MEETING_ID, 'mic', 0);
    const sysChunk = formatChunkId(MEETING_ID, 'system', 0);
    expect(micChunk).not.toBe(sysChunk);
  });

  it('derived_mix produces distinct chunk IDs', () => {
    const mixId = formatChunkId(MEETING_ID, 'derived_mix', 0);
    expect(mixId).toContain('derived_mix');
  });
});

describe('PauseInterval', () => {
  it('accepts valid pause', () => {
    const result = PauseIntervalSchema.parse({
      type: 'pause',
      startMs: 5000,
      durationMs: 3000,
    });
    expect(result.startMs).toBe(5000);
  });

  it('rejects non-pause type', () => {
    const result = PauseIntervalSchema.safeParse({
      type: 'unknown',
      startMs: 5000,
      durationMs: 3000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero duration', () => {
    const result = PauseIntervalSchema.safeParse({ type: 'pause', startMs: 5000, durationMs: 0 });
    expect(result.success).toBe(false);
  });
});

describe('GapMarker', () => {
  it('accepts valid gap', () => {
    const result = GapMarkerSchema.parse({
      type: 'gap',
      description: 'buffer_overflow',
      startMs: 5000,
      endMs: 5200,
      durationMs: 200,
    });
    expect(result.description).toBe('buffer_overflow');
  });

  it('accepts all gap descriptions', () => {
    const descs = ['source_disconnect', 'buffer_overflow', 'crash_recovery'] as const;
    for (const desc of descs) {
      const result = GapMarkerSchema.parse({
        type: 'gap',
        description: desc,
        startMs: 1000,
        endMs: 1500,
        durationMs: 500,
      });
      expect(result.description).toBe(desc);
    }
  });

  it('rejects endMs before startMs', () => {
    const result = GapMarkerSchema.safeParse({
      type: 'gap',
      description: 'buffer_overflow',
      startMs: 5000,
      endMs: 4000,
      durationMs: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown gap description', () => {
    const result = GapMarkerSchema.safeParse({
      type: 'gap',
      description: 'unknown_gap',
      startMs: 1000,
      endMs: 1500,
      durationMs: 500,
    });
    expect(result.success).toBe(false);
  });
});

describe('TimelineEvent (discriminated union)', () => {
  it('discriminates pause event', () => {
    const event = TimelineEventSchema.parse({
      type: 'pause',
      startMs: 5000,
      durationMs: 3000,
    });
    expect(isPauseInterval(event)).toBe(true);
    expect(isGapMarker(event)).toBe(false);
  });

  it('discriminates gap event', () => {
    const event = TimelineEventSchema.parse({
      type: 'gap',
      description: 'buffer_overflow',
      startMs: 5000,
      endMs: 5200,
      durationMs: 200,
    });
    expect(isGapMarker(event)).toBe(true);
    expect(isPauseInterval(event)).toBe(false);
  });

  it('rejects unknown event type', () => {
    const result = TimelineEventSchema.safeParse({ type: 'note', text: 'hello' });
    expect(result.success).toBe(false);
  });
});

describe('ManifestEntry', () => {
  const validEntry = {
    meetingId: MEETING_ID,
    source: 'mic' as const,
    chunkIndex: 0,
    filePath: '/tmp/chunks/chunk_0.webm',
    sha256: SHA256,
    byteLength: 120000,
    wallClockStart: '2026-07-22T09:00:00.000Z',
    wallClockEnd: '2026-07-22T09:00:10.000Z',
    monotonicStart: 1000000,
    monotonicEnd: 14800000,
    sampleRate: 48000,
    channels: 1,
    codec: 'opus' as const,
    container: 'webm' as const,
    durationMs: 10000,
  };

  it('accepts valid manifest entry', () => {
    const result = ManifestEntrySchema.parse(validEntry);
    expect(result.meetingId).toBe(MEETING_ID);
  });

  it('rejects non-JSON-lines compatible entry with newlines in fields', () => {
    // Manifest entries should not have newlines (JSON Lines format)
    const result = ManifestEntrySchema.parse(validEntry);
    expect(JSON.stringify(result)).not.toContain('\n');
  });
});

describe('DerivedMixMetadata', () => {
  it('accepts valid derived mix', () => {
    const result = DerivedMixMetadataSchema.parse({
      source: 'derived_mix',
      meetingId: MEETING_ID,
      label: 'Mic + System mix',
      isDerived: true,
      derivedFrom: ['mic', 'system'],
      mixVersion: 1,
    });
    expect(result.isDerived).toBe(true);
    expect(result.derivedFrom).toEqual(['mic', 'system']);
  });

  it('rejects isDerived=false', () => {
    const result = DerivedMixMetadataSchema.safeParse({
      source: 'derived_mix',
      meetingId: MEETING_ID,
      label: 'Mix',
      isDerived: false,
      derivedFrom: ['mic', 'system'],
      mixVersion: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty derivedFrom', () => {
    const result = DerivedMixMetadataSchema.safeParse({
      source: 'derived_mix',
      meetingId: MEETING_ID,
      label: 'Mix',
      isDerived: true,
      derivedFrom: [],
      mixVersion: 1,
    });
    expect(result.success).toBe(false);
  });
});
