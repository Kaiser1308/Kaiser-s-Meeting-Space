import { describe, it, expect } from 'vitest';
import { StorageError, toStorageError, type StorageErrorCategory } from './errors.js';

describe('StorageError', () => {
  it('constructs with a category and sets name', () => {
    const err = new StorageError('object_not_found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StorageError);
    expect(err.name).toBe('StorageError');
    expect(err.category).toBe('object_not_found');
    expect(err.message).toBe('object_not_found');
    expect(err.cause).toBeUndefined();
  });

  it('accepts an optional cause', () => {
    const inner = new Error('boom');
    const err = new StorageError('upload_failed', inner);
    expect(err.cause).toBe(inner);
  });

  it('supports every documented category', () => {
    const categories: StorageErrorCategory[] = [
      'object_not_found',
      'upload_failed',
      'checksum_mismatch',
      'access_denied',
      'invalid_key',
      'provider_error',
      'config_error',
    ];
    for (const category of categories) {
      expect(new StorageError(category).category).toBe(category);
    }
  });
});

describe('toStorageError', () => {
  it('passes through an existing StorageError unchanged (same instance)', () => {
    const original = new StorageError('checksum_mismatch');
    expect(toStorageError(original)).toBe(original);
  });

  it('maps NoSuchKey name to object_not_found', () => {
    const e = Object.assign(new Error('The specified key does not exist.'), {
      name: 'NoSuchKey',
    });
    const mapped = toStorageError(e);
    expect(mapped.category).toBe('object_not_found');
  });

  it('maps NotFound name to object_not_found', () => {
    const e = Object.assign(new Error('not here'), { name: 'NotFound' });
    expect(toStorageError(e).category).toBe('object_not_found');
  });

  it('maps a 404 $metadata.httpStatusCode to object_not_found', () => {
    const e = { name: 'SomethingElse', $metadata: { httpStatusCode: 404 } };
    expect(toStorageError(e).category).toBe('object_not_found');
  });

  it('maps AccessDenied name to access_denied', () => {
    const e = Object.assign(new Error('Forbidden'), { name: 'AccessDenied' });
    expect(toStorageError(e).category).toBe('access_denied');
  });

  it('maps a 403 $metadata.httpStatusCode to access_denied', () => {
    const e = { name: 'Foo', $metadata: { httpStatusCode: 403 } };
    expect(toStorageError(e).category).toBe('access_denied');
  });

  it('maps a name containing "Timeout" to provider_error', () => {
    const e = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    expect(toStorageError(e).category).toBe('provider_error');
  });

  it('maps a name containing "Network" to provider_error', () => {
    const e = Object.assign(new Error('down'), { name: 'NetworkingError' });
    expect(toStorageError(e).category).toBe('provider_error');
  });

  it('maps an unknown SDK-shaped error to provider_error', () => {
    const e = { name: 'ServiceUnavailable', $metadata: { httpStatusCode: 503 } };
    expect(toStorageError(e).category).toBe('provider_error');
  });

  it('maps a plain Error to provider_error', () => {
    expect(toStorageError(new Error('whatever')).category).toBe('provider_error');
  });

  it('maps non-Error throwables to provider_error', () => {
    expect(toStorageError('a string').category).toBe('provider_error');
    expect(toStorageError(null).category).toBe('provider_error');
    expect(toStorageError(undefined).category).toBe('provider_error');
    expect(toStorageError(42).category).toBe('provider_error');
  });

  it('uses the category string as the message — never the original message', () => {
    const e = Object.assign(new Error('SECRET-credential-leak bucket=mybucket'), {
      name: 'AccessDenied',
    });
    const mapped = toStorageError(e);
    expect(mapped.message).toBe('access_denied');
    expect(mapped.message).not.toContain('SECRET');
    expect(mapped.message).not.toContain('mybucket');
  });

  it('does not leak the original message or credentials via message field', () => {
    const e = {
      name: 'NoSuchKey',
      message: 'leaked-access-key AKIAxxxx endpoint=http://minio:9000',
    };
    const mapped = toStorageError(e);
    expect(mapped.message).toBe('object_not_found');
    expect(mapped.message).not.toMatch(/AKIA/);
    expect(mapped.message).not.toMatch(/minio/);
  });
});
