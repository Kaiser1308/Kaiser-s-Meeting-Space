import { describe, it, expect } from 'vitest';
import { generateJWKS } from '@kms/auth';

describe('jwks.ts - JWKS endpoint simulation', () => {
  describe('generateJWKS', () => {
    it('should return a valid JWKS structure', async () => {
      const jwks = await generateJWKS();

      expect(jwks).toBeDefined();
      expect(jwks.keys).toBeDefined();
      expect(Array.isArray(jwks.keys)).toBe(true);
    });

    it('should include all keys without private components', async () => {
      const jwks = await generateJWKS();

      jwks.keys.forEach((key) => {
        expect(key.kty).toBeDefined();
        expect(key.kid).toBeDefined();
        expect(key.n).toBeDefined(); // Public modulus
        expect(key.e).toBeDefined(); // Public exponent
        expect(key.d).toBeUndefined(); // No private exponent in JWKS
      });
    });

    it('should mark all keys as test-only', async () => {
      const jwks = await generateJWKS();

      jwks.keys.forEach((key) => {
        expect(key.kid).toContain('test-issuer');
        expect(key.kid).toContain('synthetic');
      });
    });

    it('should include current key in JWKS', async () => {
      const jwks = await generateJWKS();

      const hasCurrentKey = jwks.keys.some((key) => key.kid.includes('current'));
      expect(hasCurrentKey).toBe(true);
    });

    it('should include previous key in JWKS for rotation', async () => {
      const jwks = await generateJWKS();

      const hasPreviousKey = jwks.keys.some((key) => key.kid.includes('previous'));
      expect(hasPreviousKey).toBe(true);
    });

    it('should not include next key in JWKS (not yet active)', async () => {
      const jwks = await generateJWKS();

      const hasNextKey = jwks.keys.some((key) => key.kid.includes('next'));
      expect(hasNextKey).toBe(false);
    });

    it('should return deterministic JWKS', async () => {
      const jwks1 = await generateJWKS();
      const jwks2 = await generateJWKS();

      expect(jwks1.keys.length).toBe(jwks2.keys.length);
      jwks1.keys.forEach((key, index) => {
        expect(key.kid).toBe(jwks2.keys[index].kid);
        expect(key.n).toBe(jwks2.keys[index].n);
      });
    });

    it('should include key use and algorithm', async () => {
      const jwks = await generateJWKS();

      jwks.keys.forEach((key) => {
        expect(key.use).toBe('sig'); // Signing
        expect(key.alg).toBeDefined();
      });
    });
  });

  describe('synthetic JWKS properties', () => {
    it('should prove JWKS contains only synthetic keys', async () => {
      const jwks = await generateJWKS();

      jwks.keys.forEach((key) => {
        expect(key.kid).toMatch(/test-issuer-synthetic/);
        expect(key.kid).not.toMatch(/prod|production|real|live/);
      });
    });

    it('should have clear indication it is a test fixture', async () => {
      const jwks = await generateJWKS();

      // Check if the JWKS has some indication it's synthetic
      const hasSyntheticKey = jwks.keys.some(
        (key) => key.kid.includes('synthetic') || key.kid.includes('test'),
      );
      expect(hasSyntheticKey).toBe(true);
    });
  });
});
