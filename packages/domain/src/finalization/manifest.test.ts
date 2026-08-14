import { describe, expect, it } from 'vitest';
import {
  FinalizationManifestV1Schema,
  finalizeManifestV1,
} from './manifest.js';

const meetingId = '11111111-1111-4111-8111-111111111111';
const sha256 = 'a'.repeat(64);

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    meetingId,
    ownerId: 'owner-1',
    meetingVersion: 4,
    idempotencyKey: 'end-1',
    sources: [
      {
        source: 'mic',
        chunks: [
          {
            id: `${meetingId}/mic/0`,
            index: 0,
            startMs: 0,
            endMs: 1_000,
            sha256,
            format: { container: 'webm', codec: 'opus' },
          },
        ],
      },
    ],
    pauses: [],
    gaps: [],
    clientClosedAt: '2026-08-11T12:00:00.000Z',
    localManifestHash: 'b'.repeat(64),
    ...overrides,
  };
}

describe('FinalizationManifestV1', () => {
  it('rejects chunks whose source, order, hash, or ranges do not match the immutable manifest', () => {
    const invalid = manifest({
      sources: [
        {
          source: 'mic',
          chunks: [
            {
              id: `${meetingId}/system/1`,
              index: 1,
              startMs: 500,
              endMs: 500,
              sha256: 'not-a-hash',
              format: { container: 'webm', codec: 'opus' },
            },
          ],
        },
      ],
    });

    expect(FinalizationManifestV1Schema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a source declared without immutable chunks', () => {
    expect(
      FinalizationManifestV1Schema.safeParse(
        manifest({ sources: [{ source: 'system', chunks: [] }] }),
      ).success,
    ).toBe(false);
  });

  it('preserves the same immutable End manifest for repeated parsing', () => {
    const first = finalizeManifestV1(manifest());
    const repeated = finalizeManifestV1(manifest());

    expect(repeated).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      (first.sources as unknown as { push: (item: unknown) => void }).push({});
    }).toThrow();
  });
});
