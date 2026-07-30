import { describe, it, expect } from 'vitest';
import { runObjectStoreContract, readAll } from '../object-store.contract.js';
import { deriveStorageKey } from '../key-derivation.js';
import { InMemoryObjectStore } from './in-memory-object-store.js';

runObjectStoreContract('InMemoryObjectStore', (opts) => new InMemoryObjectStore(opts?.now));

describe('InMemoryObjectStore — implementation-specific', () => {
  it('concurrent puts to different keys do not collide', async () => {
    const store = new InMemoryObjectStore();
    const keys = Array.from({ length: 10 }, (_, i) =>
      deriveStorageKey('owner-a', crypto.randomUUID(), 'mic', i),
    );
    await Promise.all(
      keys.map((key, i) =>
        store.put(key, new Uint8Array([i]), {
          contentLength: 1,
          contentType: 'audio/webm',
        }),
      ),
    );
    for (let i = 0; i < keys.length; i++) {
      const head = await store.head(keys[i]!);
      expect(head.exists).toBe(true);
      const got = await store.get(keys[i]!);
      expect(await readAll(got.body)).toEqual(new Uint8Array([i]));
    }
  });

  it('body round-trip integrity for a larger payload', async () => {
    const store = new InMemoryObjectStore();
    const key = deriveStorageKey('owner-a', crypto.randomUUID(), 'system', 7);
    const body = new Uint8Array(4096);
    for (let i = 0; i < body.length; i++) body[i] = (i * 31) & 0xff;
    await store.put(key, body, {
      contentLength: body.byteLength,
      contentType: 'audio/webm',
    });
    const out = await readAll((await store.get(key)).body);
    expect(out.byteLength).toBe(4096);
    expect(out).toEqual(body);
  });

  it('signUrl returns a memory:// url carrying method and expiry but no credentials', async () => {
    const store = new InMemoryObjectStore();
    const signed = await store.signUrl(deriveStorageKey('owner-a', crypto.randomUUID(), 'mic', 0), {
      method: 'GET',
      expiresInSeconds: 30,
    });
    expect(signed.url.startsWith('memory://')).toBe(true);
    expect(signed.url).not.toMatch(/password|secret|accessKey/i);
  });

  it('get can be called repeatedly (each call yields a fresh stream)', async () => {
    const store = new InMemoryObjectStore();
    const key = deriveStorageKey('owner-a', crypto.randomUUID(), 'mic', 0);
    const body = new Uint8Array([1, 2, 3]);
    await store.put(key, body, { contentLength: 3, contentType: 'audio/webm' });
    const first = await readAll((await store.get(key)).body);
    const second = await readAll((await store.get(key)).body);
    expect(first).toEqual(body);
    expect(second).toEqual(body);
  });
});
