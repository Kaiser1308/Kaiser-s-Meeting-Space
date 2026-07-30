export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ExpoSecureStoreBackend {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export function createExpoSecureStorage(backend: ExpoSecureStoreBackend): SecureStorage {
  return {
    get: (key) => backend.getItemAsync(key),
    set: (key, value) => backend.setItemAsync(key, value),
    remove: (key) => backend.deleteItemAsync(key),
  };
}

export async function createNativeSecureStorage(): Promise<SecureStorage> {
  const backend = await import('expo-secure-store');
  return createExpoSecureStorage(backend);
}

export function createFakeSecureStorage(options: { failWrites?: boolean } = {}): SecureStorage {
  const values = new Map<string, string>();
  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      if (options.failWrites) throw new Error('secure storage unavailable');
      values.set(key, value);
    },
    async remove(key) {
      values.delete(key);
    },
  };
}
