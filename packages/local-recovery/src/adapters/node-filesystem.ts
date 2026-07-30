import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import {
  FileSystemError,
  type FileSystem,
  type StatResult,
  type AtomicWriteOptions,
} from '../contracts/filesystem.js';

function normPath(path: string): string {
  return path.replace(/\\/g, '/');
}

export class NodeFileSystem implements FileSystem {
  async atomicWrite(
    path: string,
    data: Uint8Array,
    opts?: AtomicWriteOptions,
  ): Promise<{ path: string; sha256: string; byteLength: number }> {
    const finalPath = path;
    const dir = dirname(finalPath);
    const tmpDir = opts?.tmpDir ?? dir;
    const tmpPath = `${tmpDir}/.tmp-${randomUUID()}`;
    const shouldFsyncFile = opts?.fsyncFile !== false;
    const shouldFsyncDir = opts?.fsyncDir !== false;

    try {
      // Write to temp path
      const fd = await fs.open(tmpPath, 'w');
      try {
        await fd.write(data);
        if (shouldFsyncFile) {
          await fd.sync();
        }
      } finally {
        await fd.close();
      }

      // Compute SHA-256
      const hash = createHash('sha256');
      hash.update(data);
      const sha256 = hash.digest('hex');

      // Rename temp to final
      await fs.rename(tmpPath, finalPath);

      // fsync parent directory
      if (shouldFsyncDir) {
        try {
          const dirFd = await fs.open(dir, 'r');
          await dirFd.sync();
          await dirFd.close();
        } catch {
          // Best effort
        }
      }

      return { path: normPath(finalPath), sha256, byteLength: data.length };
    } catch (err) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  async read(path: string): Promise<Uint8Array> {
    try {
      const data = await fs.readFile(path);
      return new Uint8Array(data);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new FileSystemError('NOT_FOUND', `File not found: ${path}`, err);
      }
      throw new FileSystemError('IO_ERROR', `Failed to read: ${path}`, err);
    }
  }

  async delete(path: string): Promise<void> {
    try {
      await fs.unlink(path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return; // Idempotent
      }
      throw new FileSystemError('IO_ERROR', `Failed to delete: ${path}`, err);
    }
  }

  async list(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new FileSystemError('NOT_FOUND', `Directory not found: ${dir}`, err);
      }
      throw new FileSystemError('IO_ERROR', `Failed to list: ${dir}`, err);
    }
  }

  async stat(path: string): Promise<StatResult> {
    try {
      const s = await fs.stat(path);
      return {
        exists: true,
        size: s.size,
        isDirectory: s.isDirectory(),
        isFile: s.isFile(),
        modifiedAt: s.mtime,
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return {
          exists: false,
          size: 0,
          isDirectory: false,
          isFile: false,
          modifiedAt: new Date(0),
        };
      }
      throw new FileSystemError('IO_ERROR', `Failed to stat: ${path}`, err);
    }
  }

  async mkdir(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        return;
      }
      throw new FileSystemError('IO_ERROR', `Failed to create directory: ${dir}`, err);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async fsyncDir(dir: string): Promise<void> {
    try {
      const fd = await fs.open(dir, 'r');
      await fd.sync();
      await fd.close();
    } catch (err) {
      // Best effort for directory fsync on platforms that don't support it
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new FileSystemError('NOT_FOUND', `Directory not found: ${dir}`, err);
      }
      // EISDIR on POSIX, EBADF on Windows — both are OK
    }
  }

  async getAvailableSpace(_path: string): Promise<number> {
    // Fallback: not all platforms support statfs easily in Node
    // Returns a generous estimate
    return 1024 * 1024 * 1024 * 10; // 10 GB
  }
}
