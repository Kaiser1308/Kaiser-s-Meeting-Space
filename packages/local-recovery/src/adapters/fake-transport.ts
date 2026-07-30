import {
  UploadTransportError,
  type UploadTransport,
  type ServerManifestEntry,
} from '../contracts/transport.js';

interface StoredChunk {
  meetingId: string;
  source: string;
  chunkIndex: number;
  sha256: string;
  byteLength: number;
  storageKey: string;
  body: Uint8Array | null;
  completed: boolean;
  finalized: boolean;
}

export class FakeUploadTransport implements UploadTransport {
  private chunks = new Map<string, StoredChunk>();
  private networkDown = false;
  private authExpired = false;
  private conflictChunkIds = new Set<string>();
  private counter = 0;

  // ── Fault injection ──

  injectNetworkError(): void {
    this.networkDown = true;
  }

  injectAuthExpired(): void {
    this.authExpired = true;
  }

  injectChecksumConflict(chunkId: string): void {
    this.conflictChunkIds.add(chunkId);
  }

  clearFaults(): void {
    this.networkDown = false;
    this.authExpired = false;
    this.conflictChunkIds.clear();
  }

  // ── Inspection ──

  getRegisteredChunks(): Array<{ source: string; chunkIndex: number; sha256: string }> {
    return Array.from(this.chunks.values()).map((c) => ({
      source: c.source,
      chunkIndex: c.chunkIndex,
      sha256: c.sha256,
    }));
  }

  getUploadedChunks(): Array<{ storageKey: string; size: number }> {
    return Array.from(this.chunks.values())
      .filter((c) => c.body !== null)
      .map((c) => ({
        storageKey: c.storageKey,
        size: c.body!.length,
      }));
  }

  getCompletedChunks(): Array<{ chunkId: string }> {
    return Array.from(this.chunks.values())
      .filter((c) => c.completed)
      .map((c) => ({
        chunkId: `${c.meetingId}/${c.source}/${c.chunkIndex}`,
      }));
  }

  // ── UploadTransport implementation ──

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
    if (this.networkDown) {
      throw new UploadTransportError('NETWORK', 'Network unavailable');
    }
    if (this.authExpired) {
      throw new UploadTransportError('AUTH_EXPIRED', 'Auth expired', undefined, false);
    }

    this.counter++;
    const storageKey = `audio/test/${meetingId}/${source}/${chunkIndex}.webm`;
    const chunkId = `${meetingId}/${source}/${chunkIndex}`;

    this.chunks.set(chunkId, {
      meetingId,
      source,
      chunkIndex,
      sha256,
      byteLength,
      storageKey,
      body: null,
      completed: false,
      finalized: false,
    });

    return {
      storageKey,
      presignedUrl: `https://fake-s3.example.com/${storageKey}`,
      requiredHeaders: { 'Content-Type': 'audio/webm' },
    };
  }

  async uploadChunk(
    storageKey: string,
    body: Uint8Array,
    _byteLength: number,
  ): Promise<{ etag?: string }> {
    if (this.networkDown) {
      throw new UploadTransportError('NETWORK', 'Network unavailable');
    }

    // Find the chunk by storage key
    let found: StoredChunk | undefined;
    for (const c of this.chunks.values()) {
      if (c.storageKey === storageKey) {
        found = c;
        break;
      }
    }

    if (!found) {
      throw new UploadTransportError('STORAGE_ERROR', 'Chunk not registered');
    }

    found.body = body;
    return { etag: `etag-${this.counter}` };
  }

  async completeChunk(
    chunkId: string,
    sha256: string,
  ): Promise<{ finalized: boolean; serverSha256: string }> {
    if (this.conflictChunkIds.has(chunkId)) {
      throw new UploadTransportError(
        'CHECKSUM_CONFLICT',
        'Checksum mismatch with server',
        undefined,
        false,
      );
    }

    const chunk = this.chunks.get(chunkId);
    if (!chunk) {
      throw new UploadTransportError('STORAGE_ERROR', 'Chunk not found');
    }

    chunk.completed = true;
    chunk.finalized = true;

    return { finalized: true, serverSha256: sha256 };
  }

  async getServerManifest(meetingId: string): Promise<ServerManifestEntry[]> {
    const entries: ServerManifestEntry[] = [];
    for (const c of this.chunks.values()) {
      if (c.meetingId === meetingId) {
        entries.push({
          chunkIndex: c.chunkIndex,
          source: c.source,
          sha256: c.sha256,
          byteLength: c.byteLength,
          storageKey: c.storageKey,
          uploadStatus: c.completed ? 'completed' : 'pending',
        });
      }
    }
    entries.sort((a, b) => a.chunkIndex - b.chunkIndex);
    return entries;
  }

  async endMeeting(
    meetingId: string,
  ): Promise<{ meetingId: string; state: string; finalizedAt: string }> {
    if (this.networkDown) {
      throw new UploadTransportError('NETWORK', 'Network unavailable');
    }
    return { meetingId, state: 'finalizing', finalizedAt: new Date().toISOString() };
  }
}
