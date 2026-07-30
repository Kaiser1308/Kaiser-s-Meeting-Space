import { describe, expect, it } from 'vitest';
import { createPlatformSecureStorage } from './secure-storage.adapter';

describe('platform secure storage adapter', () => {
  it('returns a SecureStorage implementation', () => {
    const storage = createPlatformSecureStorage();

    expect(typeof storage.get).toBe('function');
    expect(typeof storage.set).toBe('function');
    expect(typeof storage.remove).toBe('function');
  });

  it('persists and retrieves values', async () => {
    const storage = createPlatformSecureStorage();

    await storage.set('test-key', 'test-value');
    const value = await storage.get('test-key');

    expect(value).toBe('test-value');
  });

  it('returns null for non-existent keys', async () => {
    const storage = createPlatformSecureStorage();

    const value = await storage.get('non-existent');

    expect(value).toBeNull();
  });

  it('removes values', async () => {
    const storage = createPlatformSecureStorage();

    await storage.set('test-key', 'test-value');
    await storage.remove('test-key');
    const value = await storage.get('test-key');

    expect(value).toBeNull();
  });

  it('matches P04 fake storage behavior', async () => {
    const storage = createPlatformSecureStorage();

    await storage.set('key1', 'value1');
    await storage.set('key2', 'value2');

    expect(await storage.get('key1')).toBe('value1');
    expect(await storage.get('key2')).toBe('value2');

    await storage.remove('key1');

    expect(await storage.get('key1')).toBeNull();
    expect(await storage.get('key2')).toBe('value2');
  });
});
