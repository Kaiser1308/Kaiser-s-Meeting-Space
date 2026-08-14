import type { RenderedArtifact } from './renderers.js';

export type SimpleExportFormat = 'markdown' | 'txt' | 'json' | 'audio' | 'docx' | 'pdf';
export interface ExportJobRequest {
  readonly ownerId: string;
  readonly manifestHash: string;
  readonly format: SimpleExportFormat;
}
export interface ExportJobRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly manifestHash: string;
  readonly format: SimpleExportFormat;
  readonly status: 'pending' | 'completed' | 'canceled';
  readonly artifact?: Readonly<RenderedArtifact>;
  readonly artifactSha256?: string;
  readonly artifactByteLength?: number;
  readonly provenance?: Readonly<{ manifestHash: string; rendererFormat: SimpleExportFormat }>;
}
export interface ExportDownload {
  readonly url: string;
  readonly expiresAt: number;
}

export interface StoredArtifactHead {
  readonly exists: boolean;
  readonly contentLength?: number;
  readonly sha256?: string;
  readonly contentType?: string;
}

export function verifyStoredArtifact(
  job: ExportJobRecord,
  head: StoredArtifactHead,
): { ok: true } | { ok: false; reason: string } {
  if (!head.exists) return { ok: false, reason: 'artifact not found' };
  if (head.contentLength !== job.artifactByteLength) {
    return { ok: false, reason: 'artifact size mismatch' };
  }
  if (head.sha256 !== job.artifactSha256) return { ok: false, reason: 'artifact hash mismatch' };
  if (head.contentType !== job.artifact?.contentType) {
    return { ok: false, reason: 'artifact content type mismatch' };
  }
  return { ok: true };
}

export class InMemoryExportJobs {
  private readonly records = new Map<string, ExportJobRecord>();
  private readonly dedupe = new Map<string, string>();
  private readonly downloads = new Map<string, { readonly jobId: string; readonly ownerId: string; readonly expiresAt: number }>();
  private nextId = 1;
  private nextDownloadId = 1;

  async enqueue(request: ExportJobRequest): Promise<ExportJobRecord> {
    const key = `${request.ownerId}:${request.manifestHash}:${request.format}`;
    const existingId = this.dedupe.get(key);
    if (existingId) return this.records.get(existingId)!;
    const record = Object.freeze({ id: `export-${this.nextId++}`, ...request, status: 'pending' as const });
    this.records.set(record.id, record);
    this.dedupe.set(key, record.id);
    return record;
  }

  async complete(id: string, artifact: RenderedArtifact): Promise<ExportJobRecord> {
    const current = this.require(id);
    if (current.status === 'completed') throw new Error('export output is immutable');
    if (current.status === 'canceled') throw new Error('export job is canceled');
    const bytes = this.artifactBytes(artifact);
    const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
    const artifactSha256 = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const completed = Object.freeze({
      ...current,
      status: 'completed' as const,
      artifact: Object.freeze({ ...artifact }),
      artifactSha256,
      artifactByteLength: bytes.byteLength,
      provenance: Object.freeze({ manifestHash: current.manifestHash, rendererFormat: current.format }),
    });
    this.records.set(id, completed);
    return completed;
  }

  private artifactBytes(artifact: RenderedArtifact): Uint8Array {
    if (artifact.format !== 'docx' && artifact.format !== 'pdf') {
      return new TextEncoder().encode(artifact.body);
    }
    const binary = atob(artifact.body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async cancel(id: string, ownerId: string): Promise<ExportJobRecord> {
    const current = this.requireOwned(id, ownerId);
    if (current.status === 'completed') throw new Error('export output is immutable');
    const canceled = Object.freeze({ ...current, status: 'canceled' as const });
    this.records.set(id, canceled);
    return canceled;
  }

  async retry(id: string, ownerId: string): Promise<ExportJobRecord> {
    const current = this.requireOwned(id, ownerId);
    if (current.status !== 'canceled') throw new Error('only canceled export jobs can retry');
    const retried = Object.freeze({ id: `export-${this.nextId++}`, ownerId, manifestHash: current.manifestHash, format: current.format, status: 'pending' as const });
    this.records.set(retried.id, retried);
    this.dedupe.set(`${ownerId}:${current.manifestHash}:${current.format}`, retried.id);
    return retried;
  }

  async history(ownerId: string): Promise<readonly ExportJobRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.ownerId === ownerId)
      .sort((left, right) => Number(right.id.slice(7)) - Number(left.id.slice(7)));
  }

  async createDownload(id: string, ownerId: string, now = Date.now(), ttlMs = 60_000): Promise<ExportDownload> {
    const record = this.requireOwned(id, ownerId);
    if (record.status !== 'completed') throw new Error('export artifact not ready');
    const url = `kms-download-${this.nextDownloadId++}`;
    const expiresAt = now + ttlMs;
    this.downloads.set(url, { jobId: id, ownerId, expiresAt });
    return { url, expiresAt };
  }

  async resolveDownload(url: string, ownerId: string, now = Date.now()): Promise<string> {
    const download = this.downloads.get(url);
    if (!download || download.ownerId !== ownerId) throw new Error('download not found');
    if (now > download.expiresAt) throw new Error('download expired');
    return download.jobId;
  }

  async resolveVerifiedDownload(
    url: string,
    ownerId: string,
    head: StoredArtifactHead,
    now = Date.now(),
  ): Promise<string> {
    const jobId = await this.resolveDownload(url, ownerId, now);
    const record = await this.get(jobId, ownerId);
    const verification = verifyStoredArtifact(record, head);
    if (!verification.ok) throw new Error(verification.reason);
    return jobId;
  }

  async get(id: string, ownerId: string): Promise<ExportJobRecord> {
    return this.requireOwned(id, ownerId);
  }

  private require(id: string): ExportJobRecord {
    const record = this.records.get(id);
    if (!record) throw new Error('export job not found');
    return record;
  }

  private requireOwned(id: string, ownerId: string): ExportJobRecord {
    const record = this.require(id);
    if (record.ownerId !== ownerId) throw new Error('export job not found');
    return record;
  }
}
