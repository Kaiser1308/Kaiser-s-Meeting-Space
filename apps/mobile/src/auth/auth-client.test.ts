import { describe, expect, it } from 'vitest';
import { createFakeSecureStorage } from './secure-storage';
import { ClientAuth, type OAuthTransport } from './auth-client';

const transport = (overrides: Partial<OAuthTransport> = {}): OAuthTransport => ({
  exchangeCode: async ({ code, codeVerifier }) => ({
    accessToken: `access-${code}`,
    refreshToken: `refresh-${codeVerifier}`,
    expiresIn: 300,
  }),
  refresh: async ({ refreshToken }) => ({
    accessToken: `next-${refreshToken}`,
    refreshToken: `rotated-${refreshToken}`,
    expiresIn: 300,
  }),
  revoke: async () => undefined,
  ...overrides,
});

describe('mobile client auth', () => {
  it('creates a PKCE authorization request with state, nonce, and verifier', async () => {
    const auth = new ClientAuth({
      clientId: 'mobile-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage: createFakeSecureStorage(),
      transport: transport(),
    });

    const request = await auth.beginLogin();

    expect(request.url).toContain('code_challenge=');
    expect(request.url).toContain('state=');
    expect(request.url).toContain('nonce=');
    expect(request.url).not.toContain('code_verifier');
  });

  it('rejects callback state mismatch and replay', async () => {
    const auth = new ClientAuth({
      clientId: 'mobile-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage: createFakeSecureStorage(),
      transport: transport(),
    });
    const request = await auth.beginLogin();
    const nonce = new URL(request.url).searchParams.get('nonce')!;

    await expect(
      auth.completeLogin({ code: 'code', state: 'wrong', nonce: 'nonce' }),
    ).rejects.toThrow('state');
    await auth.completeLogin({ code: 'code', state: request.state, nonce });
    await expect(auth.completeLogin({ code: 'code', state: request.state, nonce })).rejects.toThrow(
      'replay',
    );
  });

  it('rejects an exchanged ID token with a mismatched nonce', async () => {
    const auth = new ClientAuth({
      clientId: 'mobile-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage: createFakeSecureStorage(),
      transport: transport({
        exchangeCode: async () => ({
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresIn: 300,
          idToken: { nonce: 'different-nonce' },
        }),
      }),
    });
    const request = await auth.beginLogin();
    const nonce = new URL(request.url).searchParams.get('nonce')!;

    await expect(auth.completeLogin({ code: 'code', state: request.state, nonce })).rejects.toThrow(
      'nonce',
    );
  });

  it('rotates refresh tokens and clears them on logout', async () => {
    const storage = createFakeSecureStorage();
    const auth = new ClientAuth({
      clientId: 'mobile-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage,
      transport: transport(),
    });
    const request = await auth.beginLogin();
    const nonce = new URL(request.url).searchParams.get('nonce')!;
    await auth.completeLogin({ code: 'code', state: request.state, nonce });

    const refreshed = await auth.refresh();
    expect(refreshed).not.toHaveProperty('accessToken');
    expect(await storage.get('kms.auth.refresh-token')).toContain('rotated-');
    await auth.logout();
    expect(await storage.get('kms.auth.refresh-token')).toBeNull();
  });

  it('fails closed when secure storage is unavailable without plaintext fallback', async () => {
    const storage = createFakeSecureStorage({ failWrites: true });
    const auth = new ClientAuth({
      clientId: 'mobile-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage,
      transport: transport(),
    });
    await expect(auth.beginLogin()).rejects.toThrow('secure storage');
    expect(auth.getSession()).toBeNull();
  });
});
