import type { FileSystem, StatResult, AtomicWriteOptions } from '../contracts/filesystem.js';
import { FileSystemError } from '../contracts/filesystem.js';
import { createHash } from 'node:crypto';

interface StoredFile {
  data: Buffer;
  modifiedAt: Date;
}

type FaultType =
  | 'write'
  | 'read'
  | 'delete'
  | 'list'
  | 'stat'
  | 'mkdir'
  | 'exists'
  | 'fsyncDir'
  | 'getAvailableSpace';

export class FakeFileSystem implements FileSystem {
  private files = new Map<string, StoredFile>();
  private dirs = new Set<string>();
  private faults = new Map<FaultType, { error: FileSystemError; count: number }>();
  private fsyncFailure = false;
  private diskFullLimit: number | null = null;
  private corruptedPaths = new Set<string>();
  private shaCounter = 0;

  // ── Fault injection ──

  injectFault(method: FaultType, error: FileSystemError): void {
    this.faults.set(method, { error, count: 1 });
  }

  injectFsyncFailure(): void {
    this.fsyncFailure = true;
  }

  injectDiskFull(remainingBytes: number): void {
    this.diskFullLimit = remainingBytes;
  }

  injectCorruption(path: string): void {
    this.corruptedPaths.add(path);
  }

  clearFaults(): void {
    this.faults.clear();
    this.fsyncFailure = false;
    this.diskFullLimit = null;
    this.corruptedPaths.clear();
  }

  // ── Helpers ──

  private checkFault(method: FaultType): void {
    const fault = this.faults.get(method);
    if (fault && fault.count > 0) {
      fault.count--;
      throw fault.error;
    }
  }

  private genSha256(data: Buffer): string {
    this.shaCounter++;
    // Use real SHA-256 for integrity testing
    return createHash('sha256').update(data).digest('hex');
  }

  private normPath(path: string): string {
    return path.replace(/\\/g, '/');
  }

  // ── FileSystem implementation ──

  async atomicWrite(
    path: string,
    data: Uint8Array,
    _opts?: AtomicWriteOptions,
  ): Promise<{ path: string; sha256: string; byteLength: number }> {
    this.checkFault('write');

    const p = this.normPath(path);
    const buf = Buffer.from(data);

    // Check disk full
    if (this.diskFullLimit !== null) {
      let totalSize = 0;
      for (const f of this.files.values()) {
        totalSize += f.data.length;
      }
      if (totalSize + buf.length > this.diskFullLimit) {
        throw new FileSystemError('DISK_FULL', `Disk full: limit ${this.diskFullLimit} bytes`);
      }
    }

    if (!this.fsyncFailure) {
      this.files.set(p, { data: buf, modifiedAt: new Date() });
    }
    // When fsyncFailure is true, we simulate: file write happened but fsync failed
    // In the fake, we still store it but the caller would treat it as unacknowledged

    const sha256 = this.genSha256(buf);
    return { path: p, sha256, byteLength: buf.length };
  }

  async read(path: string): Promise<Uint8Array> {
    this.checkFault('read');
    const p = this.normPath(path);
    const file = this.files.get(p);
    if (!file) {
      throw new FileSystemError('NOT_FOUND', `File not found: ${p}`);
    }
    let data = file.data;
    if (this.corruptedPaths.has(p)) {
      // Flip a byte to simulate corruption
      const corrupted = Buffer.from(data);
      if (corrupted.length > 0) {
        corrupted[0] = corrupted[0]! ^ 0xff;
      }
      data = corrupted;
    }
    return new Uint8Array(data);
  }

  async delete(path: string): Promise<void> {
    this.checkFault('delete');
    const p = this.normPath(path);
    this.files.delete(p);
  }

  async list(dir: string): Promise<string[]> {
    this.checkFault('list');
    const d = this.normPath(dir);
    const prefix = d.endsWith('/') ? d : d + '/';
    const names: string[] = [];
    for (const [filePath] of this.files) {
      if (filePath.startsWith(prefix)) {
        const relative = filePath.slice(prefix.length);
        if (!relative.includes('/')) {
          names.push(relative);
        }
      }
    }
    return names;
  }

  async stat(path: string): Promise<StatResult> {
    this.checkFault('stat');
    const p = this.normPath(path);

    if (this.dirs.has(p)) {
      return { exists: true, size: 0, isDirectory: true, isFile: false, modifiedAt: new Date() };
    }

    const file = this.files.get(p);
    if (file) {
      return {
        exists: true,
        size: file.data.length,
        isDirectory: false,
        isFile: true,
        modifiedAt: file.modifiedAt,
      };
    }

    return { exists: false, size: 0, isDirectory: false, isFile: false, modifiedAt: new Date(0) };
  }

  async mkdir(dir: string): Promise<void> {
    this.checkFault('mkdir');
    this.dirs.add(this.normPath(dir));
  }

  async exists(path: string): Promise<boolean> {
    this.checkFault('exists');
    const p = this.normPath(path);
    return this.dirs.has(p) || this.files.has(p);
  }

  async fsyncDir(_dir: string): Promise<void> {
    this.checkFault('fsyncDir');
    if (this.fsyncFailure) {
      return; // silently does not persist
    }
    // No-op in fake: data is already "persisted"
  }

  async getAvailableSpace(_path: string): Promise<number> {
    this.checkFault('getAvailableSpace');
    if (this.diskFullLimit !== null) {
      let totalSize = 0;
      for (const f of this.files.values()) {
        totalSize += f.data.length;
      }
      return Math.max(0, this.diskFullLimit - totalSize);
    }
    return 1024 * 1024 * 1024; // 1 GB fake
  }

  // ── Inspection helpers ──

  getFileCount(): number {
    return this.files.size;
  }

  getDirCount(): number {
    return this.dirs.size;
  }

  dumpFiles(): Map<string, { size: number; modifiedAt: Date }> {
    const result = new Map<string, { size: number; modifiedAt: Date }>();
    for (const [path, file] of this.files) {
      result.set(path, { size: file.data.length, modifiedAt: file.modifiedAt });
    }
    return result;
  }
}
