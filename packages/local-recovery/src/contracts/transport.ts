export type UploadTransportErrorCategory =
  'NETWORK' | 'AUTH_EXPIRED' | 'CHECKSUM_CONFLICT' | 'STORAGE_ERROR' | 'SERVER_ERROR';

export class UploadTransportError extends Error {
  constructor(
    public readonly category: UploadTransportErrorCategory,
    message: string,
    public readonly cause?: unknown,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'UploadTransportError';
  }
}

export interface ServerManifestEntry {
  readonly chunkIndex: number;
  readonly source: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly storageKey: string | null;
  readonly uploadStatus: string;
}

export interface UploadTransport {
  /** Register a chunk with the server before uploading. Returns upload target info. */
  registerChunk(
    meetingId: string,
    source: string,
    chunkIndex: number,
    sha256: string,
    byteLength: number,
  ): Promise<{
    storageKey: string;
    presignedUrl?: string;
    requiredHeaders: Record<string, string>;
  }>;

  /** Upload raw chunk bytes to storage. */
  uploadChunk(storageKey: string, body: Uint8Array, byteLength: number): Promise<{ etag?: string }>;

  /** Mark a chunk as completely uploaded on the server. Throws on checksum conflict. */
  completeChunk(
    chunkId: string,
    sha256: string,
  ): Promise<{ finalized: boolean; serverSha256: string }>;

  /** Fetch the server manifest for reconciliation. */
  getServerManifest(meetingId: string): Promise<ServerManifestEntry[]>;

  /** Request server-side meeting finalization. Idempotent. */
  endMeeting(meetingId: string): Promise<{ meetingId: string; state: string; finalizedAt: string }>;
}
