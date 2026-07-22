import { describe, it, expect, afterEach } from 'vitest';
import {
  deterministicId,
  deterministicIds,
  deterministicNow,
  fakeClockFixture,
  createMeetingFixture,
  createTranscriptFixture,
  normalizePath,
  uniqueNamespace,
  type FakeClock,
} from './index.js';

describe('deterministicId', () => {
  it('returns predictable IDs given the same prefix and index', () => {
    const a = deterministicId('meeting', 1);
    const b = deterministicId('meeting', 1);
    expect(a).toBe(b);
  });

  it('returns different IDs for different prefixes', () => {
    const a = deterministicId('meeting', 1);
    const b = deterministicId('user', 1);
    expect(a).not.toBe(b);
  });

  it('returns different IDs for different indices', () => {
    const a = deterministicId('meeting', 1);
    const b = deterministicId('meeting', 2);
    expect(a).not.toBe(b);
  });

  it('produces UUID-format strings', () => {
    const id = deterministicId('test', 42);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('deterministicIds', () => {
  it('generates the requested number of IDs', () => {
    const ids = deterministicIds('seg', 5);
    expect(ids).toHaveLength(5);
    // All should be unique
    expect(new Set(ids).size).toBe(5);
  });
});

describe('deterministicNow', () => {
  it('returns a fixed date', () => {
    const now = deterministicNow();
    expect(now).toBeInstanceOf(Date);
    // Should be a specific known value (2026-07-21T12:00:00.000Z)
    expect(now.toISOString()).toBe('2026-07-21T12:00:00.000Z');
  });
});

describe('fakeClockFixture', () => {
  let clock: FakeClock;

  afterEach(() => {
    clock?.restore();
  });

  it('provides a fake clock starting at the deterministic time', () => {
    clock = fakeClockFixture();
    const now = new Date();
    expect(now.toISOString()).toBe('2026-07-21T12:00:00.000Z');
  });

  it('advances time by the given milliseconds', () => {
    clock = fakeClockFixture();
    clock.advance(60000); // 1 minute
    const now = new Date();
    expect(now.toISOString()).toBe('2026-07-21T12:01:00.000Z');
  });
});

describe('createMeetingFixture', () => {
  it('creates a meeting with deterministic fields', () => {
    const meeting = createMeetingFixture({ title: 'Test Meeting' });
    expect(meeting.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(meeting.title).toBe('Test Meeting');
    expect(meeting.mode).toBe('meeting_only');
    expect(meeting.language).toBe('vi');
  });

  it('creates different meetings with different IDs', () => {
    const m1 = createMeetingFixture({});
    const m2 = createMeetingFixture({});
    expect(m1.id).not.toBe(m2.id);
  });

  it('accepts overrides', () => {
    const meeting = createMeetingFixture({
      mode: 'meeting_translate',
      primaryLanguage: 'en',
    });
    expect(meeting.mode).toBe('meeting_translate');
    expect(meeting.language).toBe('en');
  });
});

describe('createTranscriptFixture', () => {
  it('creates the requested number of segments', () => {
    const segments = createTranscriptFixture('m1', 3);
    expect(segments).toHaveLength(3);
  });

  it('assigns sequential sequence numbers', () => {
    const segments = createTranscriptFixture('m1', 3);
    expect(segments[0]?.sequence).toBe(1);
    expect(segments[1]?.sequence).toBe(2);
    expect(segments[2]?.sequence).toBe(3);
  });

  it('all segments reference the same meeting', () => {
    const segments = createTranscriptFixture('m1', 2);
    for (const seg of segments) {
      expect(seg.meetingId).toBe('m1');
    }
  });

  it('uses synthetic Vietnamese text', () => {
    const segments = createTranscriptFixture('m1', 1);
    expect(segments[0]?.text).toContain('Xin chào');
    expect(segments[0]?.language).toBe('vi');
  });
});

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\test\\file.txt')).toBe('C:/Users/test/file.txt');
  });

  it('preserves forward slashes', () => {
    expect(normalizePath('/home/user/file.txt')).toBe('/home/user/file.txt');
  });

  it('handles Windows UNC paths', () => {
    expect(normalizePath('\\\\?\\C:\\Users\\test')).toBe('//?/C:/Users/test');
  });
});

describe('uniqueNamespace', () => {
  it('returns unique values across calls', () => {
    const ns1 = uniqueNamespace('test');
    const ns2 = uniqueNamespace('test');
    expect(ns1).not.toBe(ns2);
  });

  it('includes the prefix in the namespace', () => {
    const ns = uniqueNamespace('mydb');
    expect(ns).toContain('mydb');
  });

  it('produces safe identifiers (no spaces, no special chars)', () => {
    const ns = uniqueNamespace('test-db');
    expect(ns).toMatch(/^[a-z0-9_-]+$/i);
  });
});
