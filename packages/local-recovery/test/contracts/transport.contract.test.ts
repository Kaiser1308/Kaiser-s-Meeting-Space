import { describe, it, expect } from 'vitest';
import { FakeUploadTransport } from '../../src/adapters/fake-transport.js';
import type { UploadTransport } from '../../src/contracts/transport.js';

function createTransport(): UploadTransport {
  return new FakeUploadTransport();
}

describe('UploadTransport contract (fake adapter)', () => {
  it('registerChunk returns a storageKey', async () => {
    const transport = createTransport();
    const result = await transport.registerChunk(
      '00000000-0000-0000-0000-000000000001',
      'mic',
      0,
      'a'.repeat(64),
      1024,
    );
    expect(result.storageKey).toBeTruthy();
    expect(typeof result.storageKey).toBe('string');
  });

  it('uploadChunk succeeds for registered data', async () => {
    const transport = createTransport();
    const { storageKey } = await transport.registerChunk(
      '00000000-0000-0000-0000-000000000001',
      'mic',
      0,
      'b'.repeat(64),
      256,
    );

    const data = new Uint8Array(256);
    const result = await transport.uploadChunk(storageKey, data, 256);
    expect(result.etag).toBeDefined();
  });

  it('completeChunk returns finalized state', async () => {
    const transport = createTransport();
    const { storageKey } = await transport.registerChunk(
      '00000000-0000-0000-0000-000000000001',
      'mic',
      0,
      'c'.repeat(64),
      512,
    );
    await transport.uploadChunk(storageKey, new Uint8Array(512), 512);

    const result = await transport.completeChunk(
      '00000000-0000-0000-0000-000000000001/mic/0',
      'c'.repeat(64),
    );
    expect(result.finalized).toBe(true);
    expect(result.serverSha256).toHaveLength(64);
  });

  it('getServerManifest returns entries for registered chunks', async () => {
    const transport = createTransport();
    await transport.registerChunk(
      '00000000-0000-0000-0000-000000000002',
      'mic',
      0,
      'd'.repeat(64),
      100,
    );
    await transport.registerChunk(
      '00000000-0000-0000-0000-000000000002',
      'mic',
      1,
      'e'.repeat(64),
      200,
    );

    const manifest = await transport.getServerManifest('00000000-0000-0000-0000-000000000002');
    expect(manifest).toHaveLength(2);
    expect(manifest[0]!.chunkIndex).toBe(0);
    expect(manifest[1]!.chunkIndex).toBe(1);
  });

  it('getRegisteredChunks returns inspection data', async () => {
    const transport = new FakeUploadTransport();
    await transport.registerChunk(
      '00000000-0000-0000-0000-000000000003',
      'system',
      0,
      'f'.repeat(64),
      300,
    );

    const registered = transport.getRegisteredChunks();
    expect(registered).toHaveLength(1);
    expect(registered[0]!.source).toBe('system');
  });

  it('injectChecksumConflict causes completeChunk to throw', async () => {
    const transport = new FakeUploadTransport();
    const chunkId = '00000000-0000-0000-0000-000000000004/mic/0';
    transport.injectChecksumConflict(chunkId);

    await expect(transport.completeChunk(chunkId, '0'.repeat(64))).rejects.toThrow();
  });
});
