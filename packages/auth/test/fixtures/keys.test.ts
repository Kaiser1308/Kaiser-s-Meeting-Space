import { describe, it, expect } from 'vitest';
import {
  generateSyntheticKey,
  getCurrentKey,
  getPreviousKey,
  getNextKey,
  getAllKeys,
  FIXED_JWK_FINGERPRINTS,
} from '@kms/auth';

describe('keys.ts - Synthetic key generation', () => {
  describe('generateSyntheticKey', () => {
    it('should generate a synthetic RSA key with all required fields', async () => {
      const key = await generateSyntheticKey(0);

      expect(key).toBeDefined();
      expect(key.kid).toBeDefined();
      expect(key.kty).toBe('RSA');
      expect(key.use).toBe('sig');
      expect(key.alg).toBe('RS256');
      expect(key.n).toBeDefined();
      expect(key.e).toBeDefined();
      expect(key.d).toBeDefined();
      expect(key.p).toBeDefined();
      expect(key.q).toBeDefined();
      expect(key.dp).toBeDefined();
      expect(key.dq).toBeDefined();
      expect(key.qi).toBeDefined();
    });

    it('should generate deterministic keys from the same seed', async () => {
      const key1 = await generateSyntheticKey(42);
      const key2 = await generateSyntheticKey(42);

      expect(key1.kid).toBe(key2.kid);
      expect(key1.n).toBe(key2.n);
      expect(key1.d).toBe(key2.d);
    });

    it('should generate different keys from different seeds', async () => {
      const key1 = await generateSyntheticKey(1);
      const key2 = await generateSyntheticKey(2);

      expect(key1.kid).not.toBe(key2.kid);
    });

    it('should mark keys as test-only in their metadata', async () => {
      const key = await generateSyntheticKey(0);

      expect(key.kid).toContain('test-issuer');
      expect(key.kid).toContain('synthetic');
    });
  });

  describe('getCurrentKey', () => {
    it('should return a valid key with private components', async () => {
      const key = await getCurrentKey();

      expect(key).toBeDefined();
      expect(key.kty).toBe('RSA');
      expect(key.alg).toBe('RS256');
      expect(key.d).toBeDefined(); // Private component
    });

    it('should return a deterministic key', async () => {
      const key1 = await getCurrentKey();
      const key2 = await getCurrentKey();

      expect(key1.kid).toBe(key2.kid);
    });
  });

  describe('getPreviousKey', () => {
    it('should return a different key from current', async () => {
      const current = await getCurrentKey();
      const previous = await getPreviousKey();

      expect(previous).toBeDefined();
      expect(current.kid).not.toBe(previous.kid);
    });

    it('should return a deterministic key', async () => {
      const previous1 = await getPreviousKey();
      const previous2 = await getPreviousKey();

      expect(previous1.kid).toBe(previous2.kid);
    });
  });

  describe('getNextKey', () => {
    it('should return a different key from current and previous', async () => {
      const current = await getCurrentKey();
      const previous = await getPreviousKey();
      const next = await getNextKey();

      expect(next).toBeDefined();
      expect(next.kid).not.toBe(current.kid);
      expect(next.kid).not.toBe(previous.kid);
    });

    it('should return a deterministic key', async () => {
      const next1 = await getNextKey();
      const next2 = await getNextKey();

      expect(next1.kid).toBe(next2.kid);
    });
  });

  describe('getAllKeys', () => {
    it('should return at least 3 keys (current, previous, next)', async () => {
      const keys = await getAllKeys();

      expect(keys.length).toBeGreaterThanOrEqual(3);
      expect(keys).toHaveLength(3);
    });

    it('should return keys with unique kid values', async () => {
      const keys = await getAllKeys();
      const kids = keys.map((k) => k.kid);

      expect(new Set(kids).size).toBe(kids.length);
    });

    it('should return only test-only keys', async () => {
      const keys = await getAllKeys();

      keys.forEach((key) => {
        expect(key.kid).toContain('test-issuer');
        expect(key.kid).toContain('synthetic');
      });
    });
  });

  describe('synthetic key properties', () => {
    it('should prove keys are synthetic by checking kid pattern', async () => {
      const keys = await getAllKeys();

      keys.forEach((key) => {
        expect(key.kid).toMatch(/test-issuer-synthetic/);
        expect(key.kid).not.toMatch(/prod|production|real|live/);
      });
    });

    it('should prove keys are not production keys', async () => {
      const keys = await getAllKeys();

      keys.forEach((key) => {
        expect(key.kid).not.toBe('prod-key-1');
        expect(key.kid).not.toBe('production-key');
        expect(key.kid).not.toBe('real-key');
      });
    });
  });

  describe('cross-process determinism (P04-A01)', () => {
    it('uses fixed JWK material, not runtime-generated keys', async () => {
      const currentKey = await getCurrentKey();

      // The current key's n value must be one of the known fixed fingerprints
      const matched = FIXED_JWK_FINGERPRINTS.some((fp) => fp.n === currentKey.n);
      expect(matched).toBe(true);
    });

    it('exports fixed JWK fingerprints for snapshot verification', () => {
      // Verify the fingerprints array is well-formed
      expect(FIXED_JWK_FINGERPRINTS.length).toBe(3);
      for (const fp of FIXED_JWK_FINGERPRINTS) {
        expect(fp.n).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(fp.e).toBe('AQAB');
      }
    });

    it('produces the same key n-values across repeated imports', async () => {
      const k1 = await getCurrentKey();
      const k2 = await getCurrentKey();
      expect(k1.n).toBe(k2.n);
      expect(k1.e).toBe(k2.e);
      // Key components that define the RSA public key are identical
    });

    it('every key returned matches a known fixed fingerprint', async () => {
      const allKeys = await getAllKeys();
      for (const key of allKeys) {
        const matched = FIXED_JWK_FINGERPRINTS.some((fp) => fp.n === key.n);
        expect(matched).toBe(true);
      }
    });
  });
});
