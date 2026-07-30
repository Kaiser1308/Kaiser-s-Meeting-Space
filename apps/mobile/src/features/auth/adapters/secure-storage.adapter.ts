import { createFakeSecureStorage, type SecureStorage } from '../../../auth/secure-storage';

export function createPlatformSecureStorage(): SecureStorage {
  return createFakeSecureStorage();
}
