import { describe, it, expect } from 'vitest';
import { FakeChecksum } from '../../src/adapters/fake-checksum.js';
import type { Checksum } from '../../src/contracts/checksum.js';
import { FakeFileSystem } from '../../src/adapters/fake-filesystem.js';

describe('Checksum contract (fake adapter)', () => {
  it('compute returns a 64-char hex string', async () => {
    const fs = new FakeFileSystem();
    await fs.mkdir('/test');
    await fs.atomicWrite('/test/data.bin', new Uint8Array([1, 2, 3]));

    const cs: Checksum = new FakeChecksum();
    const hash = await cs.compute('/test/data.bin');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verify returns true for matching checksum', async () => {
    const fs = new FakeFileSystem();
    await fs.mkdir('/t');
    await fs.atomicWrite('/t/file.bin', new Uint8Array([5]));

    const cs = new FakeChecksum();
    const hash = await cs.compute('/t/file.bin');
    const valid = await cs.verify('/t/file.bin', hash);
    expect(valid).toBe(true);
  });

  it('verify returns false for non-matching checksum', async () => {
    const fs = new FakeFileSystem();
    await fs.mkdir('/t');
    await fs.atomicWrite('/t/file.bin', new Uint8Array([5]));

    const cs = new FakeChecksum();
    const valid = await cs.verify('/t/file.bin', 'a'.repeat(64) as never);
    expect(valid).toBe(false);
  });

  it('injectMismatch causes verify to return false', async () => {
    const fs = new FakeFileSystem();
    await fs.mkdir('/t');
    await fs.atomicWrite('/t/m.bin', new Uint8Array([1]));

    const cs = new FakeChecksum();
    const hash = await cs.compute('/t/m.bin');
    cs.injectMismatch('/t/m.bin');

    const valid = await cs.verify('/t/m.bin', hash);
    expect(valid).toBe(false);
  });
});
