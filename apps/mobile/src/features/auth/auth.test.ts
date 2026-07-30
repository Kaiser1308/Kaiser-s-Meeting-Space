import { describe, expect, it } from 'vitest';
import { ClientAuth, type OAuthTransport } from '../../auth/auth-client';
import { createPlatformSecureStorage } from './adapters/secure-storage.adapter';
import { createAuthStore } from './session/store';

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

describe('auth integration', () => {
  it('exercises full flow: beginLogin -> completeLogin -> refresh -> logout', async () => {
    const storage = createPlatformSecureStorage();
    const auth = new ClientAuth({
      clientId: 'integration-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage,
      transport: transport(),
    });

    const request = await auth.beginLogin();
    expect(request.url).toContain('code_challenge=');
    expect(request.url).toContain('state=');
    expect(request.url).toContain('nonce=');

    const nonce = new URL(request.url).searchParams.get('nonce')!;
    const session = await auth.completeLogin({ code: 'code', state: request.state, nonce });
    expect(session).toHaveProperty('expiresAt');

    const refreshed = await auth.refresh();
    expect(refreshed).not.toHaveProperty('accessToken');

    await auth.logout();
    expect(auth.getSession()).toBeNull();
  });

  it('callback replay throws on second completeLogin with same state/nonce', async () => {
    const storage = createPlatformSecureStorage();
    const auth = new ClientAuth({
      clientId: 'integration-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage,
      transport: transport(),
    });

    const request = await auth.beginLogin();
    const nonce = new URL(request.url).searchParams.get('nonce')!;

    await auth.completeLogin({ code: 'code', state: request.state, nonce });

    await expect(auth.completeLogin({ code: 'code', state: request.state, nonce })).rejects.toThrow(
      'replay',
    );
  });

  it('createPlatformSecureStorage returns working fake', async () => {
    const storage = createPlatformSecureStorage();

    await storage.set('test-key', 'test-value');
    expect(await storage.get('test-key')).toBe('test-value');

    await storage.remove('test-key');
    expect(await storage.get('test-key')).toBeNull();
  });

  it('logout revokes refresh token and clears session', async () => {
    let revokeCalled = false;
    const testTransport = transport({
      revoke: async () => {
        revokeCalled = true;
      },
    });

    const storage = createPlatformSecureStorage();
    const auth = new ClientAuth({
      clientId: 'integration-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage,
      transport: testTransport,
    });

    const request = await auth.beginLogin();
    const nonce = new URL(request.url).searchParams.get('nonce')!;
    await auth.completeLogin({ code: 'code', state: request.state, nonce });

    expect(await storage.get('kms.auth.refresh-token')).toContain('refresh-');

    await auth.logout();

    expect(revokeCalled).toBe(true);
    expect(await storage.get('kms.auth.refresh-token')).toBeNull();
    expect(auth.getSession()).toBeNull();
  });

  it('auth store integrates with client lifecycle', async () => {
    const storage = createPlatformSecureStorage();
    const auth = new ClientAuth({
      clientId: 'integration-test',
      redirectUri: 'kms://callback',
      authorizationEndpoint: 'https://issuer.test/authorize',
      storage,
      transport: transport(),
    });

    let capturedSession: any = null;
    const onSessionChange = (s: any) => {
      capturedSession = s;
    };
    const store = createAuthStore({
      client: auth,
      onSessionChange,
    });

    await store.initialize();
    expect(store.getState().kind).toBe('error');

    const request = await auth.beginLogin();
    const nonce = new URL(request.url).searchParams.get('nonce')!;
    const session = await auth.completeLogin({ code: 'code', state: request.state, nonce });

    store.dispatch({ type: 'login_complete', session });
    expect(store.getState().kind).toBe('authenticated');
    expect(capturedSession).toBeNull();

    await store.refresh();
    expect(store.getState().kind).toBe('authenticated');

    await store.logout();
    expect(store.getState().kind).toBe('error');
    expect(capturedSession).toBeNull();
  });
});
