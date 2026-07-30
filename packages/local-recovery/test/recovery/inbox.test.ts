import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RecoveryInbox } from '../../src/recovery/inbox.js';
import { ManifestStore } from '../../src/manifest/store.js';
import { FakeFileSystem } from '../../src/adapters/fake-filesystem.js';
import { createSqlJsConnection } from '../../src/adapters/sqljs-adapter.js';
import type { SqliteConnection } from '../../src/contracts/sqlite.js';
import type { ManifestEntry } from '../../src/manifest/store.js';

function sampleEntry(overrides?: Partial<ManifestEntry>): ManifestEntry {
  return {
    meetingId: '00000000-0000-0000-0000-000000000001' as never,
    source: 'mic',
    chunkIndex: 0,
    filePath: '/chunks/mic-0.webm',
    sha256: 'a'.repeat(64) as never,
    byteLength: 1024,
    wallClockStart: '2026-07-24T10:00:00.000Z',
    wallClockEnd: '2026-07-24T10:00:10.000Z',
    monotonicStart: 1000,
    monotonicEnd: 11000,
    sampleRate: 48000 as const,
    channels: 1 as const,
    codec: 'opus' as const,
    container: 'webm' as const,
    durationMs: 10000 as never,
    uploadStatus: 'pending' as const,
    version: 1,
    ...overrides,
  };
}

describe('RecoveryInbox', () => {
  let db: SqliteConnection;
  let store: ManifestStore;
  let fs: FakeFileSystem;
  let inbox: RecoveryInbox;

  beforeEach(async () => {
    db = await createSqlJsConnection();
    store = new ManifestStore(db);
    fs = new FakeFileSystem();
    inbox = new RecoveryInbox(store, fs);
    await store.runMigrations();
  });

  afterEach(() => {
    db.close();
  });

  it('discovers no sessions when manifest is clean', async () => {
    const sessions = await inbox.discover();
    expect(sessions).toEqual([]);
  });

  it('discovers incomplete sessions with uncompleted entries', async () => {
    await fs.mkdir('/chunks');
    await fs.atomicWrite('/chunks/mic-0.webm', new Uint8Array(1024));
    await fs.atomicWrite('/chunks/mic-1.webm', new Uint8Array(1024));

    await store.appendEntry(sampleEntry({ chunkIndex: 0, uploadStatus: 'completed' }));
    await store.appendEntry(sampleEntry({ chunkIndex: 1, uploadStatus: 'pending' }));

    const sessions = await inbox.discover();
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]!.acknowledgedChunks).toBe(2); // both have files
    expect(sessions[0]!.totalChunks).toBe(2);
  });

  it('generates Continue and Finalize actions for incomplete session with files present', async () => {
    await fs.mkdir('/chunks');
    await fs.atomicWrite('/chunks/mic-0.webm', new Uint8Array(1024));

    await store.appendEntry(sampleEntry({ chunkIndex: 0, uploadStatus: 'pending' }));

    const sessions = await inbox.discover();
    expect(sessions.length).toBeGreaterThan(0);
    const actions = inbox.getActions(sessions[0]!);

    const actionTypes = actions.map((a) => a.type);
    expect(actionTypes).toContain('Continue');
    expect(actionTypes).toContain('Finalize');
  });

  it('Delete action requires destruction confirmation', async () => {
    await fs.mkdir('/chunks');
    // File doesn't exist → orphan
    await store.appendEntry(sampleEntry({ chunkIndex: 0, filePath: '/chunks/missing.webm' }));

    const sessions = await inbox.discover();
    const actions = inbox.getActions(sessions[0]!);
    const deleteAction = actions.find((a) => a.type === 'Delete');

    expect(deleteAction).toBeTruthy();
    expect(deleteAction!.destructive).toBe(true);
    expect(deleteAction!.requiresConfirmation).toBe(true);
  });

  it('Delete action fails without confirmation', async () => {
    await store.appendEntry(sampleEntry({ chunkIndex: 0, filePath: '/chunks/orphan.webm' }));

    const sessions = await inbox.discover();
    const actions = inbox.getActions(sessions[0]!);
    const deleteAction = actions.find((a) => a.type === 'Delete')!;

    const result = await inbox.executeAction(deleteAction, false);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Delete requires explicit confirmation (confirmed=true)');
  });

  it('Continue action marks failed entries back to pending', async () => {
    await fs.mkdir('/chunks');
    await fs.atomicWrite('/chunks/mic-0.webm', new Uint8Array(1024));

    await store.appendEntry(sampleEntry({ chunkIndex: 0, uploadStatus: 'failed' }));

    const sessions = await inbox.discover();
    const continueAction = inbox.getActions(sessions[0]!).find((a) => a.type === 'Continue')!;

    const result = await inbox.executeAction(continueAction);
    expect(result.success).toBe(true);
    expect(result.modifiedChunks).toBe(1);

    const updated = await store.getEntry('00000000-0000-0000-0000-000000000001' as never, 'mic', 0);
    expect(updated!.uploadStatus).toBe('pending');
  });

  it('Finalize action marks pending entries as completed', async () => {
    await fs.mkdir('/chunks');
    await fs.atomicWrite('/chunks/mic-0.webm', new Uint8Array(1024));
    await fs.atomicWrite('/chunks/mic-1.webm', new Uint8Array(1024));

    await store.appendEntry(sampleEntry({ chunkIndex: 0, uploadStatus: 'pending' }));
    await store.appendEntry(sampleEntry({ chunkIndex: 1, uploadStatus: 'uploading' }));

    const sessions = await inbox.discover();
    const finalizeAction = inbox.getActions(sessions[0]!).find((a) => a.type === 'Finalize')!;

    const result = await inbox.executeAction(finalizeAction);
    expect(result.success).toBe(true);
    expect(result.modifiedChunks).toBe(2);
  });
});
