import { describe, it, expect } from 'vitest';
import { loadStorageConfig, toSafeLoggable, type StorageConfig } from './config.js';
import { StorageError } from './errors.js';

function captureError(fn: () => unknown): StorageError {
  try {
    fn();
  } catch (e) {
    return e as StorageError;
  }
  throw new Error('expected fn() to throw');
}

const VALID_ENV = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'my-bucket',
  S3_ACCESS_KEY: 'AKIA-very-secret-access-key',
  S3_SECRET_KEY: 'shh-very-secret-key-value',
  S3_FORCE_PATH_STYLE: 'true',
} as const;

describe('loadStorageConfig', () => {
  it('loads a valid config from env', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV });
    expect(cfg.endpoint).toBe('http://localhost:9000');
    expect(cfg.region).toBe('us-east-1');
    expect(cfg.bucket).toBe('my-bucket');
    expect(cfg.accessKey).toBe(VALID_ENV.S3_ACCESS_KEY);
    expect(cfg.secretKey).toBe(VALID_ENV.S3_SECRET_KEY);
    expect(cfg.forcePathStyle).toBe(true);
  });

  it('defaults region to us-east-1 when unset', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV, S3_REGION: undefined });
    expect(cfg.region).toBe('us-east-1');
  });

  it('defaults region to us-east-1 when empty', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV, S3_REGION: '' });
    expect(cfg.region).toBe('us-east-1');
  });

  it('defaults forcePathStyle to false when unset', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV, S3_FORCE_PATH_STYLE: undefined });
    expect(cfg.forcePathStyle).toBe(false);
  });

  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['yes', true],
    ['YES', true],
    ['false', false],
    ['0', false],
    ['no', false],
    ['', false],
    ['garbage', false],
  ])('parses S3_FORCE_PATH_STYLE=%s as %s', (raw, expected) => {
    const cfg = loadStorageConfig({ ...VALID_ENV, S3_FORCE_PATH_STYLE: raw });
    expect(cfg.forcePathStyle).toBe(expected);
  });

  it('accepts an https endpoint', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV, S3_ENDPOINT: 'https://s3.example.com' });
    expect(cfg.endpoint).toBe('https://s3.example.com');
  });

  it.each([
    ['missing endpoint', { ...VALID_ENV, S3_ENDPOINT: undefined }],
    ['empty endpoint', { ...VALID_ENV, S3_ENDPOINT: '' }],
    ['missing bucket', { ...VALID_ENV, S3_BUCKET: undefined }],
    ['empty bucket', { ...VALID_ENV, S3_BUCKET: '' }],
    ['missing accessKey', { ...VALID_ENV, S3_ACCESS_KEY: undefined }],
    ['empty accessKey', { ...VALID_ENV, S3_ACCESS_KEY: '' }],
    ['missing secretKey', { ...VALID_ENV, S3_SECRET_KEY: undefined }],
    ['empty secretKey', { ...VALID_ENV, S3_SECRET_KEY: '' }],
  ])('throws StorageError(config_error) for %s', (_label, env) => {
    try {
      loadStorageConfig(env);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(StorageError);
      expect((e as StorageError).category).toBe('config_error');
    }
  });

  it('throws config_error for a non-URL endpoint', () => {
    expect(() => loadStorageConfig({ ...VALID_ENV, S3_ENDPOINT: 'not a url' })).toThrow(
      StorageError,
    );
    expect(() => loadStorageConfig({ ...VALID_ENV, S3_ENDPOINT: 'not a url' })).toThrow();
    const err = captureError(() => loadStorageConfig({ ...VALID_ENV, S3_ENDPOINT: 'not a url' }));
    expect(err.category).toBe('config_error');
  });

  it('rejects an endpoint with a non-http(s) protocol', () => {
    const err = captureError(() =>
      loadStorageConfig({ ...VALID_ENV, S3_ENDPOINT: 'ftp://example.com' }),
    );
    expect(err.category).toBe('config_error');
  });

  it('uses a content-free message (no var name leaked) on config error', () => {
    const err = captureError(() => loadStorageConfig({ ...VALID_ENV, S3_SECRET_KEY: undefined }));
    expect(err.message).toBe('config_error');
    expect(err.message).not.toMatch(/SECRET_KEY|S3_SECRET/i);
  });
});

describe('StorageConfig secret safety', () => {
  it('JSON.stringify(config) does NOT contain the access key', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV });
    const serialized = JSON.stringify(cfg);
    expect(serialized).not.toContain(VALID_ENV.S3_ACCESS_KEY);
  });

  it('JSON.stringify(config) does NOT contain the secret key', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV });
    const serialized = JSON.stringify(cfg);
    expect(serialized).not.toContain(VALID_ENV.S3_SECRET_KEY);
  });

  it('still exposes secrets via direct property access for the SDK', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV });
    expect(cfg.accessKey).toBe(VALID_ENV.S3_ACCESS_KEY);
    expect(cfg.secretKey).toBe(VALID_ENV.S3_SECRET_KEY);
  });

  it('serializes the non-secret fields', () => {
    const cfg: StorageConfig = loadStorageConfig({ ...VALID_ENV });
    const serialized = JSON.stringify(cfg);
    expect(serialized).toContain('"endpoint":"http://localhost:9000"');
    expect(serialized).toContain('"region":"us-east-1"');
    expect(serialized).toContain('"bucket":"my-bucket"');
    expect(serialized).toContain('"forcePathStyle":true');
  });
});

describe('toSafeLoggable', () => {
  it('redacts accessKey and secretKey to ***', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV });
    const safe = toSafeLoggable(cfg);
    expect(safe.accessKey).toBe('***');
    expect(safe.secretKey).toBe('***');
  });

  it('redacts bucket and endpoint to ***', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV });
    const safe = toSafeLoggable(cfg);
    expect(safe.bucket).toBe('***');
    expect(safe.endpoint).toBe('***');
  });

  it('keeps region and stringifies forcePathStyle', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV });
    const safe = toSafeLoggable(cfg);
    expect(safe.region).toBe('us-east-1');
    expect(safe.forcePathStyle).toBe('true');
  });

  it('never contains any secret value', () => {
    const cfg = loadStorageConfig({ ...VALID_ENV });
    const serialized = JSON.stringify(toSafeLoggable(cfg));
    expect(serialized).not.toContain(VALID_ENV.S3_ACCESS_KEY);
    expect(serialized).not.toContain(VALID_ENV.S3_SECRET_KEY);
    expect(serialized).not.toContain('my-bucket');
    expect(serialized).not.toContain('localhost:9000');
  });
});
