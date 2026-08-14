import { describe, it, expect } from 'vitest';
import { withTimeout } from './with-timeout.js';

describe('withTimeout', () => {
  it('resolves before the timeout', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });
  it('rejects on timeout', async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow(/timed out/);
  });
  it('propagates the underlying rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow(/boom/);
  });
});
