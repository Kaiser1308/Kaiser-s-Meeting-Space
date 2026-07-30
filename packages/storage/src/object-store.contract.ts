import { describe, it, expect } from 'vitest';
import type { ObjectStore } from './object-store.js';
import { deriveStorageKey, type StorageKey } from './key-derivation.js';
import { StorageError } from './errors.js';

/**
 * Shared ObjectStore contract suite.
 *
 * This is a helper module (NOT a collected test file): the contract suites are
 * registered only when a consumer (in-memory double, real S3/MinIO) calls
 * runObjectStoreContract(). Keeping it out of the *.test.ts glob avoids vitest
 * collecting a file that is also imported by other test files (module caching
 * would otherwise leave its own collection with zero suites).
 */

/** Factory that builds an isolated ObjectStore, optionally with an injected clock. */
export type StoreFactory = (opts?: { now?: () => Date }) => ObjectStore;

/** Fully consume a web ReadableStream into a single Uint8Array. */
export async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  reader.releaseLock();
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Derive a unique, server-shaped StorageKey so every test addresses a distinct object. */
function uniqueKey(source: 'mic' | 'system' = 'mic', index = 0): StorageKey {
  return deriveStorageKey('owner-contract', crypto.randomUUID(), source, index);
}

/**
 * Provider-neutral ObjectStore contract. Run against every implementation
 * (in-memory double, real S3/MinIO) to prove identical semantics.
 */
export function runObjectStoreContract(name: string, createStore: StoreFactory): void {
  describe(`ObjectStore contract — ${name}`, () => {
    it('put then head reports exists with correct length and content-type', async () => {
      const store = createStore();
      const key = uniqueKey();
      const body = new Uint8Array([1, 2, 3, 4, 5]);
      await store.put(key, body, {
        contentLength: body.byteLength,
        contentType: 'audio/webm',
      });
      const head = await store.head(key);
      expect(head.exists).toBe(true);
      expect(head.contentLength).toBe(5);
      expect(head.contentType).toBe('audio/webm');
    });

    it('head on a missing key returns exists=false without throwing', async () => {
      const store = createStore();
      const head = await store.head(uniqueKey());
      expect(head.exists).toBe(false);
    });

    it('get on a missing key throws StorageError(object_not_found)', async () => {
      const store = createStore();
      await expect(store.get(uniqueKey())).rejects.toMatchObject({
        name: 'StorageError',
        category: 'object_not_found',
      });
    });

    it('put(Uint8Array) then get round-trips the body', async () => {
      const store = createStore();
      const key = uniqueKey();
      const body = new Uint8Array(256);
      for (let i = 0; i < body.length; i++) body[i] = i & 0xff;
      await store.put(key, body, {
        contentLength: body.byteLength,
        contentType: 'audio/webm',
      });
      const got = await store.get(key);
      const out = await readAll(got.body);
      expect(out.byteLength).toBe(256);
      expect(out).toEqual(body);
    });

    it('put(ReadableStream) then get round-trips the body', async () => {
      const store = createStore();
      const key = uniqueKey();
      const body = new Uint8Array([10, 20, 30, 40]);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(body);
          controller.close();
        },
      });
      await store.put(key, stream, {
        contentLength: body.byteLength,
        contentType: 'audio/webm',
      });
      const got = await store.get(key);
      const out = await readAll(got.body);
      expect(out).toEqual(body);
    });

    it('put metadata round-trips through head', async () => {
      const store = createStore();
      const key = uniqueKey();
      await store.put(key, new Uint8Array([1]), {
        contentLength: 1,
        contentType: 'audio/webm',
        metadata: { 'x-meeting': '42' },
      });
      const head = await store.head(key);
      expect(head.metadata?.['x-meeting']).toBe('42');
    });

    it('delete removes the object (head → not exists)', async () => {
      const store = createStore();
      const key = uniqueKey();
      await store.put(key, new Uint8Array([9]), {
        contentLength: 1,
        contentType: 'audio/webm',
      });
      expect((await store.head(key)).exists).toBe(true);
      await store.delete(key);
      expect((await store.head(key)).exists).toBe(false);
    });

    it('signUrl(GET) returns url, method, expiresAt and empty requiredHeaders', async () => {
      const store = createStore();
      const signed = await store.signUrl(uniqueKey(), {
        method: 'GET',
        expiresInSeconds: 60,
      });
      expect(typeof signed.url).toBe('string');
      expect(signed.url.length).toBeGreaterThan(0);
      expect(signed.method).toBe('GET');
      expect(typeof signed.expiresAt).toBe('string');
      expect(new Date(signed.expiresAt).toString()).not.toBe('Invalid Date');
      expect(signed.requiredHeaders).toEqual({});
    });

    it('SignedUrl exposes only url/method/expiresAt/requiredHeaders (no key/bucket/credential field)', async () => {
      const store = createStore();
      const signed = await store.signUrl(uniqueKey(), {
        method: 'PUT',
        expiresInSeconds: 300,
        contentType: 'audio/webm',
      });
      expect(Object.keys(signed).sort()).toEqual(['expiresAt', 'method', 'requiredHeaders', 'url']);
    });

    it('signUrl(PUT) binds Content-Type in requiredHeaders', async () => {
      const store = createStore();
      const signed = await store.signUrl(uniqueKey(), {
        method: 'PUT',
        expiresInSeconds: 300,
        contentType: 'audio/webm',
      });
      expect(signed.requiredHeaders['Content-Type']).toBe('audio/webm');
    });

    it('signUrl expiresAt reflects the injected clock (past clock → past expiry)', async () => {
      const past = new Date('2020-01-01T00:00:00Z');
      const store = createStore({ now: () => past });
      const signed = await store.signUrl(uniqueKey(), {
        method: 'GET',
        expiresInSeconds: 60,
      });
      const expiresAt = new Date(signed.expiresAt).getTime();
      expect(expiresAt).toBe(past.getTime() + 60_000);
      expect(expiresAt).toBeLessThan(Date.now());
    });

    it('StorageError message is the category only — never leaks key/path/credential', async () => {
      const store = createStore();
      const key = uniqueKey();
      let err: unknown;
      try {
        await store.get(key);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(StorageError);
      const se = err as StorageError;
      expect(se.message).toBe(se.category);
      expect(se.message).not.toContain(key);
    });
  });
}
