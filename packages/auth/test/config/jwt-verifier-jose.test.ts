import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createOidcConfig } from '../../src/config/oidc.ts';
import { createJwtVerifier } from '../../src/config/jwt-verifier.ts';

describe('JwtVerifier - Integration Tests', () => {
  let verifier: ReturnType<typeof createJwtVerifier>;
  let mockFetchFn: ReturnType<typeof vi.fn>;
  let privateKey: CryptoKey;
  let publicJwk: Record<string, unknown>;

  beforeEach(async () => {
    vi.useFakeTimers({ now: 1721702400000 });
    mockFetchFn = vi.fn();
    const generated = await generateKeyPair('RS256', { extractable: true });
    privateKey = generated.privateKey as CryptoKey;
    publicJwk = {
      ...(await exportJWK(generated.publicKey)),
      kid: 'test-key-id',
      use: 'sig',
      alg: 'RS256',
    };
    verifier = createJwtVerifier(
      createOidcConfig({
        issuers: [
          {
            issuer: 'https://test-issuer-synthetic.example.com',
            jwksUri: 'https://test-issuer-synthetic.example.com/.well-known/jwks.json',
            audience: ['https://kaiser-meeting-space.example.com'],
            algorithms: ['RS256'],
          },
        ],
      }),
      mockFetchFn,
    );
  });

  it('should verify a valid token signed with jose', async () => {
    mockFetchFn.mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [publicJwk] }) });
    const token = await new SignJWT({
      sub: 'test-user-123',
      aud: 'https://kaiser-meeting-space.example.com',
      iss: 'https://test-issuer-synthetic.example.com',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const result = await verifier.verify({ token });
    expect(result.valid).toBe(true);
    expect(result.subject).toBe('test-user-123');
  });

  it('should reject token without kid', async () => {
    const token = await new SignJWT({
      sub: 'test-user-123',
      aud: 'https://kaiser-meeting-space.example.com',
      iss: 'https://test-issuer-synthetic.example.com',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const result = await verifier.verify({ token });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('key ID');
  });

  it('redacts invalid-token errors', async () => {
    const result = await verifier.verify({ token: 'invalid-token' });
    expect(result.valid).toBe(false);
    expect(result.errorDetails?.redacted).toBe(true);
  });
});
