import { describe, it, expect } from 'vitest';
import { deriveStorageKey, isStorageKey, type StorageKey } from './key-derivation.js';
import { StorageError } from './errors.js';
import type { AudioSource } from '@kms/domain';

const OWNER = 'owner_abc-123';
const MEETING = '11111111-2222-3333-4444-555555555555';

function expectInvalidKey(fn: () => unknown): void {
  try {
    fn();
    throw new Error('expected deriveStorageKey to throw');
  } catch (e) {
    expect(e).toBeInstanceOf(StorageError);
    expect((e as StorageError).category).toBe('invalid_key');
  }
}

describe('deriveStorageKey — valid derivation', () => {
  it('derives a key in the canonical format', () => {
    const key = deriveStorageKey(OWNER, MEETING, 'mic', 0);
    expect(key).toBe(`audio/${OWNER}/${MEETING}/mic/0.webm`);
  });

  it('derives a system source key', () => {
    const key = deriveStorageKey(OWNER, MEETING, 'system', 42);
    expect(key).toBe(`audio/${OWNER}/${MEETING}/system/42.webm`);
  });

  it('accepts chunkIndex boundaries 0 and 1_000_000', () => {
    expect(deriveStorageKey(OWNER, MEETING, 'mic', 0)).toContain('/0.webm');
    expect(deriveStorageKey(OWNER, MEETING, 'mic', 1_000_000)).toContain('/1000000.webm');
  });

  it('returns a branded StorageKey', () => {
    const key = deriveStorageKey(OWNER, MEETING, 'mic', 1);
    const asserted: StorageKey = key;
    expect(typeof asserted).toBe('string');
  });
});

describe('deriveStorageKey — ownerId validation', () => {
  it('rejects empty ownerId', () => {
    expectInvalidKey(() => deriveStorageKey('', MEETING, 'mic', 0));
  });

  it('rejects ownerId longer than 128 chars', () => {
    expectInvalidKey(() => deriveStorageKey('a'.repeat(129), MEETING, 'mic', 0));
  });

  it('accepts ownerId exactly 128 chars', () => {
    const key = deriveStorageKey('a'.repeat(128), MEETING, 'mic', 0);
    expect(key).toContain(`a`.repeat(128));
  });

  it('rejects path-traversal ".." in ownerId', () => {
    expectInvalidKey(() => deriveStorageKey('../etc', MEETING, 'mic', 0));
  });

  it('rejects "/" separator injection in ownerId', () => {
    expectInvalidKey(() => deriveStorageKey('owner/evil', MEETING, 'mic', 0));
  });

  it('rejects backslash in ownerId', () => {
    expectInvalidKey(() => deriveStorageKey('owner\\evil', MEETING, 'mic', 0));
  });

  it('rejects URL-encoded path separator "%2F" literally', () => {
    expectInvalidKey(() => deriveStorageKey('%2Fevil', MEETING, 'mic', 0));
  });

  it('rejects URL-encoded NUL "%00" literally', () => {
    expectInvalidKey(() => deriveStorageKey('owner%00', MEETING, 'mic', 0));
  });

  it('rejects a NUL control character', () => {
    expectInvalidKey(() => deriveStorageKey('owner\x00', MEETING, 'mic', 0));
  });

  it('rejects other control characters (tab)', () => {
    expectInvalidKey(() => deriveStorageKey('owner\tname', MEETING, 'mic', 0));
  });

  it('rejects unicode lookalikes (Cyrillic "а")', () => {
    const lookalike = '\u0430dmin';
    expectInvalidKey(() => deriveStorageKey(lookalike, MEETING, 'mic', 0));
  });

  it('rejects non-ASCII characters generally', () => {
    expectInvalidKey(() => deriveStorageKey('üser', MEETING, 'mic', 0));
  });

  it('rejects space in ownerId', () => {
    expectInvalidKey(() => deriveStorageKey('owner name', MEETING, 'mic', 0));
  });

  it('rejects dot-only ownerIds (e.g. ".")', () => {
    expectInvalidKey(() => deriveStorageKey('.', MEETING, 'mic', 0));
  });

  it('accepts allowed charset: letters, digits, underscore, hyphen', () => {
    const key = deriveStorageKey('ABCxyz012_-', MEETING, 'mic', 0);
    expect(key).toContain('ABCxyz012_-');
  });
});

