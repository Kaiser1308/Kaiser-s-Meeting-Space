export type FileSystemErrorCategory =
  'NOT_FOUND' | 'ALREADY_EXISTS' | 'DISK_FULL' | 'PERMISSION_DENIED' | 'IO_ERROR';

export class FileSystemError extends Error {
  constructor(
    public readonly category: FileSystemErrorCategory,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FileSystemError';
  }
}

export interface StatResult {
  readonly exists: boolean;
  readonly size: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly modifiedAt: Date;
}

export interface AtomicWriteOptions {
  readonly tmpDir?: string;
  readonly fsyncFile?: boolean;
  readonly fsyncDir?: boolean;
}

export interface FileSystem {
  /** Write data atomically: temp → fsync → checksum → rename → dir-fsync.
   *  Returns the final file path and SHA-256 checksum. */
  atomicWrite(
    path: string,
    data: Uint8Array,
    opts?: AtomicWriteOptions,
  ): Promise<{ path: string; sha256: string; byteLength: number }>;

  /** Read entire file as Uint8Array. Throws FileSystemError(NOT_FOUND) if missing. */
  read(path: string): Promise<Uint8Array>;

  /** Delete file. NOT_FOUND is not an error (idempotent). */
  delete(path: string): Promise<void>;

  /** List directory contents (file names only, no recursive). */
  list(dir: string): Promise<string[]>;

  /** Stat a path. Returns exists: false if absent (never throws). */
  stat(path: string): Promise<StatResult>;

  /** Create directory recursively. No error if exists. */
  mkdir(dir: string): Promise<void>;

  /** Check path existence. */
  exists(path: string): Promise<boolean>;

  /** fsync a directory handle. Critical for rename durability. */
  fsyncDir(dir: string): Promise<void>;

  /** Get available disk space in bytes for the given path. */
  getAvailableSpace(path: string): Promise<number>;
}
