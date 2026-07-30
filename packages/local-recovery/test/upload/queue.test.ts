import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UploadQueue } from '../../src/upload/queue.js';
import { createSqlJsConnection } from '../../src/adapters/sqljs-adapter.js';
import type { SqliteConnection } from '../../src/contracts/sqlite.js';

describe('UploadQueue', () => {
  let db: SqliteConnection;
  let queue: UploadQueue;

  beforeEach(async () => {
    db = await createSqlJsConnection();
    queue = new UploadQueue(db);
    await queue.init();
  });

  afterEach(() => {
    db.close();
  });

  const sampleEntry = () => ({
    meetingId: '00000000-0000-0000-0000-000000000001' as never,
    source: 'mic' as const,
    chunkIndex: 0,
    sha256: 'a'.repeat(64) as never,
    byteLength: 1024,
    storageKey: 'audio/test/mic-0.webm',
  });

  it('enqueues an entry and returns stats', async () => {
    await queue.enqueue(sampleEntry());
    const stats = await queue.getStats();
    expect(stats.total).toBe(1);
    expect(stats.pending).toBe(1);
  });

  it('dequeues pending entries', async () => {
    await queue.enqueue(sampleEntry());
    await queue.enqueue({ ...sampleEntry(), chunkIndex: 1 });

    const batch = await queue.dequeue(10);
    expect(batch).toHaveLength(2);
    expect(batch[0]!.status).toBe('uploading');
  });

  it('marks entry as completed', async () => {
    await queue.enqueue(sampleEntry());
    const [entry] = await queue.dequeue(1);
    expect(entry).toBeTruthy();

    await queue.markComplete(entry!.id);
    const state = await queue.getState(entry!.id);
    expect(state!.status).toBe('completed');
  });

  it('marks entry as failed with retry', async () => {
    await queue.enqueue(sampleEntry());
    const [entry] = await queue.dequeue(1);
    expect(entry).toBeTruthy();

    await queue.markFailed(entry!.id, 'network error');
    const state = await queue.getState(entry!.id);
    expect(state!.status).toBe('failed');
    expect(state!.lastError).toBe('network error');
    // First failure: retry should be scheduled
    expect(state!.nextRetryAt).toBeTruthy();
  });

  it('throws for full queue', async () => {
    const smallQueue = new UploadQueue(db, { maxSize: 1 });
    await smallQueue.init();
    await smallQueue.enqueue(sampleEntry());

    await expect(smallQueue.enqueue({ ...sampleEntry(), chunkIndex: 1 })).rejects.toThrow(
      'capacity',
    );
  });

  it('cancels a chunk', async () => {
    await queue.enqueue(sampleEntry());
    await queue.cancelChunk('00000000-0000-0000-0000-000000000001' as never, 'mic', 0);

    const state = await queue.getState(1);
    expect(state!.status).toBe('cancelled');
  });

  it('cancels all for a meeting', async () => {
    await queue.enqueue(sampleEntry());
    await queue.enqueue({ ...sampleEntry(), chunkIndex: 1 });
    await queue.enqueue({ ...sampleEntry(), chunkIndex: 2 });

    await queue.cancelMeeting('00000000-0000-0000-0000-000000000001' as never);

    const stats = await queue.getStats();
    expect(stats.cancelled).toBe(3);
  });

  it('getPending returns non-terminal entries', async () => {
    await queue.enqueue(sampleEntry());
    await queue.enqueue({ ...sampleEntry(), chunkIndex: 1 });

    const pending = await queue.getPending();
    expect(pending).toHaveLength(2);
  });

  it('drain cancels all active entries', async () => {
    await queue.enqueue(sampleEntry());
    await queue.enqueue({ ...sampleEntry(), chunkIndex: 1 });
    await queue.dequeue(1); // one is now uploading

    await queue.drain();
    const stats = await queue.getStats();
    expect(stats.cancelled).toBe(2);
  });
});
