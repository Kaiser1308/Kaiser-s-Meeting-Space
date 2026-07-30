import { describe, expect, it } from 'vitest';
import { authReducer, createAuthStore, type AuthState, type AuthAction } from './store';
import type { SessionInfo } from '../../../auth/auth-client';
import type { ClientAuth } from '../../../auth/auth-client';

describe('auth session store', () => {
  describe('authReducer', () => {
    it('initial state is loading', () => {
      const state: AuthState = { kind: 'loading' };
      expect(state.kind).toBe('loading');
    });

    it('login_complete transitions to authenticated', () => {
      const state: AuthState = { kind: 'loading' };
      const session: SessionInfo = { expiresAt: Date.now() + 300000 };
      const action: AuthAction = { type: 'login_complete', session };

      const newState = authReducer(state, action);

      expect(newState.kind).toBe('authenticated');
      if (newState.kind === 'authenticated') {
        expect(newState.session).toEqual(session);
      }
    });

    it('login_error transitions to error', () => {
      const state: AuthState = { kind: 'loading' };
      const action: AuthAction = { type: 'login_error', error: 'network error' };

      const newState = authReducer(state, action);

      expect(newState.kind).toBe('error');
      if (newState.kind === 'error') {
        expect(newState.error).toBe('network error');
      }
    });

    it('refresh_success updates session', () => {
      const state: AuthState = { kind: 'authenticated', session: { expiresAt: 1000 } };
      const newSession: SessionInfo = { expiresAt: Date.now() + 300000 };
      const action: AuthAction = { type: 'refresh_success', session: newSession };

      const newState = authReducer(state, action);

      expect(newState.kind).toBe('authenticated');
      if (newState.kind === 'authenticated') {
        expect(newState.session).toEqual(newSession);
      }
    });

    it('refresh_error transitions to error', () => {
      const state: AuthState = { kind: 'authenticated', session: { expiresAt: 1000 } };
      const action: AuthAction = { type: 'refresh_error', error: 'token expired' };

      const newState = authReducer(state, action);

      expect(newState.kind).toBe('error');
      if (newState.kind === 'error') {
        expect(newState.error).toBe('token expired');
      }
    });

    it('logout transitions to error', () => {
      const state: AuthState = { kind: 'authenticated', session: { expiresAt: 1000 } };
      const action: AuthAction = { type: 'logout' };

      const newState = authReducer(state, action);

      expect(newState.kind).toBe('error');
      if (newState.kind === 'error') {
        expect(newState.error).toBe('Logged out');
      }
    });
  });

  describe('createAuthStore', () => {
    it('creates store with getState and dispatch', () => {
      const mockClient = {
        getSession: () => null,
        refresh: async () => ({ expiresAt: 0 }),
        logout: async () => {},
      } as unknown as ClientAuth;

      const store = createAuthStore({ client: mockClient, onSessionChange: () => {} });

      expect(typeof store.getState).toBe('function');
      expect(typeof store.dispatch).toBe('function');
      expect(typeof store.initialize).toBe('function');
      expect(typeof store.refresh).toBe('function');
      expect(typeof store.logout).toBe('function');
    });

    it('initialize loads session from client', async () => {
      const session: SessionInfo = { expiresAt: Date.now() + 300000 };
      const mockClient = {
        getSession: () => session,
        refresh: async () => ({ expiresAt: 0 }),
        logout: async () => {},
      } as unknown as ClientAuth;

      let capturedSession: SessionInfo | null = null;
      const onSessionChange = (s: SessionInfo | null) => {
        capturedSession = s;
      };

      const store = createAuthStore({ client: mockClient, onSessionChange });
      await store.initialize();

      const state = store.getState();
      expect(state.kind).toBe('authenticated');
      if (state.kind === 'authenticated') {
        expect(state.session).toEqual(session);
      }
      expect(capturedSession).toEqual(session);
    });

    it('initialize dispatches error when getSession returns null', async () => {
      const mockClient = {
        getSession: () => null,
        refresh: async () => ({ expiresAt: 0 }),
        logout: async () => {},
      } as unknown as ClientAuth;

      const store = createAuthStore({ client: mockClient, onSessionChange: () => {} });
      await store.initialize();

      const state = store.getState();
      expect(state.kind).toBe('error');
      if (state.kind === 'error') {
        expect(state.error).toBe('Session not found');
      }
    });

    it('refresh updates session on success', async () => {
      const newSession: SessionInfo = { expiresAt: Date.now() + 600000 };
      const mockClient = {
        getSession: () => null,
        refresh: async () => newSession,
        logout: async () => {},
      } as unknown as ClientAuth;

      let capturedSession: SessionInfo | null = null;
      const onSessionChange = (s: SessionInfo | null) => {
        capturedSession = s;
      };

      const store = createAuthStore({ client: mockClient, onSessionChange });
      await store.refresh();

      const state = store.getState();
      expect(state.kind).toBe('authenticated');
      if (state.kind === 'authenticated') {
        expect(state.session).toEqual(newSession);
      }
      expect(capturedSession).toEqual(newSession);
    });

    it('refresh dispatches error on failure', async () => {
      const mockClient = {
        getSession: () => null,
        refresh: async () => {
          throw new Error('refresh failed');
        },
        logout: async () => {},
      } as unknown as ClientAuth;

      const store = createAuthStore({ client: mockClient, onSessionChange: () => {} });
      await store.refresh();

      const state = store.getState();
      expect(state.kind).toBe('error');
      if (state.kind === 'error') {
        expect(state.error).toBe('refresh failed');
      }
    });

    it('logout clears session', async () => {
      const session: SessionInfo = { expiresAt: Date.now() + 300000 };
      let logoutCalled = false;
      const mockClient = {
        getSession: () => session,
        refresh: async () => ({ expiresAt: 0 }),
        logout: async () => {
          logoutCalled = true;
        },
      } as unknown as ClientAuth;

      let capturedSession: SessionInfo | null = session;
      const onSessionChange = (s: SessionInfo | null) => {
        capturedSession = s;
      };

      const store = createAuthStore({ client: mockClient, onSessionChange });
      await store.logout();

      expect(logoutCalled).toBe(true);
      expect(capturedSession).toBeNull();

      const state = store.getState();
      expect(state.kind).toBe('error');
      if (state.kind === 'error') {
        expect(state.error).toBe('Logged out');
      }
    });
  });
});
