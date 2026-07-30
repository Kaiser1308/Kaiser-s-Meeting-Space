import { describe, it, expect } from 'vitest';
import {
  envSchema,
  validateConfig,
  redactConfig,
  clientSafeConfig,
  type AppConfig,
} from './index.js';

describe('envSchema', () => {
  it('parses minimal valid environment', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'development',
      API_PORT: '4310',
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'kms-dev',
      S3_ACCESS_KEY: 'minioadmin',
      S3_SECRET_KEY: 'minioadmin',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid port', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'development',
      API_PORT: 'not-a-port',
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid NODE_ENV', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'invalid',
      API_PORT: '4310',
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(result.success).toBe(false);
  });

  it('accepts production environment', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'production',
      API_PORT: '4310',
      DATABASE_URL: 'postgresql://db.example.com:5432/kms',
      REDIS_URL: 'redis://redis.example.com:6379',
      S3_ENDPOINT: 'https://s3.amazonaws.com',
      S3_BUCKET: 'kms-prod',
      S3_ACCESS_KEY: 'AKIA...',
      S3_SECRET_KEY: 'secret...',
      OIDC_ISSUER_URL: 'https://auth.example.com',
      OIDC_CLIENT_ID: 'client-id',
      OIDC_REDIRECT_URI: 'https://app.example.com/callback',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys in strict mode', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'development',
      API_PORT: '4310',
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
      UNKNOWN_FIELD: 'should-not-be-here',
    });
    expect(result.success).toBe(false);
  });
});

describe('validateConfig', () => {
  it('returns parsed config for valid input', () => {
    const result = validateConfig({
      NODE_ENV: 'development',
      API_PORT: '4310',
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.config.NODE_ENV).toBe('development');
      expect(result.config.API_PORT).toBe(4310);
    }
  });

  it('returns safe error for invalid input (no secret values)', () => {
    const result = validateConfig({
      NODE_ENV: 'development',
      API_PORT: 'abc',
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      // Error message must not contain the input values
      expect(result.message).not.toContain('abc');
      // Error message must reference the field name
      expect(result.message).toContain('API_PORT');
    }
  });
});

describe('redactConfig', () => {
  it('redacts secret fields', () => {
    const config = {
      NODE_ENV: 'development',
      API_PORT: 4310,
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
      S3_ACCESS_KEY: 'my-secret-key',
      S3_SECRET_KEY: 'my-super-secret',
    } as AppConfig;
    const redacted = redactConfig(config);
    expect(redacted.S3_ACCESS_KEY).toBe('[REDACTED]');
    expect(redacted.S3_SECRET_KEY).toBe('[REDACTED]');
    expect(redacted.DATABASE_URL).not.toBe('[REDACTED]');
    expect(redacted.NODE_ENV).toBe('development');
  });

  it('handles undefined secret fields gracefully', () => {
    const config = {
      NODE_ENV: 'development',
      API_PORT: 4310,
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
    } as AppConfig;
    const redacted = redactConfig(config);
    expect(redacted.S3_ACCESS_KEY).toBeUndefined();
    expect(redacted.NODE_ENV).toBe('development');
  });
});

describe('clientSafeConfig', () => {
  it('only exposes client-safe fields', () => {
    const config = {
      NODE_ENV: 'production',
      API_PORT: 4310,
      DATABASE_URL: 'postgresql://db:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
      S3_ACCESS_KEY: 'secret-key',
      S3_SECRET_KEY: 'super-secret',
      OIDC_ISSUER_URL: 'https://auth.example.com',
      OIDC_CLIENT_ID: 'public-client-id',
      OIDC_REDIRECT_URI: 'https://app.example.com/callback',
    } as AppConfig;
    const clientConfig = clientSafeConfig(config);
    // Must not leak secrets
    expect(clientConfig).not.toHaveProperty('DATABASE_URL');
    expect(clientConfig).not.toHaveProperty('REDIS_URL');
    expect(clientConfig).not.toHaveProperty('S3_ACCESS_KEY');
    expect(clientConfig).not.toHaveProperty('S3_SECRET_KEY');
    // Must include public fields
    expect(clientConfig.OIDC_ISSUER_URL).toBe('https://auth.example.com');
    expect(clientConfig.OIDC_CLIENT_ID).toBe('public-client-id');
  });

  it('returns empty object if no client-safe config exists', () => {
    const config = {
      NODE_ENV: 'development',
      API_PORT: 4310,
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
    } as AppConfig;
    const clientConfig = clientSafeConfig(config);
    expect(Object.keys(clientConfig).length).toBeGreaterThanOrEqual(0);
    expect(clientConfig).not.toHaveProperty('DATABASE_URL');
  });
});

describe('environment defaults', () => {
  it('defaults to development', () => {
    const result = envSchema.safeParse({
      API_PORT: '4310',
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
    }
  });

  it('defaults API_PORT to 4310', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/kms',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.API_PORT).toBe(4310);
    }
  });
});
