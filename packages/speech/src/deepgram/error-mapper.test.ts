import { describe, it, expect } from 'vitest';
import { toSafeError } from './error-mapper.js';

describe('toSafeError', () => {
  it('maps Error objects to safe errors', () => {
    const result = toSafeError(new Error('test error'), false);
    expect(result.code).toBe('PROVIDER_ERROR');
    expect(result.message).toBe('test error');
    expect(result.category).toBe('provider');
    expect(result.retryable).toBe(false);
  });

  it('truncates message at 512 characters', () => {
    const longMsg = 'x'.repeat(600);
    const result = toSafeError(new Error(longMsg), true);
    expect(result.message.length).toBe(512);
    expect(result.message).toBe(longMsg.slice(0, 512));
  });

  it('message exactly 512 characters is not truncated further', () => {
    const exact = 'x'.repeat(512);
    const result = toSafeError(new Error(exact), false);
    expect(result.message.length).toBe(512);
    expect(result.message).toBe(exact);
  });

  it('passes through the retryable flag', () => {
    const r1 = toSafeError(new Error('err'), true);
    expect(r1.retryable).toBe(true);
    const r2 = toSafeError(new Error('err'), false);
    expect(r2.retryable).toBe(false);
  });

  it('handles non-Error values', () => {
    const result = toSafeError('plain string error', false);
    expect(result.message).toBe('plain string error');
    expect(result.code).toBe('PROVIDER_ERROR');
    expect(result.category).toBe('provider');
  });

  it('handles Error subclasses', () => {
    const result = toSafeError(new TypeError('type error'), true);
    expect(result.code).toBe('PROVIDER_ERROR');
    expect(result.message).toBe('type error');
  });

  it('does not leak extra keys from error objects', () => {
    const err = new Error('msg') as Error & { secretKey: string; body: unknown };
    (err as unknown as Record<string, unknown>).secretKey = 'secret123';
    (err as unknown as Record<string, unknown>).body = { sensitive: true };
    const result = toSafeError(err, false);
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(['category', 'code', 'message', 'retryable']);
    expect((result as unknown as Record<string, unknown>).secretKey).toBeUndefined();
  });

  it('handles null and undefined gracefully', () => {
    const r1 = toSafeError(null, false);
    expect(r1.message).toBe('null');
    expect(r1.code).toBe('PROVIDER_ERROR');

    const r2 = toSafeError(undefined, false);
    expect(r2.message).toBe('undefined');
    expect(r2.code).toBe('PROVIDER_ERROR');
  });

  it('handles number errors', () => {
    const result = toSafeError(42, false);
    expect(result.message).toBe('42');
    expect(result.code).toBe('PROVIDER_ERROR');
  });
});
