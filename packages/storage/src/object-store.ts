import type { StorageKey } from './key-derivation.js';

/** Options for storing an object. */
export interface PutOptions {
  /** Body length in bytes; sets Content-Length and is validated against limits. */
  readonly contentLength: number;
  /** Required Content-Type the object must be stored with. */
  readonly contentType: string;
  /** Optional object metadata (x-amz-meta-*); keys must pass the safe-detail filter. */
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Result of storing an object. */
export interface PutResult {
  /** Object ETag when available; never required by callers. */
  readonly etag?: string;
}

/** Result of a HEAD probe (existence + metadata). */
export interface HeadResult {
  readonly exists: boolean;
  readonly contentLength?: number;
  readonly contentType?: string;
  readonly etag?: string;
  readonly lastModified?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Result of a GET (streaming body). */
export interface GetResult {
  /** Streaming body; the caller MUST consume or abort it. */
  readonly body: ReadableStream<Uint8Array>;
  readonly contentLength?: number;
  readonly contentType?: string;
}

/** Options for minting a scoped presigned URL bound to one key + method. */
export interface SignUrlOptions {
  readonly method: 'PUT' | 'GET';
  /** Lifetime in seconds. Capped by the signed-URL policy. */
  readonly expiresInSeconds: number;
  /** PUT only: Content-Type the uploader must send (bound as a signed header). */
  readonly contentType?: string;
  /** PUT only: exact Content-Length (bound when the provider supports it). */
  readonly contentLength?: number;
}

/** A scoped, short-lived presigned URL. Never carries the storage key/credentials as fields. */
export interface SignedUrl {
  /** The presigned URL string returned to the client. */
  readonly url: string;
  readonly method: 'PUT' | 'GET';
  /** RFC 3339 UTC expiry computed from the signing clock. */
  readonly expiresAt: string;
  /** Headers the caller MUST send for the signature to validate. */
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

/**
 * Provider-neutral object-store contract. Every method takes a server-derived key;
 * the interface never accepts user-supplied paths.
 */
export interface ObjectStore {
  /** Store a complete object. */
  put(
    key: StorageKey,
    body: Uint8Array | ReadableStream<Uint8Array>,
    opts: PutOptions,
  ): Promise<PutResult>;

  /** Probe existence + metadata. Never throws for a missing object. */
  head(key: StorageKey): Promise<HeadResult>;

  /** Stream the object body. */
  get(key: StorageKey): Promise<GetResult>;

  /** Delete one object. MUST NOT expose bulk/prefix delete. */
  delete(key: StorageKey): Promise<void>;

  /** Produce a scoped, short-lived presigned URL bound to one key + method. */
  signUrl(key: StorageKey, opts: SignUrlOptions): Promise<SignedUrl>;
}
