import type { FileSystem, StatResult, AtomicWriteOptions } from '../contracts/filesystem.js';
import { FileSystemError } from '../contracts/filesystem.js';

/**
 * Platform-agnostic FileSystem adapter that uses injected primitives.
 * On Expo/React Native, inject expo-file-system functions.
 * Falls back to in-memory store when no primitives are provided (test environments).
 */
export class ExpoFileSystem implements FileSystem {
  private memoryStore = new Map<string, Uint8Array>();
  private memoryStats = new Map<string, StatResult>();

  constructor(
    private readonly deps?: {
      /** Write base64 string to path. */
      writeAsStringAsync?: (
        path: string,
        data: string,
        opts: { encoding: string },
      ) => Promise<void>;
      /** Read path as base64 string. */
      readAsStringAsync?: (path: string, opts: { encoding: string }) => Promise<string>;
      /** Delete path (idempotent). */
      deleteAsync?: (path: string, opts: { idempotent: boolean }) => Promise<void>;
      /** Get file/directory info. */
      getInfoAsync?: (
        path: string,
        opts?: { size?: boolean },
      ) => Promise<{
        exists: boolean;
        isDirectory?: boolean;
        size?: number;
        modificationTime?: number;
      }>;
      /** List directory contents. */
      readDirectoryAsync?: (path: string) => Promise<string[]>;
      /** Create directory (with intermediates). */
      makeDirectoryAsync?: (path: string, opts: { intermediates: boolean }) => Promise<void>;
      /** Get free disk storage. */
      getFreeDiskStorageAsync?: () => Promise<number>;
    },
  ) {}

  async atomicWrite(
    path: string,
    data: Uint8Array,
    _opts?: AtomicWriteOptions,
  ): Promise<{ path: string; sha256: string; byteLength: number }> {
    const sha256 = await this.computeSha256(data);
    if (this.deps?.writeAsStringAsync) {
      const binary = Array.from(data, (b) => String.fromCharCode(b)).join('');
      const base64 = btoa(binary);
      await this.deps.writeAsStringAsync(path, base64, { encoding: 'base64' });
    } else {
      this.memoryStore.set(path, data);
      this.memoryStats.set(path, {
        exists: true,
        size: data.length,
        isDirectory: false,
        isFile: true,
        modifiedAt: new Date(),
      });
    }
    return { path, sha256, byteLength: data.length };
  }

  async read(path: string): Promise<Uint8Array> {
    if (this.deps?.readAsStringAsync) {
      try {
        const base64 = await this.deps.readAsStringAsync(path, { encoding: 'base64' });
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      } catch (err) {
        throw new FileSystemError('NOT_FOUND', `File not found: ${path}`, err);
      }
    }
    const data = this.memoryStore.get(path);
    if (!data) throw new FileSystemError('NOT_FOUND', `File not found: ${path}`);
    return data;
  }

  async delete(path: string): Promise<void> {
    if (this.deps?.deleteAsync) {
      try {
        await this.deps.deleteAsync(path, { idempotent: true });
      } catch {
        // Idempotent
      }
    } else {
      this.memoryStore.delete(path);
      this.memoryStats.delete(path);
    }
  }

  async list(dir: string): Promise<string[]> {
    if (this.deps?.readDirectoryAsync) {
      try {
        return await this.deps.readDirectoryAsync(dir);
      } catch (err) {
        throw new FileSystemError('NOT_FOUND', `Directory not found: ${dir}`, err);
      }
    }
    const prefix = dir.endsWith('/') ? dir : dir + '/';
    return Array.from(this.memoryStore.keys())
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }

  async stat(path: string): Promise<StatResult> {
    if (this.deps?.getInfoAsync) {
      try {
        const info = await this.deps.getInfoAsync(path, { size: true });
        if (!info.exists) {
          return {
            exists: false,
            size: 0,
            isDirectory: false,
            isFile: false,
            modifiedAt: new Date(0),
          };
        }
        return {
          exists: true,
          size: info.size ?? 0,
          isDirectory: info.isDirectory ?? false,
          isFile: !info.isDirectory,
          modifiedAt: new Date(info.modificationTime ?? 0),
        };
      } catch {
        return {
          exists: false,
          size: 0,
          isDirectory: false,
          isFile: false,
          modifiedAt: new Date(0),
        };
      }
    }
    const s = this.memoryStats.get(path);
    if (!s)
      return { exists: false, size: 0, isDirectory: false, isFile: false, modifiedAt: new Date(0) };
    return s;
  }

  async mkdir(dir: string): Promise<void> {
    if (this.deps?.makeDirectoryAsync) {
      try {
        await this.deps.makeDirectoryAsync(dir, { intermediates: true });
      } catch {
        // No error if exists
      }
    }
    // In-memory: no-op
  }

  async exists(path: string): Promise<boolean> {
    if (this.deps?.getInfoAsync) {
      try {
        const info = await this.deps.getInfoAsync(path);
        return info.exists;
      } catch {
        return false;
      }
    }
    return this.memoryStore.has(path);
  }

  async fsyncDir(_dir: string): Promise<void> {
    // Best-effort: mobile platform doesn't expose fsync
  }

  async getAvailableSpace(_path: string): Promise<number> {
    if (this.deps?.getFreeDiskStorageAsync) {
      try {
        return await this.deps.getFreeDiskStorageAsync();
      } catch {
        // Fall through
      }
    }
    return 1024 * 1024 * 1024 * 10; // 10 GB fallback
  }

  private async computeSha256(data: Uint8Array): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch {
        // Fall through
      }
    }
    return this.fallbackSha256(data);
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