describe('deriveStorageKey — meetingId validation', () => {
  it('rejects a non-UUID meetingId', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, 'not-a-uuid', 'mic', 0));
  });

  it('rejects a truncated UUID', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, '11111111-2222-3333', 'mic', 0));
  });

  it('rejects uppercase-G variant mismatch... but accepts a valid lowercase UUID', () => {
    expectInvalidKey(() =>
      deriveStorageKey(OWNER, 'g1111111-2222-3333-4444-555555555555', 'mic', 0),
    );
  });

  it('accepts an uppercase-hex UUID', () => {
    const key = deriveStorageKey(
      OWNER,
      '11111111-2222-3333-4444-555555555555'.toUpperCase(),
      'mic',
      0,
    );
    expect(key).toContain('11111111-2222-3333-4444-555555555555'.toUpperCase());
  });

  it('rejects a meetingId with path separators', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, `${MEETING}/../`, 'mic', 0));
  });
});

describe('deriveStorageKey — source validation', () => {
  it('rejects derived_mix (reserved for P13)', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, MEETING, 'derived_mix' as AudioSource, 0));
  });

  it('rejects an unknown source string', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, MEETING, 'screenshare' as AudioSource, 0));
  });

  it('rejects empty source', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, MEETING, '' as AudioSource, 0));
  });
});

describe('deriveStorageKey — chunkIndex validation', () => {
  it('rejects a negative chunkIndex', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, MEETING, 'mic', -1));
  });

  it('rejects chunkIndex above 1_000_000', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, MEETING, 'mic', 1_000_001));
  });

  it('rejects a non-integer chunkIndex (1.5)', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, MEETING, 'mic', 1.5));
  });

  it('rejects NaN chunkIndex', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, MEETING, 'mic', NaN));
  });

  it('rejects Infinity chunkIndex', () => {
    expectInvalidKey(() => deriveStorageKey(OWNER, MEETING, 'mic', Infinity));
  });

  it('rejects -0 (accepted as 0 by Number.isInteger, still valid >= 0)', () => {
    const key = deriveStorageKey(OWNER, MEETING, 'mic', -0);
    expect(key).toContain('/0.webm');
  });
});

describe('deriveStorageKey — canonical regex assertion & collision avoidance', () => {
  it('every valid derivation matches the canonical regex via isStorageKey', () => {
    const samples: Array<{ source: 'mic' | 'system'; index: number }> = [
      { source: 'mic', index: 0 },
      { source: 'mic', index: 1_000_000 },
      { source: 'system', index: 7 },
      { source: 'system', index: 12345 },
    ];
    for (const s of samples) {
      const key = deriveStorageKey(OWNER, MEETING, s.source, s.index);
      expect(isStorageKey(key)).toBe(true);
    }
  });

  it('distinct chunkIndex yields distinct keys (collision avoidance)', () => {
    const a = deriveStorageKey(OWNER, MEETING, 'mic', 0);
    const b = deriveStorageKey(OWNER, MEETING, 'mic', 1);
    expect(a).not.toBe(b);
  });

  it('distinct source yields distinct keys', () => {
    const mic = deriveStorageKey(OWNER, MEETING, 'mic', 0);
    const sys = deriveStorageKey(OWNER, MEETING, 'system', 0);
    expect(mic).not.toBe(sys);
  });

  it('distinct meetingId yields distinct keys', () => {
    const other = '99999999-8888-7777-6666-555555555555';
    const a = deriveStorageKey(OWNER, MEETING, 'mic', 0);
    const b = deriveStorageKey(OWNER, other, 'mic', 0);
    expect(a).not.toBe(b);
  });

  it('distinct ownerId yields distinct keys', () => {
    const a = deriveStorageKey('ownerA', MEETING, 'mic', 0);
    const b = deriveStorageKey('ownerB', MEETING, 'mic', 0);
    expect(a).not.toBe(b);
  });
});

describe('isStorageKey type guard', () => {
  it('accepts a canonical key string', () => {
    expect(isStorageKey(`audio/${OWNER}/${MEETING}/mic/0.webm`)).toBe(true);
  });

  it('rejects a key missing the audio/ prefix', () => {
    expect(isStorageKey(`${OWNER}/${MEETING}/mic/0.webm`)).toBe(false);
  });

  it('rejects a key missing the .webm suffix', () => {
    expect(isStorageKey(`audio/${OWNER}/${MEETING}/mic/0`)).toBe(false);
  });

  it('rejects a derived_mix key (not in canonical mic|system)', () => {
    expect(isStorageKey(`audio/${OWNER}/${MEETING}/derived_mix/0.webm`)).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isStorageKey(null)).toBe(false);
    expect(isStorageKey(undefined)).toBe(false);
    expect(isStorageKey(123)).toBe(false);
    expect(isStorageKey({})).toBe(false);
  });

  it('narrow the type when true', () => {
    const value: unknown = `audio/${OWNER}/${MEETING}/system/3.webm`;
    if (isStorageKey(value)) {
      const key: StorageKey = value;
      expect(typeof key).toBe('string');
    } else {
      throw new Error('should have narrowed');
    }
  });
});
