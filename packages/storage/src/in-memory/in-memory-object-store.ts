import { StorageError } from '../errors.js';
import type {
  ObjectStore,
  PutOptions,
  PutResult,
  HeadResult,
  GetResult,
  SignUrlOptions,
  SignedUrl,
} from '../object-store.js';
import type { StorageKey } from '../key-derivation.js';

interface StoredObject {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly contentLength: number;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly etag: string;
  readonly lastModified: string;
}

/** Fully consume a web ReadableStream of bytes into a single Uint8Array. */
async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
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

/** Cheap deterministic fake ETag (32 hex chars) so head/put round-trip a stable value. */
function fakeEtag(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  return (hex + hex + hex + hex).slice(0, 32);
}

function toBody(body: Uint8Array | ReadableStream<Uint8Array>): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return Promise.resolve(body);
  return streamToBytes(body);
}

/**
 * Faithful in-memory ObjectStore for contract testing. NOT shipped to production callers.
 * Stores objects in a Map keyed by their server-derived StorageKey.
 */
export class InMemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  async put(
    key: StorageKey,
    body: Uint8Array | ReadableStream<Uint8Array>,
    opts: PutOptions,
  ): Promise<PutResult> {
    const bytes = await toBody(body);
    const stored: StoredObject = {
      body: bytes,
      contentType: opts.contentType,
      contentLength: opts.contentLength,
      metadata: opts.metadata,
      etag: fakeEtag(bytes),
      lastModified: this.now().toISOString(),
    };
    this.objects.set(key, stored);
    return { etag: stored.etag };
  }

  async head(key: StorageKey): Promise<HeadResult> {
    const obj = this.objects.get(key);
    if (!obj) return { exists: false };
    return {
      exists: true,
      contentLength: obj.contentLength,
      contentType: obj.contentType,
      etag: obj.etag,
      lastModified: obj.lastModified,
      metadata: obj.metadata,
    };
  }

  async get(key: StorageKey): Promise<GetResult> {
    const obj = this.objects.get(key);
    if (!obj) throw new StorageError('object_not_found');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(obj.body));
        controller.close();
      },
    });
    return {
      body,
      contentLength: obj.contentLength,
      contentType: obj.contentType,
    };
  }

  async delete(key: StorageKey): Promise<void> {
    this.objects.delete(key);
  }

  async signUrl(key: StorageKey, opts: SignUrlOptions): Promise<SignedUrl> {
    const expiresAtEpoch = this.now().getTime() + opts.expiresInSeconds * 1000;
    const url = `memory://bucket/${key}?method=${opts.method}&expires=${expiresAtEpoch}`;
    const requiredHeaders: Record<string, string> =
      opts.method === 'PUT' && opts.contentType ? { 'Content-Type': opts.contentType } : {};
    return {
      url,
      method: opts.method,
      expiresAt: new Date(expiresAtEpoch).toISOString(),
      requiredHeaders,
    };
  }
}
