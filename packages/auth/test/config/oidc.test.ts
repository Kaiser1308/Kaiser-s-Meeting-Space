import { describe, it, expect } from 'vitest';
import {
  OidcConfigSchema,
  createOidcConfig,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_TIME_VALIDATION_CONFIG,
} from '../../src/config/oidc';

describe('OidcConfig', () => {
  describe('OidcConfigSchema', () => {
    it('should validate complete OIDC config', () => {
      const config = {
        issuers: [
          {
            issuer: 'https://test-issuer.example.com',
            jwksUri: 'https://test-issuer.example.com/.well-known/jwks.json',
            audience: ['test-audience'],
            algorithms: ['RS256'],
          },
        ],
        cache: {
          maxSize: 100,
          ttlSeconds: 300,
          staleWhileRevalidateSeconds: 60,
        },
        retry: {
          maxRetries: 3,
          initialBackoffMs: 100,
          maxBackoffMs: 6400,
          cacheOnlyOnOutage: false,
        },
        timeValidation: {
          clockSkewSeconds: 30,
        },
      };

      const result = OidcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject config without issuers', () => {
      const config = {
        issuers: [],
        cache: DEFAULT_CACHE_CONFIG,
        retry: DEFAULT_RETRY_CONFIG,
        timeValidation: DEFAULT_TIME_VALIDATION_CONFIG,
      };

      const result = OidcConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid issuer URL', () => {
      const config = {
        issuers: [
          {
            issuer: 'not-a-url',
            jwksUri: 'https://test-issuer.example.com/.well-known/jwks.json',
            audience: ['test-audience'],
            algorithms: ['RS256'],
          },
        ],
        cache: DEFAULT_CACHE_CONFIG,
        retry: DEFAULT_RETRY_CONFIG,
        timeValidation: DEFAULT_TIME_VALIDATION_CONFIG,
      };

      const result = OidcConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid algorithm', () => {
      const config = {
        issuers: [
          {
            issuer: 'https://test-issuer.example.com',
            jwksUri: 'https://test-issuer.example.com/.well-known/jwks.json',
            audience: ['test-audience'],
            algorithms: ['HS256'],
          },
        ],
        cache: DEFAULT_CACHE_CONFIG,
        retry: DEFAULT_RETRY_CONFIG,
        timeValidation: DEFAULT_TIME_VALIDATION_CONFIG,
      };

      const result = OidcConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject empty audience', () => {
      const config = {
        issuers: [
          {
            issuer: 'https://test-issuer.example.com',
            jwksUri: 'https://test-issuer.example.com/.well-known/jwks.json',
            audience: [],
            algorithms: ['RS256'],
          },
        ],
        cache: DEFAULT_CACHE_CONFIG,
        retry: DEFAULT_RETRY_CONFIG,
        timeValidation: DEFAULT_TIME_VALIDATION_CONFIG,
      };

      const result = OidcConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject negative cache size', () => {
      const config = {
        issuers: [
          {
            issuer: 'https://test-issuer.example.com',
            jwksUri: 'https://test-issuer.example.com/.well-known/jwks.json',
            audience: ['test-audience'],
            algorithms: ['RS256'],
          },
        ],
        cache: {
          maxSize: -1,
          ttlSeconds: 300,
          staleWhileRevalidateSeconds: 60,
        },
        retry: DEFAULT_RETRY_CONFIG,
        timeValidation: DEFAULT_TIME_VALIDATION_CONFIG,
      };

      const result = OidcConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject excessive retry count', () => {
      const config = {
        issuers: [
          {
            issuer: 'https://test-issuer.example.com',
            jwksUri: 'https://test-issuer.example.com/.well-known/jwks.json',
            audience: ['test-audience'],
            algorithms: ['RS256'],
          },
        ],
        cache: DEFAULT_CACHE_CONFIG,
        retry: {
          maxRetries: 11,
          initialBackoffMs: 100,
          maxBackoffMs: 6400,
          cacheOnlyOnOutage: false,
        },
        timeValidation: DEFAULT_TIME_VALIDATION_CONFIG,
      };

      const result = OidcConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('createOidcConfig', () => {
    it('should create config with defaults', () => {
      const baseConfig = {
        issuers: [
          {
            issuer: 'https://test-issuer.example.com',
            jwksUri: 'https://test-issuer.example.com/.well-known/jwks.json',
            audience: ['test-audience'],
            algorithms: ['RS256'],
          },
        ],
      };

      const config = createOidcConfig(baseConfig);

      expect(config.cache).toEqual(DEFAULT_CACHE_CONFIG);
      expect(config.retry).toEqual(DEFAULT_RETRY_CONFIG);
      expect(config.timeValidation).toEqual(DEFAULT_TIME_VALIDATION_CONFIG);
    });

    it('should merge partial config with defaults', () => {
      const partialConfig = {
        issuers: [
          {
            issuer: 'https://test-issuer.example.com',
            jwksUri: 'https://test-issuer.example.com/.well-known/jwks.json',
            audience: ['test-audience'],
            algorithms: ['RS256'],
          },
        ],
        cache: {
          maxSize: 50,
          ttlSeconds: 600,
          staleWhileRevalidateSeconds: 120,
        },
      };

      const config = createOidcConfig(partialConfig);

      expect(config.cache.maxSize).toBe(50);
      expect(config.cache.ttlSeconds).toBe(600);
      expect(config.cache.staleWhileRevalidateSeconds).toBe(120);
      expect(config.retry).toEqual(DEFAULT_RETRY_CONFIG);
      expect(config.timeValidation).toEqual(DEFAULT_TIME_VALIDATION_CONFIG);
    });

    it('should use complete config when provided', () => {
      const completeConfig = {
        issuers: [
          {
            issuer: 'https://test-issuer.example.com',
            jwksUri: 'https://test-issuer.example.com/.well-known/jwks.json',
            audience: ['test-audience'],
            algorithms: ['RS256'],
          },
        ],
        cache: {
          maxSize: 200,
          ttlSeconds: 900,
          staleWhileRevalidateSeconds: 180,
        },
        retry: {
          maxRetries: 5,
          initialBackoffMs: 200,
          maxBackoffMs: 10000,
          cacheOnlyOnOutage: true,
        },
        timeValidation: {
          clockSkewSeconds: 60,
        },
      };

      const config = createOidcConfig(completeConfig);

      expect(config.cache.maxSize).toBe(200);
      expect(config.retry.maxRetries).toBe(5);
      expect(config.timeValidation.clockSkewSeconds).toBe(60);
    });
  });

  describe('Default configurations', () => {
    it('should have safe default cache config', () => {
      expect(DEFAULT_CACHE_CONFIG.maxSize).toBe(100);
      expect(DEFAULT_CACHE_CONFIG.ttlSeconds).toBe(300);
      expect(DEFAULT_CACHE_CONFIG.staleWhileRevalidateSeconds).toBe(60);
    });

    it('should have safe default retry config', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.initialBackoffMs).toBe(100);
      expect(DEFAULT_RETRY_CONFIG.maxBackoffMs).toBe(6400);
      expect(DEFAULT_RETRY_CONFIG.cacheOnlyOnOutage).toBe(false);
    });

    it('should have safe default time validation config', () => {
      expect(DEFAULT_TIME_VALIDATION_CONFIG.clockSkewSeconds).toBe(30);
    });
  });
});
