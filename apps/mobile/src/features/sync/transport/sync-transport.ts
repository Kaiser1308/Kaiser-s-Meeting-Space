import type { UploadTransport, ServerManifestEntry } from '@kms/local-recovery';
import { UploadTransportError } from '@kms/local-recovery';
import { parseChunkId } from '@kms/domain';
import type { ClientAuth } from '../../../auth/auth-client';
import { AuthHttpClient } from './auth-http';
import { z } from 'zod';

// ── Inline API response schemas (mirroring apps/api/src/modules/audio/dto.ts) ──

const RegisterChunkResponseSchema = z.object({
  chunkId: z.string().min(1),
  created: z.boolean(),
  upload: z.object({
    method: z.enum(['PUT']),
    url: z.string().url(),
    expiresAt: z.string(),
    requiredHeaders: z.record(z.string(), z.string()),
  }),
  storageKey: z.string().min(1),
});

const CompleteChunkResponseSchema = z.object({
  chunkId: z.string().min(1),
  completed: z.boolean(),
  finalizedAt: z.string().nullable(),
});

const ManifestResponseSchema = z.object({
  meetingId: z.string().min(1),
  sources: z.array(
    z.object({
      source: z.enum(['mic', 'system']),
      completed: z.number().int().min(0),
      total: z.number().int().min(0),
      missingRanges: z.array(
        z.object({
          startMs: z.number().min(0),
          endMs: z.number().min(0),
          reason: z.string().optional(),
        }),
      ),
    }),
  ),
  manifest: z.array(
    z.object({
      chunkIndex: z.number().int().min(0),
      source: z.enum(['mic', 'system']),
      sha256: z.string().length(64),
      byteLength: z.number().int().min(0),
      storageKey: z.string().nullable(),
      uploadStatus: z.enum(['pending', 'uploading', 'completed', 'failed']),
    }),
  ),
});

const EndMeetingResponseSchema = z.object({
  meetingId: z.string().min(1),
  state: z.string(),
  finalizedAt: z.string(),
});

// ── SyncTransport config ──

export interface SyncTransportConfig {
  baseUrl: string;
  clientAuth: ClientAuth;
  timeoutMs?: number;
}

// ── SyncTransport ──

/**
 * Mobile sync transport implementing the P07 UploadTransport interface.
 *
 * Communicates with the P05 KMS API for chunk registration, signed upload,
 * completion, manifest retrieval, and meeting finalization.
 *
 * Tracked registrations map storageKey → presigned URL for upload.
 * All methods are idempotent where the server supports it.
 * Token refresh is transparent via AuthHttpClient.
 */
export class SyncTransport implements UploadTransport {
  private readonly http: AuthHttpClient;
  /** Map storageKey → { presignedUrl, requiredHeaders } from registration. */
  private registrations = new Map<
    string,
    { presignedUrl: string; requiredHeaders: Record<string, string> }
  >();

  constructor(config: SyncTransportConfig) {
    this.http = new AuthHttpClient(config.clientAuth, {
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
  }

  async registerChunk(
    meetingId: string,
    source: string,
    chunkIndex: number,
    sha256: string,
    byteLength: number,
  ): Promise<{
    storageKey: string;
    presignedUrl?: string;
    requiredHeaders: Record<string, string>;
  }> {
    const idempotencyKey = crypto.randomUUID();

    const result = await this.http.post<unknown>(
      `/v1/meetings/${meetingId}/audio/chunks/register`,
      { source, chunkIndex, sha256, byteLength },
      { 'Idempotency-Key': idempotencyKey },
    );

    const parsed = RegisterChunkResponseSchema.parse(result);

    // Track for later upload
    this.registrations.set(parsed.storageKey, {
      presignedUrl: parsed.upload.url,
      requiredHeaders: parsed.upload.requiredHeaders,
    });

    return {
      storageKey: parsed.storageKey,
      presignedUrl: parsed.upload.url,
      requiredHeaders: parsed.upload.requiredHeaders,
    };
  }

  async uploadChunk(
    storageKey: string,
    body: Uint8Array,
    _byteLength: number,
  ): Promise<{ etag?: string }> {
    const reg = this.registrations.get(storageKey);
    if (!reg) {
      throw new UploadTransportError(
        'STORAGE_ERROR',
        'Chunk not registered — call registerChunk first',
        undefined,
        false,
      );
    }

    return this.uploadToPresignedUrl(reg.presignedUrl, body, reg.requiredHeaders);
  }

  async uploadToPresignedUrl(
    presignedUrl: string,
    body: Uint8Array,
    requiredHeaders: Record<string, string>,
  ): Promise<{ etag?: string }> {
    const controller = new AbortController();
    const timeoutMs = 60_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'audio/webm',
          'Content-Length': String(body.length),
          ...requiredHeaders,
        },
        body: body.buffer as ArrayBuffer,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new UploadTransportError(
          'STORAGE_ERROR',
          `Upload to presigned URL failed: HTTP ${response.status}`,
          undefined,
          true,
        );
      }

      const etag = response.headers.get('ETag') ?? undefined;
      return { etag };
    } catch (err) {
      if (err instanceof UploadTransportError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new UploadTransportError('NETWORK', 'Upload timed out', err, true);
      }
      throw new UploadTransportError('NETWORK', 'Upload failed: network error', err, true);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async completeChunk(
    chunkId: string,
    sha256: string,
  ): Promise<{ finalized: boolean; serverSha256: string }> {
    const idempotencyKey = crypto.randomUUID();

    const parsed = parseChunkId(chunkId);
    const result = await this.http.post<unknown>(
      `/v1/meetings/${parsed.meetingId}/audio/chunks/${parsed.source}/${parsed.chunkIndex}/complete`,
      { sha256 },
      { 'Idempotency-Key': idempotencyKey },
    );

    const body = CompleteChunkResponseSchema.parse(result);
    return { finalized: body.completed, serverSha256: sha256 };
  }

  async getServerManifest(meetingId: string): Promise<ServerManifestEntry[]> {
    const result = await this.http.get<unknown>(`/v1/meetings/${meetingId}/audio/manifest`);

    const parsed = ManifestResponseSchema.parse(result);

    return parsed.manifest.map((entry) => ({
      chunkIndex: entry.chunkIndex,
      source: entry.source,
      sha256: entry.sha256,
      byteLength: entry.byteLength,
      storageKey: entry.storageKey,
      uploadStatus: entry.uploadStatus,
    }));
  }

  async endMeeting(
    meetingId: string,
  ): Promise<{ meetingId: string; state: string; finalizedAt: string }> {
    const idempotencyKey = crypto.randomUUID();

    const result = await this.http.post<unknown>(
      `/v1/meetings/${meetingId}/end`,
      {},
      { 'Idempotency-Key': idempotencyKey },
    );

    return EndMeetingResponseSchema.parse(result);
  }
}
