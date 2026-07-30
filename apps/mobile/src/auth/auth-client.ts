import { createCodeChallenge, randomUrlSafeValue } from './pkce';
import type { SecureStorage } from './secure-storage';

const REFRESH_KEY = 'kms.auth.refresh-token';
const TRANSACTION_KEY = 'kms.auth.pkce-transaction';

export interface OAuthTransport {
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenResponse>;
  refresh(input: { refreshToken: string }): Promise<TokenResponse>;
  revoke(input: { refreshToken: string }): Promise<void>;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  idToken?: { nonce?: string };
}

export interface AuthConfig {
  clientId: string;
  redirectUri: string;
  authorizationEndpoint: string;
  storage: SecureStorage;
  transport: OAuthTransport;
}

export interface LoginRequest {
  url: string;
  state: string;
}

export interface SessionInfo {
  expiresAt: number;
}

interface Transaction {
  state: string;
  nonce: string;
  verifier: string;
}

export class ClientAuth {
  private readonly config: AuthConfig;
  private accessToken: string | null = null;
  private session: SessionInfo | null = null;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  async beginLogin(): Promise<LoginRequest> {
    const transaction: Transaction = {
      state: randomUrlSafeValue(),
      nonce: randomUrlSafeValue(),
      verifier: randomUrlSafeValue(48),
    };
    const challenge = await createCodeChallenge(transaction.verifier);
    await this.config.storage.set(TRANSACTION_KEY, JSON.stringify(transaction));
    const url = new URL(this.config.authorizationEndpoint);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile offline_access');
    url.searchParams.set('state', transaction.state);
    url.searchParams.set('nonce', transaction.nonce);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return { url: url.toString(), state: transaction.state };
  }

  async completeLogin(callback: {
    code: string;
    state: string;
    nonce?: string;
  }): Promise<SessionInfo> {
    const raw = await this.config.storage.get(TRANSACTION_KEY);
    if (!raw) throw new Error('callback replay');
    const transaction = JSON.parse(raw) as Transaction;
    if (callback.state !== transaction.state) throw new Error('state mismatch');
    if (callback.nonce !== undefined && callback.nonce !== transaction.nonce) throw new Error('nonce mismatch');
    await this.config.storage.remove(TRANSACTION_KEY);
    const tokens = await this.config.transport.exchangeCode({
      code: callback.code,
      codeVerifier: transaction.verifier,
      redirectUri: this.config.redirectUri,
    });
    if (tokens.idToken?.nonce !== undefined && tokens.idToken.nonce !== transaction.nonce) {
      throw new Error('nonce mismatch');
    }
    return this.commitTokens(tokens);
  }

  async refresh(): Promise<SessionInfo> {
    const refreshToken = await this.config.storage.get(REFRESH_KEY);
    if (!refreshToken) throw new Error('refresh token unavailable');
    const tokens = await this.config.transport.refresh({ refreshToken });
    return this.commitTokens(tokens);
  }

  async logout(): Promise<void> {
    const refreshToken = await this.config.storage.get(REFRESH_KEY);
    if (refreshToken) await this.config.transport.revoke({ refreshToken });
    await this.config.storage.remove(REFRESH_KEY);
    this.accessToken = null;
    this.session = null;
  }

  getSession(): SessionInfo | null {
    return this.session;
  }

  async withAccessToken<T>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    if (!this.accessToken) throw new Error('not authenticated');
    return operation(this.accessToken);
  }

  private async commitTokens(tokens: TokenResponse): Promise<SessionInfo> {
    if (!tokens.refreshToken) throw new Error('refresh token missing');
    try {
      await this.config.storage.set(REFRESH_KEY, tokens.refreshToken);
    } catch {
      this.accessToken = null;
      this.session = null;
      throw new Error('secure storage unavailable');
    }
    this.accessToken = tokens.accessToken;
    this.session = { expiresAt: Date.now() + tokens.expiresIn * 1000 };
    return this.session;
  }
}
