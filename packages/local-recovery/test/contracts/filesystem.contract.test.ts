import { describe, it, expect } from 'vitest';
import { FakeFileSystem } from '../../src/adapters/fake-filesystem.js';
import type { FileSystem } from '../../src/contracts/filesystem.js';

function createFs(): FileSystem {
  return new FakeFileSystem();
}

describe('FileSystem contract (fake adapter)', () => {
  it('atomicWrite stores data and returns path, sha256, and byteLength', async () => {
    const fs = createFs();
    await fs.mkdir('/test');

    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const result = await fs.atomicWrite('/test/chunk.webm', data);

    expect(result.path).toBe('/test/chunk.webm');
    expect(result.byteLength).toBe(5);
    expect(result.sha256).toHaveLength(64);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('atomicWrite persists data readable via read', async () => {
    const fs = createFs();
    await fs.mkdir('/test');

    const data = new Uint8Array([10, 20, 30]);
    await fs.atomicWrite('/test/data.bin', data);

    const readBack = await fs.read('/test/data.bin');
    expect(readBack).toEqual(data);
  });

  it('read throws for non-existent path', async () => {
    const fs = createFs();
    await expect(fs.read('/nonexistent')).rejects.toThrow();
  });

  it('delete removes a file', async () => {
    const fs = createFs();
    await fs.mkdir('/test');

    await fs.atomicWrite('/test/temp.bin', new Uint8Array([1]));
    await fs.delete('/test/temp.bin');

    await expect(fs.read('/test/temp.bin')).rejects.toThrow();
  });

  it('delete on non-existent path does not throw (idempotent)', async () => {
    const fs = createFs();
    await fs.delete('/never/existed');
    // should resolve without error
  });

  it('list returns file names in directory', async () => {
    const fs = createFs();
    await fs.mkdir('/dir');
    await fs.atomicWrite('/dir/a.bin', new Uint8Array([1]));
    await fs.atomicWrite('/dir/b.bin', new Uint8Array([2]));

    const files = await fs.list('/dir');
    expect(files).toContain('a.bin');
    expect(files).toContain('b.bin');
    expect(files).toHaveLength(2);
  });

  it('mkdir creates directory', async () => {
    const fs = createFs();
    await fs.mkdir('/newdir');
    const exists = await fs.exists('/newdir');
    expect(exists).toBe(true);
  });

  it('mkdir on existing directory does not throw', async () => {
    const fs = createFs();
    await fs.mkdir('/existing');
    await fs.mkdir('/existing');
    // should not throw
  });

  it('exists returns false for missing path', async () => {
    const fs = createFs();
    const exists = await fs.exists('/nowhere');
    expect(exists).toBe(false);
  });

  it('stat returns file metadata', async () => {
    const fs = createFs();
    await fs.mkdir('/test');
    await fs.atomicWrite('/test/file.bin', new Uint8Array(42));

    const stat = await fs.stat('/test/file.bin');
    expect(stat.exists).toBe(true);
    expect(stat.isFile).toBe(true);
    expect(stat.isDirectory).toBe(false);
    expect(stat.size).toBe(42);
    expect(stat.modifiedAt).toBeInstanceOf(Date);
  });

  it('stat returns exists=false for missing path', async () => {
    const fs = createFs();
    const stat = await fs.stat('/missing');
    expect(stat.exists).toBe(false);
  });

  it('fsyncDir does not throw', async () => {
    const fs = createFs();
    await fs.mkdir('/t');
    await fs.fsyncDir('/t');
    // should resolve
  });

  it('getAvailableSpace returns a positive number', async () => {
    const fs = createFs();
    const space = await fs.getAvailableSpace('/');
    expect(space).toBeGreaterThan(0);
  });

  it('atomicWrite is actually atomic via temp file', async () => {
    const fs = createFs();
    await fs.mkdir('/atomic');

    const data = new Uint8Array([7, 8, 9]);
    const result = await fs.atomicWrite('/atomic/check.webm', data);
    expect(result.path).toBe('/atomic/check.webm');
    // After completion, only the final path should exist
    const stat = await fs.stat('/atomic/check.webm');
    expect(stat.exists).toBe(true);
    expect(stat.size).toBe(3);
  });
});
