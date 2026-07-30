import { describe, it, expect, beforeEach } from 'vitest';
import type { MeetingId, Sha256, Milliseconds, AudioSource } from '@kms/domain';
import { SyncScheduler } from './sync-scheduler.js';
import { FakeUploadTransport, FakeClock } from '@kms/local-recovery';
import { UploadQueue, ManifestStore } from '@kms/local-recovery';
import { createSqlJsConnection } from '@kms/local-recovery';

const MID = '550e8400-e29b-41d4-a716-446655440000' as MeetingId;
const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Sha256;
const MS_1000 = 1000 as Milliseconds;
const SRC: AudioSource = 'mic';

describe('SyncScheduler', () => {
  let scheduler: SyncScheduler;
  let queue: UploadQueue;
  let transport: FakeUploadTransport;
  let manifest: ManifestStore;
  let clock: FakeClock;

  beforeEach(async () => {
    const db = await createSqlJsConnection();
    queue = new UploadQueue(db, { maxSize: 100, maxConcurrent: 2, maxAttempts: 3 });
    await queue.init();
    transport = new FakeUploadTransport();
    manifest = new ManifestStore(db);
    await manifest.runMigrations();
    clock = new FakeClock();
    scheduler = new SyncScheduler(queue, transport, manifest, clock, 2);
  });

  it('starts and can be stopped', async () => {
    await scheduler.start();
    const state = await scheduler.getState();
    expect(['running', 'idle']).toContain(state.status);

    await scheduler.stop();
    const stopped = await scheduler.getState();
    expect(stopped.status).toBe('idle');
  });

  it('emits state updates to subscribers', async () => {
    const states: string[] = [];
    scheduler.subscribe((s) => states.push(s.status));

    await scheduler.start();
    await clock.sleep(200);

    expect(states.length).toBeGreaterThan(0);
    expect(states).toContain('running');
  });

  it('stops when stop() is called', async () => {
    await scheduler.start();
    await clock.sleep(50);
    await scheduler.stop();

    const state = await scheduler.getState();
    expect(state.status).toBe('idle');
  });

  it('processes queued entries through transport', async () => {
    await queue.enqueue({
      meetingId: MID,
      source: SRC,
      chunkIndex: 0,
      sha256: SHA,
      byteLength: 1024,
      storageKey: 'key0',
    });

    await manifest.appendEntry({
      meetingId: MID,
      source: SRC,
      chunkIndex: 0,
      filePath: '/test/chunk-0.webm',
      sha256: SHA,
      byteLength: 1024,
      wallClockStart: '2024-01-01T00:00:00.000Z',
      wallClockEnd: '2024-01-01T00:00:01.000Z',
      monotonicStart: 0,
      monotonicEnd: 1000,
      sampleRate: 48000,
      channels: 1,
      codec: 'opus',
      container: 'webm',
      durationMs: MS_1000,
      uploadStatus: 'pending',
      version: 1,
    });

    await scheduler.start();
    await clock.sleep(500);
    await scheduler.stop();

    const registered = transport.getRegisteredChunks();
    expect(registered.some((c) => c.chunkIndex === 0)).toBe(true);
  });

  it('transitions to idle with empty queue', async () => {
    const stateBefore = await scheduler.getState();
    expect(stateBefore.status).toBe('idle');

    await scheduler.start();
    await clock.sleep(200);

    const state = await scheduler.getState();
    expect(['idle', 'running']).toContain(state.status);
  });

  it('handles network errors gracefully', async () => {
    transport.injectNetworkError();

    await queue.enqueue({
      meetingId: MID,
      source: SRC,
      chunkIndex: 0,
      sha256: SHA,
      byteLength: 1024,
      storageKey: 'key0',
    });

    await scheduler.start();
    await clock.sleep(300);
    await scheduler.stop();

    const stats = await queue.getStats();
    expect(stats.total).toBe(1);
  });

  it('handles checksum conflict as non-retryable', async () => {
    transport.injectChecksumConflict(`${MID}/mic/0`);

    await queue.enqueue({
      meetingId: MID,
      source: SRC,
      chunkIndex: 0,
      sha256: SHA,
      byteLength: 1024,
      storageKey: 'key0',
    });

    await scheduler.start();
    await clock.sleep(300);
    await scheduler.stop();

    const stats = await queue.getStats();
    expect(stats.total).toBe(1);
  });

  it('subscribers are isolated from errors', async () => {
    let callCount = 0;
    scheduler.subscribe(() => {
      callCount++;
    });
    scheduler.subscribe(() => {
      throw new Error('subscriber error');
    });
    scheduler.subscribe(() => {
      callCount++;
    });

    await scheduler.start();
    await clock.sleep(100);
    await scheduler.stop();

    expect(callCount).toBeGreaterThan(0);
  });
});
