import { describe, expect, it } from 'vitest';
import { ClientAuth, type OAuthTransport } from './auth-client';
import { createFakeSecureStorage, createKeytarSecureStorage } from './secure-storage';

const transport = (): OAuthTransport => ({
  exchangeCode: async ({ code }) => ({
    accessToken: `access-${code}`,
    refreshToken: 'refresh',
    expiresIn: 300,
  }),
  refresh: async ({ refreshToken }) => ({
    accessToken: `next-${refreshToken}`,
    refreshToken: 'rotated',
    expiresIn: 300,
  }),
  revoke: async () => undefined,
});

describe('desktop client auth', () => {
  it('persists values through the OS keychain backend', async () => {
    const values = new Map<string, string>();
    const storage = createKeytarSecureStorage({
      getPassword: async (_service, account) => values.get(account) ?? null,
      setPassword: async (_service, account, value) => void values.set(account, value),
      deletePassword: async (_service, account) => values.delete(account),
    });

    await storage.set('refresh', 'secret');
    expect(await storage.get('refresh')).toBe('secret');
    await storage.remove('refresh');
    expect(await storage.get('refresh')).toBeNull();
  });

  it('uses S256 PKCE and does not return the verifier', async () => {
    const auth = new ClientAuth({
      clientId: 'desktop-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage: createFakeSecureStorage(),
      transport: transport(),
    });
    const request = await auth.beginLogin();
    expect(request.url).toContain('code_challenge_method=S256');
    expect(request.url).toContain('state=');
    expect(request.url).not.toContain('code_verifier');
  });

  it('rejects state mismatch, rotates refresh, and logs out', async () => {
    const storage = createFakeSecureStorage();
    const auth = new ClientAuth({
      clientId: 'desktop-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage,
      transport: transport(),
    });
    const request = await auth.beginLogin();
    const nonce = new URL(request.url).searchParams.get('nonce')!;
    await expect(auth.completeLogin({ code: 'x', state: 'wrong', nonce: 'wrong' })).rejects.toThrow(
      'state',
    );
    await auth.completeLogin({ code: 'x', state: request.state, nonce });
    await auth.refresh();
    expect(await storage.get('kms.auth.refresh-token')).toBe('rotated');
    await auth.logout();
    expect(await storage.get('kms.auth.refresh-token')).toBeNull();
  });
});
