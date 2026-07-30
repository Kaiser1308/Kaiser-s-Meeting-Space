import { describe, expect, it } from 'vitest';
import { createFakeSecureStorage, createExpoSecureStorage } from './secure-storage';

describe('mobile secure storage adapter', () => {
  it('persists values through the Expo SecureStore backend', async () => {
    const values = new Map<string, string>();
    const storage = createExpoSecureStorage({
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => void values.set(key, value),
      deleteItemAsync: async (key) => void values.delete(key),
    });

    await storage.set('refresh', 'secret');
    expect(await storage.get('refresh')).toBe('secret');
    await storage.remove('refresh');
    expect(await storage.get('refresh')).toBeNull();
  });

  it('stores values only through the secure adapter', async () => {
    const storage = createFakeSecureStorage();
    await storage.set('secret', 'synthetic-refresh-token');
    expect(await storage.get('secret')).toBe('synthetic-refresh-token');
    await storage.remove('secret');
    expect(await storage.get('secret')).toBeNull();
  });
});
