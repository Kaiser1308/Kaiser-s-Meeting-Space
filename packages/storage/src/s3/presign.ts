import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { SignUrlOptions, SignedUrl } from '../object-store.js';
import type { StorageKey } from '../key-derivation.js';

export interface PresignContext {
  readonly client: S3Client;
  readonly bucket: string;
  readonly now: () => Date;
}

/**
 * Mint a scoped, short-lived presigned URL bound to one key + method.
 *
 * PUT binds Content-Type as a signed header ( surfaced in requiredHeaders so the
 * caller knows what it must send). Content-Length is NOT bound to the signature:
 * S3/MinIO presigned PUT cannot enforce a content-length-range (that is a POST
 * policy feature), so the authoritative length+checksum check happens at
 * completion (HEAD fast-fail + streaming GET SHA-256).
 */
export async function presignUrl(
  key: StorageKey,
  opts: SignUrlOptions,
  ctx: PresignContext,
): Promise<SignedUrl> {
  const requiredHeaders: Record<string, string> = {};

  const command =
    opts.method === 'PUT'
      ? new PutObjectCommand({
          Bucket: ctx.bucket,
          Key: key,
          ContentType: opts.contentType,
        })
      : new GetObjectCommand({ Bucket: ctx.bucket, Key: key });

  if (opts.method === 'PUT' && opts.contentType) {
    requiredHeaders['Content-Type'] = opts.contentType;
  }

  const url = await getSignedUrl(ctx.client, command, { expiresIn: opts.expiresInSeconds });
  const expiresAt = new Date(ctx.now().getTime() + opts.expiresInSeconds * 1000).toISOString();

  return { url, method: opts.method, expiresAt, requiredHeaders };
}
