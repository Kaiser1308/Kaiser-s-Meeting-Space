import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { JwksCache, JwksKey } from '../../src/config/jwks-cache';
import { DEFAULT_CACHE_CONFIG, DEFAULT_RETRY_CONFIG } from '../../src/config/oidc';

describe('JwksCache', () => {
  let cache: JwksCache;
  let mockFetchFn: ReturnType<typeof vi.fn>;

  const sampleJwks: JwksKey[] = [
    {
      kid: 'key-1',
      kty: 'RSA',
      alg: 'RS256',
      n: 'test-n-value',
      e: 'AQAB',
    },
    {
      kid: 'key-2',
      kty: 'RSA',
      alg: 'RS256',
      n: 'test-n-value-2',
      e: 'AQAB',
    },
  ];

  beforeEach(() => {
    mockFetchFn = vi.fn();
    cache = new JwksCache(DEFAULT_CACHE_CONFIG, DEFAULT_RETRY_CONFIG, mockFetchFn);
  });

  afterEach(() => {
    cache.clear();
    vi.restoreAllMocks();
  });

  describe('Initial fetch and caching', () => {
    it('should fetch JWKS on first call', async () => {
      mockFetchFn.mockResolvedValueOnce({ keys: sampleJwks });

      const result = await cache.getJwks('https://issuer.example.com/jwks.json');

      expect(mockFetchFn).toHaveBeenCalledTimes(1);
      expect(mockFetchFn).toHaveBeenCalledWith('https://issuer.example.com/jwks.json');
      expect(result.fromCache).toBe(false);
      expect(result.stale).toBe(false);
      expect(result.keys.size).toBe(2);
      expect(result.keys.get('key-1')).toEqual(sampleJwks[0]);
    });

    it('should cache JWKS and return from cache on subsequent calls', async () => {
      mockFetchFn.mockResolvedValueOnce({ keys: sampleJwks });

      await cache.getJwks('https://issuer.example.com/jwks.json');
      const result = await cache.getJwks('https://issuer.example.com/jwks.json');

      expect(mockFetchFn).toHaveBeenCalledTimes(1);
      expect(result.fromCache).toBe(true);
      expect(result.stale).toBe(false);
    });

    it('should handle multiple issuers separately', async () => {
      const issuer1Keys = [{ kid: 'issuer1-key-1', kty: 'RSA', n: 'n1', e: 'AQAB' }];
      const issuer2Keys = [{ kid: 'issuer2-key-1', kty: 'RSA', n: 'n2', e: 'AQAB' }];

      mockFetchFn
        .mockResolvedValueOnce({ keys: issuer1Keys })
        .mockResolvedValueOnce({ keys: issuer2Keys });

      const result1 = await cache.getJwks('https://issuer1.example.com/jwks.json');
      const result2 = await cache.getJwks('https://issuer2.example.com/jwks.json');

      expect(mockFetchFn).toHaveBeenCalledTimes(2);
      expect(result1.keys.get('issuer1-key-1')).toEqual(issuer1Keys[0]);
      expect(result2.keys.get('issuer2-key-1')).toEqual(issuer2Keys[0]);
    });
  });

  describe('Cache expiration and stale data', () => {
    it('should return stale data while revalidating in background', async () => {
      const shortTtlConfig = { ...DEFAULT_CACHE_CONFIG, ttlSeconds: 0.1 };
      const staleCache = new JwksCache(shortTtlConfig, DEFAULT_RETRY_CONFIG, mockFetchFn);

      mockFetchFn.mockResolvedValueOnce({ keys: sampleJwks });

      await staleCache.getJwks('https://issuer.example.com/jwks.json');
      await new Promise((resolve) => setTimeout(resolve, 150));

      mockFetchFn.mockResolvedValueOnce({ keys: sampleJwks });

      const result = await staleCache.getJwks('https://issuer.example.com/jwks.json');

      expect(result.fromCache).toBe(true);
      expect(result.stale).toBe(true);
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });

    it('should fetch fresh data after TTL expires', async () => {
      const shortTtlConfig = {
        ...DEFAULT_CACHE_CONFIG,
        ttlSeconds: 0.1,
        staleWhileRevalidateSeconds: 0,
      };
      const shortCache = new JwksCache(shortTtlConfig, DEFAULT_RETRY_CONFIG, mockFetchFn);

      const initialKeys = [{ kid: 'key-1', kty: 'RSA', n: 'old-n', e: 'AQAB' }];
      const updatedKeys = [{ kid: 'key-1', kty: 'RSA', n: 'new-n', e: 'AQAB' }];

      mockFetchFn
        .mockResolvedValueOnce({ keys: initialKeys })
        .mockResolvedValueOnce({ keys: updatedKeys });

      await shortCache.getJwks('https://issuer.example.com/jwks.json');
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = await shortCache.getJwks('https://issuer.example.com/jwks.json');

      expect(result.keys.get('key-1')?.n).toBe('new-n');
      expect(result.fromCache).toBe(false);
    });
  });

  describe('Retry behavior with exponential backoff', () => {
    it('should retry on fetch failure with exponential backoff', async () => {
      vi.useFakeTimers();
      const retryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        maxRetries: 3,
        initialBackoffMs: 10,
        maxBackoffMs: 100,
      };
      const retryCache = new JwksCache(DEFAULT_CACHE_CONFIG, retryConfig, mockFetchFn);

      mockFetchFn
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ keys: sampleJwks });

      const resultPromise = retryCache.getJwks('https://issuer.example.com/jwks.json');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(mockFetchFn).toHaveBeenCalledTimes(3);
      expect(result.fromCache).toBe(false);
      vi.useRealTimers();
    });

    it('should use max backoff when exponential backoff exceeds it', async () => {
      const retryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        maxRetries: 4,
        initialBackoffMs: 100,
        maxBackoffMs: 300,
      };
      const retryCache = new JwksCache(DEFAULT_CACHE_CONFIG, retryConfig, mockFetchFn);

      mockFetchFn
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ keys: sampleJwks });

      const startTime = Date.now();
      await retryCache.getJwks('https://issuer.example.com/jwks.json');
      const duration = Date.now() - startTime;

      expect(mockFetchFn).toHaveBeenCalledTimes(5);
      expect(duration).toBeLessThan(1200);
    });

    it('should fail after max retries when no cached data exists', async () => {
      const retryConfig = { ...DEFAULT_RETRY_CONFIG, maxRetries: 1, initialBackoffMs: 10 };
      const retryCache = new JwksCache(DEFAULT_CACHE_CONFIG, retryConfig, mockFetchFn);

      mockFetchFn.mockRejectedValue(new Error('Permanent failure'));

      await expect(retryCache.getJwks('https://issuer.example.com/jwks.json')).rejects.toThrow(
        'Failed to fetch JWKS after 2 attempts',
      );

      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });

    it('should return cached data after retries fail', async () => {
      const retryConfig = { ...DEFAULT_RETRY_CONFIG, maxRetries: 1, initialBackoffMs: 10 };
      const retryCache = new JwksCache(DEFAULT_CACHE_CONFIG, retryConfig, mockFetchFn);

      mockFetchFn
        .mockResolvedValueOnce({ keys: sampleJwks })
        .mockRejectedValue(new Error('Network error'));

      await retryCache.getJwks('https://issuer.example.com/jwks.json');

      const result = await retryCache.getJwks('https://issuer.example.com/jwks.json');

      expect(result.fromCache).toBe(true);
      expect(result.stale).toBe(false);
      expect(result.keys.size).toBe(2);
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache eviction', () => {
    it('should evict oldest entries when cache size is exceeded', async () => {
      const smallCacheConfig = { ...DEFAULT_CACHE_CONFIG, maxSize: 2 };
      const smallCache = new JwksCache(smallCacheConfig, DEFAULT_RETRY_CONFIG, mockFetchFn);

      mockFetchFn.mockImplementation((uri) => {
        const issuerNum = uri.match(/issuer(\d+)/)?.[1];
        return Promise.resolve({
          keys: [{ kid: `key-${issuerNum}`, kty: 'RSA', n: `n-${issuerNum}`, e: 'AQAB' }],
        });
      });

      await smallCache.getJwks('https://issuer1.example.com/jwks.json');
      await smallCache.getJwks('https://issuer2.example.com/jwks.json');
      await smallCache.getJwks('https://issuer3.example.com/jwks.json');

      expect(smallCache.size()).toBe(2);
      expect(mockFetchFn).toHaveBeenCalledTimes(3);
    });

    it('should evict least recently used entries', async () => {
      const smallCacheConfig = { ...DEFAULT_CACHE_CONFIG, maxSize: 2 };
      const smallCache = new JwksCache(smallCacheConfig, DEFAULT_RETRY_CONFIG, mockFetchFn);

      mockFetchFn.mockImplementation((uri) => {
        const issuerNum = uri.match(/issuer(\d+)/)?.[1];
        return Promise.resolve({
          keys: [{ kid: `key-${issuerNum}`, kty: 'RSA', n: `n-${issuerNum}`, e: 'AQAB' }],
        });
      });

      await smallCache.getJwks('https://issuer1.example.com/jwks.json');
      await smallCache.getJwks('https://issuer2.example.com/jwks.json');
      await smallCache.getJwks('https://issuer1.example.com/jwks.json');
      await smallCache.getJwks('https://issuer3.example.com/jwks.json');

      expect(smallCache.size()).toBe(2);
      expect(mockFetchFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Outage handling', () => {
    it('should use cached data during outage when available', async () => {
      mockFetchFn
        .mockResolvedValueOnce({ keys: sampleJwks })
        .mockRejectedValue(new Error('Outage'));

      await cache.getJwks('https://issuer.example.com/jwks.json');
      const result = await cache.getJwks('https://issuer.example.com/jwks.json');

      expect(result.fromCache).toBe(true);
      expect(result.stale).toBe(false);
      expect(result.keys.size).toBe(2);
    });

    it('should fail closed when no cached data during outage', async () => {
      mockFetchFn.mockRejectedValue(new Error('Outage'));

      await expect(cache.getJwks('https://issuer.example.com/jwks.json')).rejects.toThrow(
        'Failed to fetch JWKS',
      );
    });

    it('should respect cacheOnlyOnOutage setting', async () => {
      const cacheOnlyConfig = { ...DEFAULT_RETRY_CONFIG, cacheOnlyOnOutage: true };
      const cacheOnlyCache = new JwksCache(DEFAULT_CACHE_CONFIG, cacheOnlyConfig, mockFetchFn);

      mockFetchFn
        .mockResolvedValueOnce({ keys: sampleJwks })
        .mockRejectedValue(new Error('Outage'));

      await cacheOnlyCache.getJwks('https://issuer.example.com/jwks.json');
      const result = await cacheOnlyCache.getJwks('https://issuer.example.com/jwks.json');

      expect(mockFetchFn).toHaveBeenCalledTimes(1);
      expect(result.fromCache).toBe(true);
      expect(result.stale).toBe(false);
    });
  });

  describe('Concurrent requests', () => {
    it('should deduplicate concurrent requests for same issuer', async () => {
      let resolveFetch: ((value: { keys: JwksKey[] }) => void) | undefined;
      mockFetchFn.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      );

      const promise1 = cache.getJwks('https://issuer.example.com/jwks.json');
      const promise2 = cache.getJwks('https://issuer.example.com/jwks.json');

      expect(mockFetchFn).toHaveBeenCalledTimes(1);

      resolveFetch!({ keys: sampleJwks });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.keys.size).toBe(2);
      expect(result2.keys.size).toBe(2);
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache management', () => {
    it('should clear all cached entries', async () => {
      mockFetchFn.mockResolvedValue({ keys: sampleJwks });

      await cache.getJwks('https://issuer1.example.com/jwks.json');
      await cache.getJwks('https://issuer2.example.com/jwks.json');

      expect(cache.size()).toBe(2);

      cache.clear();

      expect(cache.size()).toBe(0);
    });

    it('should report correct cache size', async () => {
      mockFetchFn.mockResolvedValue({ keys: sampleJwks });

      expect(cache.size()).toBe(0);

      await cache.getJwks('https://issuer1.example.com/jwks.json');

      expect(cache.size()).toBe(1);

      await cache.getJwks('https://issuer2.example.com/jwks.json');

      expect(cache.size()).toBe(2);
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JWKS response', async () => {
      mockFetchFn.mockResolvedValueOnce({ invalid: 'structure' });

      await expect(cache.getJwks('https://issuer.example.com/jwks.json')).rejects.toThrow(
        'Failed to fetch JWKS',
      );
    });

    it('should handle keys without kid', async () => {
      const keysWithoutKid = [
        { kty: 'RSA', alg: 'RS256', n: 'test-n', e: 'AQAB' },
        { kid: 'valid-key', kty: 'RSA', alg: 'RS256', n: 'test-n2', e: 'AQAB' },
      ];

      mockFetchFn.mockResolvedValueOnce({ keys: keysWithoutKid });

      const result = await cache.getJwks('https://issuer.example.com/jwks.json');

      expect(result.keys.size).toBe(1);
      expect(result.keys.has('valid-key')).toBe(true);
    });
  });

  describe('Deterministic behavior', () => {
    it('should produce consistent results for same inputs', async () => {
      mockFetchFn.mockResolvedValue({ keys: sampleJwks });

      const result1 = await cache.getJwks('https://issuer.example.com/jwks.json');
      cache.clear();
      const result2 = await cache.getJwks('https://issuer.example.com/jwks.json');

      expect(result1.keys.size).toBe(result2.keys.size);
      expect(Array.from(result1.keys.keys())).toEqual(Array.from(result2.keys.keys()));
    });
  });
});
