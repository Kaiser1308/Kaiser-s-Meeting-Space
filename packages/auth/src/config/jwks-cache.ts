import type { OidcCacheConfig, OidcRetryConfig } from './oidc';

export interface JwksKey {
  kid: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  crv?: string;
}

export interface JwksResponse {
  keys: JwksKey[];
}

export interface CachedJwks {
  keys: Map<string, JwksKey>;
  fetchedAt: number;
  lastAccessedAt: number;
  expiresAt: number;
  staleAt: number;
}

export interface JwksFetchResult {
  keys: Map<string, JwksKey>;
  fromCache: boolean;
  stale: boolean;
}

export class JwksCache {
  private cache = new Map<string, CachedJwks>();
  private fetchInProgress = new Map<string, Promise<CachedJwks>>();
  private generation = 0;

  constructor(
    private readonly config: OidcCacheConfig,
    private readonly retryConfig: OidcRetryConfig,
    private readonly fetchFn: (uri: string) => Promise<JwksResponse>,
  ) {}

  async getJwks(issuer: string): Promise<JwksFetchResult> {
    const now = Date.now();

    const cached = this.cache.get(issuer);
    if (cached && cached.expiresAt > now) {
      cached.lastAccessedAt = now;
      return {
        keys: cached.keys,
        fromCache: true,
        stale: false,
      };
    }

    if (cached && cached.staleAt > now) {
      cached.lastAccessedAt = now;
      void this.refreshInBackground(issuer).catch(() => undefined);
      return {
        keys: cached.keys,
        fromCache: true,
        stale: true,
      };
    }

    const inProgress = this.fetchInProgress.get(issuer);
    if (inProgress) {
      const refreshed = await inProgress;
      return { keys: refreshed.keys, fromCache: false, stale: false };
    }

    return await this.fetchWithRetry(issuer);
  }

  private async refreshInBackground(issuer: string): Promise<void> {
    if (this.fetchInProgress.has(issuer)) {
      return;
    }

    const promise = this.fetchWithRetry(issuer).then((result) => {
      const cached = this.cache.get(issuer);
      if (cached) {
        cached.keys = result.keys;
        cached.fetchedAt = Date.now();
        cached.lastAccessedAt = Date.now();
        cached.expiresAt = Date.now() + this.config.ttlSeconds * 1000;
        cached.staleAt = Date.now() + this.config.staleWhileRevalidateSeconds * 1000;
      }
      return this.cache.get(issuer)!;
    });

    this.fetchInProgress.set(issuer, promise);
    try {
      await promise;
    } finally {
      this.fetchInProgress.delete(issuer);
    }
  }

  private async fetchWithRetry(issuer: string): Promise<JwksFetchResult> {
    const existing = this.fetchInProgress.get(issuer);
    if (existing) {
      const refreshed = await existing;
      return { keys: refreshed.keys, fromCache: false, stale: false };
    }

    const generation = this.generation;
    const promise = this.fetchWithRetryUncoordinated(issuer, generation);
    this.fetchInProgress.set(
      issuer,
      promise.then((result) => ({
        keys: result.keys,
        fetchedAt: Date.now(),
        lastAccessedAt: Date.now(),
        expiresAt: Date.now() + this.config.ttlSeconds * 1000,
        staleAt: Date.now() + this.config.staleWhileRevalidateSeconds * 1000,
      })),
    );
    void this.fetchInProgress.get(issuer)?.catch(() => undefined);
    try {
      return await promise;
    } finally {
      this.fetchInProgress.delete(issuer);
    }
  }

  private async fetchWithRetryUncoordinated(
    issuer: string,
    generation: number,
  ): Promise<JwksFetchResult> {
    const cached = this.cache.get(issuer);

    if (this.retryConfig.cacheOnlyOnOutage && cached && cached.staleAt > Date.now()) {
      return {
        keys: cached.keys,
        fromCache: true,
        stale: true,
      };
    }

    let lastError: Error | undefined;
    let backoffMs = this.retryConfig.initialBackoffMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.fetchFn(issuer);
        const keys = this.parseJwksResponse(response);

        const now = Date.now();
        const cachedJwks: CachedJwks = {
          keys,
          fetchedAt: now,
          lastAccessedAt: now,
          expiresAt: now + this.config.ttlSeconds * 1000,
          staleAt: now + this.config.staleWhileRevalidateSeconds * 1000,
        };

        if (generation === this.generation) {
          this.cache.set(issuer, cachedJwks);
          this.evictIfNeeded();
        }

        return {
          keys,
          fromCache: false,
          stale: false,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.message === 'Malformed JWKS response') {
          break;
        }

        if (attempt < this.retryConfig.maxRetries) {
          await this.sleep(backoffMs);
          backoffMs = Math.min(backoffMs * 4, this.retryConfig.maxBackoffMs);
        }
      }
    }

    if (cached && cached.staleAt > Date.now()) {
      return {
        keys: cached.keys,
        fromCache: true,
        stale: true,
      };
    }

    throw new Error(
      `Failed to fetch JWKS after ${this.retryConfig.maxRetries + 1} attempts: ${lastError?.message}`,
    );
  }

  private parseJwksResponse(response: JwksResponse): Map<string, JwksKey> {
    const keys = new Map<string, JwksKey>();

    if (!response || !Array.isArray(response.keys)) {
      throw new Error('Malformed JWKS response');
    }

    for (const key of response.keys) {
      if (key.kid) {
        if (key.kty === 'RSA' && (!key.n || !key.e)) {
          throw new Error('Malformed JWKS key');
        }
        keys.set(key.kid, key);
      }
    }

    if (keys.size === 0) {
      throw new Error('Malformed JWKS response');
    }

    return keys;
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.config.maxSize) {
      return;
    }

    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    const toEvict = entries.slice(0, this.cache.size - this.config.maxSize);
    for (const [issuer] of toEvict) {
      this.cache.delete(issuer);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  clear(): void {
    this.generation += 1;
    this.cache.clear();
    this.fetchInProgress.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
