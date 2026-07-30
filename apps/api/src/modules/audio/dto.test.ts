import { describe, expect, it } from 'vitest';
import { MAX_CHUNK_BYTES, RegisterChunkRequestSchema, RegisterChunkResponseSchema } from './dto.js';

const VALID_BODY = {
  source: 'mic',
  chunkIndex: 0,
  sha256: 'a'.repeat(64),
  byteLength: 12_345,
  startedAt: '2026-07-23T12:00:00.000Z',
  durationMs: 10_000,
  wallClockStart: '2026-07-23T12:00:00.000Z',
  wallClockEnd: '2026-07-23T12:00:10.000Z',
  monotonicStart: 1_000,
  monotonicEnd: 11_000,
  codec: 'opus',
  container: 'webm',
  sampleRate: 48_000,
  channels: 1,
} as const;

describe('RegisterChunkRequestSchema', () => {
  it('accepts the fixed capture profile and maximum byte length', () => {
    expect(
      RegisterChunkRequestSchema.parse({ ...VALID_BODY, byteLength: MAX_CHUNK_BYTES }),
    ).toMatchObject({
      source: 'mic',
      codec: 'opus',
      container: 'webm',
      sampleRate: 48_000,
      channels: 1,
    });
  });

  it.each([
    ['derived source', { source: 'derived_mix' }],
    ['negative index', { chunkIndex: -1 }],
    ['oversized body', { byteLength: MAX_CHUNK_BYTES + 1 }],
    ['wrong codec', { codec: 'pcm' }],
    ['wrong container', { container: 'wav' }],
    ['wrong sample rate', { sampleRate: 44_100 }],
    ['wrong channel count', { channels: 2 }],
    ['invalid checksum', { sha256: 'z'.repeat(64) }],
    ['reversed wall clock range', { wallClockEnd: '2026-07-23T11:59:59.000Z' }],
    ['reversed monotonic range', { monotonicEnd: 999 }],
  ])('rejects %s', (_label, override) => {
    expect(RegisterChunkRequestSchema.safeParse({ ...VALID_BODY, ...override }).success).toBe(
      false,
    );
  });
});

describe('RegisterChunkResponseSchema', () => {
  const response = {
    chunkId: '550e8400-e29b-41d4-a716-446655440000/mic/0',
    created: true,
    upload: {
      method: 'PUT',
      url: 'https://storage.invalid/signed/1',
      expiresAt: '2026-07-23T12:05:00.000Z',
      requiredHeaders: { 'Content-Type': 'audio/webm' },
    },
  } as const;

  it('accepts the public registration response', () => {
    expect(RegisterChunkResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects any storageKey field', () => {
    expect(
      RegisterChunkResponseSchema.safeParse({
        ...response,
        storageKey: 'audio/owner/meeting/mic/0.webm',
      }).success,
    ).toBe(false);
  });
});
