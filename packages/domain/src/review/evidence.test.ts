import { describe, expect, it } from 'vitest';
import { resolveEvidenceTarget, type EvidenceTrack } from './evidence.js';

const track = (overrides: Partial<EvidenceTrack> = {}): EvidenceTrack => ({
  ownerId: 'owner-1',
  meetingId: '00000000-0000-4000-8000-000000000001' as EvidenceTrack['meetingId'],
  segmentId: 'segment-1',
  trackId: 'local-track',
  source: 'local',
  startMs: 0,
  endMs: 3000,
  status: 'available',
  contentHash: 'a'.repeat(64),
  ...overrides,
});

describe('transcript evidence resolution', () => {
  it('resolves an exact same-meeting range and preserves source choice', () => {
    expect(
      resolveEvidenceTarget({
        ownerId: 'owner-1',
        meetingId: track().meetingId,
        segmentId: 'segment-1',
        startMs: 500,
        endMs: 1500,
        preferredSource: 'local',
        tracks: [track(), track({ source: 'cloud', trackId: 'cloud-track' })],
      }),
    ).toMatchObject({ status: 'available', trackId: 'local-track', startMs: 500, endMs: 1500 });
  });

  it('does not approximate unavailable, corrupt, cross-owner, or out-of-range evidence', () => {
    expect(
      resolveEvidenceTarget({
        ownerId: 'owner-1',
        meetingId: track().meetingId,
        segmentId: 'segment-1',
        startMs: 100,
        endMs: 200,
        tracks: [track({ status: 'gap' })],
      }).status,
    ).toBe('gap');
    expect(
      resolveEvidenceTarget({
        ownerId: 'owner-1',
        meetingId: track().meetingId,
        segmentId: 'segment-1',
        startMs: 100,
        endMs: 200,
        tracks: [track({ status: 'corrupt' })],
      }).status,
    ).toBe('corrupt');
    expect(
      resolveEvidenceTarget({
        ownerId: 'owner-2',
        meetingId: track().meetingId,
        segmentId: 'segment-1',
        startMs: 100,
        endMs: 200,
        tracks: [track()],
      }).status,
    ).toBe('missing');
    expect(
      resolveEvidenceTarget({
        ownerId: 'owner-1',
        meetingId: track().meetingId,
        segmentId: 'segment-1',
        startMs: 2900,
        endMs: 3100,
        tracks: [track()],
      }).status,
    ).toBe('missing');
  });
});
