import { describe, it, expect, afterAll } from 'vitest';
import { MinioContainer } from '@testcontainers/minio';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import { S3ObjectStore } from './s3-object-store.js';
import { runObjectStoreContract, readAll } from '../object-store.contract.js';
import { deriveStorageKey } from '../key-derivation.js';
import type { StorageConfig } from '../config.js';

interface MinioEnv {
  readonly config: StorageConfig;
  readonly stop: () => Promise<void>;
}

async function startMinio(): Promise<MinioEnv> {
  const container = await new MinioContainer().withStartupTimeout(120_000).start();
  const endpoint = container.getConnectionUrl();
  const accessKey = container.getUsername();
  const secretKey = container.getPassword();
  const bucket = `kms-test-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const admin = new S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  try {
    await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (e) {
    await container.stop();
    throw e;
  }
  return {
    config: {
      endpoint,
      region: 'us-east-1',
      bucket,
      accessKey,
      secretKey,
      forcePathStyle: true,
    },
    stop: async () => {
      admin.destroy();
      await container.stop();
    },
  };
}

let minio: MinioEnv | null = null;
try {
  minio = await startMinio();
} catch (e) {
  minio = null;
  console.warn(
    '[storage] MinIO integration unavailable — real-storage tests skipped:',
    (e as Error).message,
  );
}

afterAll(async () => {
  if (minio) await minio.stop();
});

const describeIfMinio = minio ? describe : describe.skip;

describeIfMinio('S3ObjectStore — contract against real MinIO', () => {
  runObjectStoreContract('S3ObjectStore (MinIO)', (opts) => {
    return new S3ObjectStore(minio!.config, opts?.now);
  });
});

describeIfMinio('S3ObjectStore — MinIO-specific presign round-trips', () => {
  it('presign PUT: a client PUT with the signed URL + Content-Type stores the object', async () => {
    const store = new S3ObjectStore(minio!.config);
    const key = deriveStorageKey('owner-a', crypto.randomUUID(), 'mic', 0);
    const body = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const signed = await store.signUrl(key, {
      method: 'PUT',
      expiresInSeconds: 300,
      contentType: 'audio/webm',
    });
    const res = await fetch(signed.url, {
      method: 'PUT',
      headers: signed.requiredHeaders,
      body,
    });
    expect(res.status).toBeLessThan(300);
    const head = await store.head(key);
    expect(head.exists).toBe(true);
    expect(head.contentLength).toBe(body.byteLength);
    expect(head.contentType).toBe('audio/webm');
    const got = await readAll((await store.get(key)).body);
    expect(got).toEqual(body);
  });

  it('presign GET: a client GET with the signed URL downloads the bytes', async () => {
    const store = new S3ObjectStore(minio!.config);
    const key = deriveStorageKey('owner-a', crypto.randomUUID(), 'system', 1);
    const body = new Uint8Array(64);
    for (let i = 0; i < body.length; i++) body[i] = i;
    await store.put(key, body, {
      contentLength: body.byteLength,
      contentType: 'audio/webm',
    });
    const signed = await store.signUrl(key, { method: 'GET', expiresInSeconds: 60 });
    const res = await fetch(signed.url);
    expect(res.status).toBeLessThan(300);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf).toEqual(body);
  });

  it('head returns a non-empty etag from MinIO', async () => {
    const store = new S3ObjectStore(minio!.config);
    const key = deriveStorageKey('owner-a', crypto.randomUUID(), 'mic', 2);
    await store.put(key, new Uint8Array([1]), {
      contentLength: 1,
      contentType: 'audio/webm',
    });
    const head = await store.head(key);
    expect(typeof head.etag).toBe('string');
    expect(head.etag!.length).toBeGreaterThan(0);
  });
});
