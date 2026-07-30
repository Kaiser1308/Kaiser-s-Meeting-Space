export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface KeytarBackend {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

const DEFAULT_SERVICE = 'kaisers-meeting-space';

export function createKeytarSecureStorage(
  backend: KeytarBackend,
  service = DEFAULT_SERVICE,
): SecureStorage {
  return {
    get: (key) => backend.getPassword(service, key),
    set: (key, value) => backend.setPassword(service, key, value),
    remove: async (key) => {
      await backend.deletePassword(service, key);
    },
  };
}

export async function createNativeSecureStorage(service = DEFAULT_SERVICE): Promise<SecureStorage> {
  const module = await import('keytar');
  return createKeytarSecureStorage(module.default ?? module, service);
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
