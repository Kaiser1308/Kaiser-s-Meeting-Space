import type { SessionInfo, ClientAuth } from '../../../auth/auth-client';

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'authenticated'; session: SessionInfo }
  | { kind: 'error'; error: string };

export type AuthAction =
  | { type: 'login_start' }
  | { type: 'login_complete'; session: SessionInfo }
  | { type: 'login_error'; error: string }
  | { type: 'refresh_success'; session: SessionInfo }
  | { type: 'refresh_error'; error: string }
  | { type: 'logout' };

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'login_start':
      return { kind: 'loading' };
    case 'login_complete':
      return { kind: 'authenticated', session: action.session };
    case 'login_error':
      return { kind: 'error', error: action.error };
    case 'refresh_success':
      return { kind: 'authenticated', session: action.session };
    case 'refresh_error':
      return { kind: 'error', error: action.error };
    case 'logout':
      return { kind: 'error', error: 'Logged out' };
    default:
      return state;
  }
}

export function createAuthStore({
  client,
  onSessionChange,
}: {
  client: ClientAuth;
  onSessionChange: (session: SessionInfo | null) => void;
}) {
  let state: AuthState = { kind: 'loading' };

  function dispatch(action: AuthAction): void {
    state = authReducer(state, action);
  }

  function getState(): AuthState {
    return state;
  }

  async function initialize(): Promise<void> {
    const session = client.getSession();
    if (session) {
      dispatch({ type: 'login_complete', session });
      onSessionChange(session);
    } else {
      dispatch({ type: 'login_error', error: 'Session not found' });
    }
  }

  async function refresh(): Promise<void> {
    try {
      const session = await client.refresh();
      dispatch({ type: 'refresh_success', session });
      onSessionChange(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'refresh failed';
      dispatch({ type: 'refresh_error', error: message });
    }
  }

  async function logout(): Promise<void> {
    await client.logout();
    dispatch({ type: 'logout' });
    onSessionChange(null);
  }

  return {
    getState,
    dispatch,
    initialize,
    refresh,
    logout,
  };
}
