import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { StorageConfig } from '../config.js';
import { StorageError, toStorageError } from '../errors.js';
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
import { presignUrl } from './presign.js';

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

/**
 * ObjectStore backed by S3 (or any S3-compatible store such as MinIO/R2).
 * Constructs a single S3Client from StorageConfig. All SDK errors are normalized
 * to a content-free StorageError category; credentials/keys never propagate.
 */
export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly now: () => Date;

  constructor(config: StorageConfig, now: () => Date = () => new Date()) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
    this.bucket = config.bucket;
    this.now = now;
  }

  async put(
    key: StorageKey,
    body: Uint8Array | ReadableStream<Uint8Array>,
    opts: PutOptions,
  ): Promise<PutResult> {
    // The AWS SDK cannot compute an integrity hash for a flowing web ReadableStream
    // ("Unable to calculate hash for flowing readable stream"), so buffer stream
    // bodies to bytes. Safe: put stores complete objects bounded by MAX_CHUNK_BYTES.
    const payload = body instanceof Uint8Array ? body : await streamToBytes(body);
    try {
      const result = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: payload,
          ContentType: opts.contentType,
          ContentLength: opts.contentLength,
          Metadata: opts.metadata,
        }),
      );
      return { etag: result.ETag };
    } catch (e) {
      throw toStorageError(e);
    }
  }

  async head(key: StorageKey): Promise<HeadResult> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        exists: true,
        contentLength: r.ContentLength,
        contentType: r.ContentType,
        etag: r.ETag,
        lastModified: r.LastModified?.toISOString(),
        metadata: r.Metadata,
      };
    } catch (e) {
      const se = toStorageError(e);
      if (se.category === 'object_not_found') return { exists: false };
      throw se;
    }
  }

  async get(key: StorageKey): Promise<GetResult> {
    let response;
    try {
      response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      const se = toStorageError(e);
      if (se.category === 'object_not_found') throw new StorageError('object_not_found');
      throw se;
    }
    const body =
      response.Body?.transformToWebStream() ??
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    return {
      body,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
    };
  }

  async delete(key: StorageKey): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      throw toStorageError(e);
    }
  }

  async signUrl(key: StorageKey, opts: SignUrlOptions): Promise<SignedUrl> {
    return presignUrl(key, opts, {
      client: this.client,
      bucket: this.bucket,
      now: this.now,
    });
  }
}
