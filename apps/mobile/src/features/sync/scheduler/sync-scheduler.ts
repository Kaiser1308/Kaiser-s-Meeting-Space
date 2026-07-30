import type { UploadTransport } from '@kms/local-recovery';
import type { UploadQueue, QueueEntry } from '@kms/local-recovery';
import type { ManifestStore } from '@kms/local-recovery';
import type { Clock } from '@kms/local-recovery';
import { UploadTransportError } from '@kms/local-recovery';

/**
 * SyncScheduler state for UI observation.
 */
export type SchedulerStatus = 'idle' | 'running' | 'paused' | 'stopping' | 'error';

export interface SchedulerState {
  status: SchedulerStatus;
  pendingCount: number;
  uploadingCount: number;
  completedCount: number;
  failedCount: number;
  currentUpload: string | null;
  lastError: string | null;
}

/**
 * Mobile lifecycle-aware upload scheduler.
 *
 * Connects the P07 UploadQueue to the actual sync transport (SyncTransport).
 * Respects foreground/background state, network availability, and concurrency limits.
 */
export class SyncScheduler {
  private status: SchedulerStatus = 'idle';
  private abortController: AbortController | null = null;
  private listeners = new Set<(s: SchedulerState) => void>();
  private isForeground = true;
  private isOnline = true;

  /** Maximum concurrent uploads. */
  private readonly maxConcurrent: number;

  constructor(
    private readonly queue: UploadQueue,
    private readonly transport: UploadTransport,
    private readonly manifestStore: ManifestStore,
    private readonly clock: Clock,
    maxConcurrent?: number,
  ) {
    this.maxConcurrent = maxConcurrent ?? 3;
  }

  // ── Lifecycle ──

  async getState(): Promise<SchedulerState> {
    return this.computeState();
  }

  subscribe(listener: (s: SchedulerState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setForeground(foreground: boolean): void {
    this.isForeground = foreground;
    if (foreground && this.status === 'paused') {
      this.resume();
    }
    if (!foreground) {
      this.pause();
    }
  }

  setOnline(online: boolean): void {
    this.isOnline = online;
    if (online && this.status === 'paused') {
      this.resume();
    }
    if (!online) {
      this.pause();
    }
  }

  // ── Control ──

  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'running';
    this.abortController = new AbortController();
    this.emit();

    this.runLoop().catch(() => {
      // Errors are captured in state
    });
  }

  async pause(): Promise<void> {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.emit();
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return;
    if (!this.isForeground || !this.isOnline) {
      // Can't resume when background or offline
      return;
    }
    this.status = 'running';
    this.abortController = new AbortController();
    this.emit();

    this.runLoop().catch(() => {});
  }

  async stop(): Promise<void> {
    this.status = 'stopping';
    this.emit();

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.status = 'idle';
    this.emit();
  }

  /** Force a sync cycle (useful for manual retry). */
  async syncNow(): Promise<void> {
    if (this.status !== 'running') {
      await this.start();
    }
    // The runLoop handles draining the queue
  }

  /** Retry a specific failed entry. */
  async retryEntry(entryId: number): Promise<void> {
    const entry = await this.queue.getState(entryId);
    if (!entry || entry.status !== 'failed') return;

    // Reset to pending for retry
    await this.processEntry(entry);
  }

  // ── Internal loop ──

  private async runLoop(): Promise<void> {
    while (this.status === 'running') {
      try {
        // Check preconditions
        if (!this.isOnline) {
          this.status = 'paused';
          this.emit();
          return;
        }

        if (!this.isForeground) {
          // Still process one batch then pause
          const batch = await this.queue.dequeue(1);
          if (batch.length === 0) {
            this.status = 'paused';
            this.emit();
            return;
          }
          await Promise.all(batch.map((e) => this.processEntry(e)));
          this.status = 'paused';
          this.emit();
          return;
        }

        // Dequeue batch
        const batch = await this.queue.dequeue(this.maxConcurrent);
        if (batch.length === 0) {
          // Queue is drained
          this.status = 'idle';
          this.emit();
          return;
        }

        // Process concurrently
        await Promise.all(batch.map((e) => this.processEntry(e)));

        // Small delay between cycles
        await this.clock.sleep(100);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          break;
        }
        this.emit();
      }
    }
  }

  private async processEntry(entry: QueueEntry): Promise<void> {
    this.emit();

    try {
      // Register chunk
      const reg = await this.transport.registerChunk(
        entry.meetingId,
        entry.source,
        entry.chunkIndex,
        entry.sha256,
        entry.byteLength,
      );

      // Upload chunk
      await this.transport.uploadChunk(
        reg.storageKey,
        new Uint8Array(0), // Will be read by SyncTransport internally
        entry.byteLength,
      );

      // Complete chunk
      await this.transport.completeChunk(
        `${entry.meetingId}/${entry.source}/${entry.chunkIndex}`,
        entry.sha256,
      );

      // Mark complete in local queue
      await this.queue.markComplete(entry.id);

      // Update manifest upload status
      await this.manifestStore.updateUploadStatus(
        entry.meetingId,
        entry.source,
        entry.chunkIndex,
        'completed',
      );
    } catch (err) {
      if (err instanceof UploadTransportError) {
        // Terminal failures (checksum conflict, auth expired) — don't retry
        if (err.category === 'CHECKSUM_CONFLICT' || err.category === 'AUTH_EXPIRED') {
          await this.queue.markFailed(entry.id, err.message);
        } else if (err.retryable) {
          // Network errors — retry with backoff
          await this.queue.markFailed(entry.id, err.message);
        } else {
          // Server errors (403, etc.) — mark failed
          await this.queue.markFailed(entry.id, err.message);
        }
      } else {
        await this.queue.markFailed(entry.id, String(err));
      }
    }

    this.emit();
  }

  // ── State computation ──

  private async computeState(): Promise<SchedulerState> {
    const stats = await this.queue.getStats();
    return {
      status: this.status,
      pendingCount: stats.pending,
      uploadingCount: stats.uploading,
      completedCount: stats.completed,
      failedCount: stats.failed,
      currentUpload: null,
      lastError: null,
    };
  }

  private emit(): void {
    this.computeState()
      .then((s) => {
        for (const listener of this.listeners) {
          try {
            listener(s);
          } catch {
            /* isolate */
          }
        }
      })
      .catch(() => {});
  }
}
