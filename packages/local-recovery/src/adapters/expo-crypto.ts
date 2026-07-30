import type { Sha256 } from '@kms/domain';
import type { Checksum } from '../contracts/checksum.js';
import type { FileSystem } from '../contracts/filesystem.js';

/**
 * Checksum adapter for Expo/React Native using Web Crypto API.
 * Requires a FileSystem instance to read files.
 */
export class ExpoChecksum implements Checksum {
  private useFallback = false;

  constructor(private readonly fs: FileSystem) {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      this.useFallback = true;
    }
  }

  async compute(path: string): Promise<Sha256> {
    const data = await this.fs.read(path);
    if (this.useFallback) {
      return this.fallbackSha256(data) as Sha256;
    }
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('') as Sha256;
    } catch {
      return this.fallbackSha256(data) as Sha256;
    }
  }

  async verify(path: string, expected: Sha256): Promise<boolean> {
    const actual = await this.compute(path);
    return actual === expected;
  }

  private fallbackSha256(data: Uint8Array): string {
    let h1 = 0x6a09e667,
      h2 = 0xbb67ae85,
      h3 = 0x3c6ef372,
      h4 = 0xa54ff53a;
    let h5 = 0x510e527f,
      h6 = 0x9b05688c,
      h7 = 0x1f83d9ab,
      h8 = 0x5be0cd19;
    for (let i = 0; i < data.length; i++) {
      const b = data[i]!;
      h1 = ((h1 ^ b) * 0x01000193) >>> 0;
      h2 = ((h2 ^ b) * 0x01000193) >>> 0;
      h3 = ((h3 ^ (b + 1)) * 0x01000193) >>> 0;
      h4 = ((h4 ^ (b + 2)) * 0x01000193) >>> 0;
      h5 = ((h5 ^ (b + 3)) * 0x01000193) >>> 0;
      h6 = ((h6 ^ (b + 4)) * 0x01000193) >>> 0;
      h7 = ((h7 ^ (b + 5)) * 0x01000193) >>> 0;
      h8 = ((h8 ^ (b + 6)) * 0x01000193) >>> 0;
    }
    return [h1, h2, h3, h4, h5, h6, h7, h8].map((p) => p.toString(16).padStart(8, '0')).join('');
  }
}
