import { describe, it, expect } from 'vitest';
import { LocalIssuer, generateToken, getIssuerConfig } from '@kms/auth';

describe('local-issuer.ts - Local OIDC test issuer', () => {
  describe('getIssuerConfig', () => {
    it('should return issuer configuration with test-only indication', async () => {
      const config = await getIssuerConfig();

      expect(config).toBeDefined();
      expect(config.issuer).toBeDefined();
      expect(config.issuer).toContain('test-issuer');
      expect(config.audience).toBeDefined();
    });

    it('should have deterministic configuration', async () => {
      const config1 = await getIssuerConfig();
      const config2 = await getIssuerConfig();

      expect(config1.issuer).toBe(config2.issuer);
      expect(config1.audience).toBe(config2.audience);
    });
  });

  describe('LocalIssuer', () => {
    it('should create a local issuer instance', async () => {
      const issuer = await new LocalIssuer();

      expect(issuer).toBeDefined();
      expect(await issuer.getIssuer()).toContain('test-issuer');
    });

    it('should support key rotation scenarios', async () => {
      const issuer = await new LocalIssuer();

      const current = await issuer.getCurrentKeyId();
      const previous = await issuer.getPreviousKeyId();
      const next = await issuer.getNextKeyId();
      expect(current).toBeDefined();
      expect(previous).toBeDefined();
      expect(next).toBeDefined();

      expect(current).not.toBe(previous);
      expect(current).not.toBe(next);
    });

    it('should generate deterministic key IDs', async () => {
      const issuer1 = await new LocalIssuer();
      const issuer2 = await new LocalIssuer();

      expect(await issuer1.getCurrentKeyId()).toBe(await issuer2.getCurrentKeyId());
      expect(await issuer1.getPreviousKeyId()).toBe(await issuer2.getPreviousKeyId());
    });

    it('should provide JWKS endpoint data', async () => {
      const issuer = await new LocalIssuer();
      const jwks = await issuer.getJWKS();

      expect(jwks).toBeDefined();
      expect(jwks.keys).toBeDefined();
      expect(Array.isArray(jwks.keys)).toBe(true);
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await generateToken('valid');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // JWT has 3 parts separated by dots
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should generate deterministic tokens for same scenario', async () => {
      const token1 = await generateToken('valid', 'user123');
      const token2 = await generateToken('valid', 'user123');

      expect(token1).toBe(token2);
    });

    it('should generate different tokens for different users', async () => {
      const token1 = await generateToken('valid', 'user123');
      const token2 = await generateToken('valid', 'user456');

      expect(token1).not.toBe(token2);
    });

    it('should support expired token scenario', async () => {
      const token = await generateToken('expired', 'user123');

      expect(token).toBeDefined();
      // Token should exist but be expired
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should support future token scenario', async () => {
      const token = await generateToken('future', 'user123');

      expect(token).toBeDefined();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should support wrong audience scenario', async () => {
      const token = await generateToken('wrong-audience', 'user123');

      expect(token).toBeDefined();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should support wrong issuer scenario', async () => {
      const token = await generateToken('wrong-issuer', 'user123');

      expect(token).toBeDefined();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should support wrong algorithm scenario', async () => {
      const token = await generateToken('wrong-algorithm', 'user123');

      expect(token).toBeDefined();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should support wrong key scenario', async () => {
      const token = await generateToken('wrong-key', 'user123');

      expect(token).toBeDefined();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should support revoked token scenario', async () => {
      const token = await generateToken('revoked', 'user123');

      expect(token).toBeDefined();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should support disabled issuer scenario', async () => {
      const token = await generateToken('disabled-issuer', 'user123');

      expect(token).toBeDefined();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });
  });

  describe('synthetic issuer properties', () => {
    it('should prove issuer is synthetic', async () => {
      const config = await getIssuerConfig();
      const issuer = await new LocalIssuer();

      expect(config.issuer).toMatch(/test-issuer/);
      expect(await issuer.getIssuer()).toMatch(/test-issuer/);
      expect(config.issuer).not.toMatch(
        /accounts\.google\.com|login\.microsoftonline\.com|api\.auth0\.com/,
      );
    });

    it('should have clear indication it is a test fixture', async () => {
      const issuer = await new LocalIssuer();
      const jwks = await issuer.getJWKS();

      const hasSyntheticKey = jwks.keys.some(
        (key) => key.kid.includes('synthetic') || key.kid.includes('test'),
      );
      expect(hasSyntheticKey).toBe(true);
    });
  });
});
