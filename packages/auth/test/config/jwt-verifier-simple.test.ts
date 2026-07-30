import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOidcConfig } from '../../src/config/oidc.ts';
import { createJwtVerifier } from '../../src/config/jwt-verifier.ts';
import { createLocalIssuer, generateToken } from '../../src/fixtures/local-issuer.ts';

describe('JwtVerifier - Core Functionality', () => {
  let localIssuer: Awaited<ReturnType<typeof createLocalIssuer>>;
  let verifier: ReturnType<typeof createJwtVerifier>;

  beforeEach(async () => {
    vi.useFakeTimers({ now: 1721702400000 });
    localIssuer = await createLocalIssuer();

    const config = createOidcConfig({
      issuers: [
        {
          issuer: 'https://test-issuer-synthetic.example.com',
          jwksUri: 'https://test-issuer-synthetic.example.com/.well-known/jwks.json',
          audience: ['https://kaiser-meeting-space.example.com'],
          algorithms: ['RS256'],
        },
      ],
    });

    verifier = createJwtVerifier(config, async (uri) => {
      if (uri.includes('jwks.json')) {
        return {
          ok: true,
          json: async () => await localIssuer.getJWKS(),
        } as Response;
      }
      throw new Error(`Unknown URI: ${uri}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Valid token validation', () => {
    it('should verify valid token', async () => {
      const token = await generateToken('valid', 'test-user-123');
      const result = await verifier.verify({ token });

      expect(result.valid).toBe(true);
      expect(result.issuer).toBe('https://test-issuer-synthetic.example.com');
      expect(result.subject).toBe('test-user-123');
      expect(result.audience).toEqual(['https://kaiser-meeting-space.example.com']);
      expect(result.expiresAt).toBeDefined();
      expect(result.error).toBeUndefined();
    });
  });

  describe('Invalid token scenarios', () => {
    it('should reject expired token', async () => {
      const token = await generateToken('expired', 'test-user-123');
      const result = await verifier.verify({ token });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
      expect(result.errorDetails?.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject future token', async () => {
      const token = await generateToken('future', 'test-user-123');
      const result = await verifier.verify({ token });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token not yet valid');
      expect(result.errorDetails?.code).toBe('TOKEN_NOT_YET_VALID');
    });

    it('should reject wrong audience', async () => {
      const token = await generateToken('wrong-audience', 'test-user-123');
      const result = await verifier.verify({ token });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid audience');
      expect(result.errorDetails?.code).toBe('INVALID_AUDIENCE');
    });

    it('should reject wrong issuer', async () => {
      const token = await generateToken('wrong-issuer', 'test-user-123');
      const result = await verifier.verify({ token });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unknown issuer');
    });

    it('should reject wrong algorithm', async () => {
      const token = await generateToken('wrong-algorithm', 'test-user-123');
      const result = await verifier.verify({ token });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Algorithm not allowed');
    });

    it('should reject revoked token', async () => {
      const token = await generateToken('revoked', 'test-user-123');
      const result = await verifier.verify({ token });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('should reject disabled issuer token', async () => {
      const token = await generateToken('disabled-issuer', 'test-user-123');
      const result = await verifier.verify({ token });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unknown issuer');
    });
  });

  describe('Error redaction', () => {
    it('should mark all errors as redacted', async () => {
      const invalidToken = 'invalid-token';
      const result = await verifier.verify({ token: invalidToken });

      expect(result.errorDetails?.redacted).toBe(true);
    });
  });

  describe('All required token scenarios from P04-T06', () => {
    it('should handle valid token scenario', async () => {
      const token = await generateToken('valid', 'test-user');
      const result = await verifier.verify({ token });
      expect(result.valid).toBe(true);
    });

    it('should handle expired token scenario', async () => {
      const token = await generateToken('expired', 'test-user');
      const result = await verifier.verify({ token });
      expect(result.valid).toBe(false);
      expect(result.errorDetails?.code).toBe('TOKEN_EXPIRED');
    });

    it('should handle future token scenario', async () => {
      const token = await generateToken('future', 'test-user');
      const result = await verifier.verify({ token });
      expect(result.valid).toBe(false);
      expect(result.errorDetails?.code).toBe('TOKEN_NOT_YET_VALID');
    });

    it('should handle wrong audience scenario', async () => {
      const token = await generateToken('wrong-audience', 'test-user');
      const result = await verifier.verify({ token });
      expect(result.valid).toBe(false);
      expect(result.errorDetails?.code).toBe('INVALID_AUDIENCE');
    });

    it('should handle wrong issuer scenario', async () => {
      const token = await generateToken('wrong-issuer', 'test-user');
      const result = await verifier.verify({ token });
      expect(result.valid).toBe(false);
    });

    it('should handle wrong algorithm scenario', async () => {
      const token = await generateToken('wrong-algorithm', 'test-user');
      const result = await verifier.verify({ token });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Algorithm not allowed');
    });

    it('should handle wrong key scenario', async () => {
      const token = await generateToken('wrong-key', 'test-user');
      const result = await verifier.verify({ token });
      expect(result.valid).toBe(false);
    });

    it('should handle revoked token scenario', async () => {
      const token = await generateToken('revoked', 'test-user');
      const result = await verifier.verify({ token });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('should handle disabled issuer scenario', async () => {
      const token = await generateToken('disabled-issuer', 'test-user');
      const result = await verifier.verify({ token });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unknown issuer');
    });
  });
});
