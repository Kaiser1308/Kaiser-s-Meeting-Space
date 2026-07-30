import { describe, it, expect } from 'vitest';
import {
  reconcileLocalWithServer,
  getSafeUploads,
  hasConflicts,
} from '../../src/upload/reconcile.js';
import type { ManifestEntry } from '../../src/manifest/store.js';
import type { ServerManifestEntry } from '../../src/contracts/transport.js';

function localEntry(overrides?: Partial<ManifestEntry>): ManifestEntry {
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

function serverEntry(overrides?: Partial<ServerManifestEntry>): ServerManifestEntry {
  return {
    chunkIndex: 0,
    source: 'mic',
    sha256: 'a'.repeat(64),
    byteLength: 1024,
    storageKey: 'audio/test/mic-0.webm',
    uploadStatus: 'pending',
    ...overrides,
  };
}

describe('reconcileLocalWithServer', () => {
  it('skips already-finalized server entries with matching hash', () => {
    const local = [localEntry({ chunkIndex: 0 })];
    const server = [serverEntry({ chunkIndex: 0, uploadStatus: 'completed' })];

    const result = reconcileLocalWithServer(
      '00000000-0000-0000-0000-000000000001' as never,
      local,
      server,
    );
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.type).toBe('skip');
  });

  it('produces complete action when server has pending matching hash', () => {
    const local = [localEntry({ chunkIndex: 0 })];
    const server = [serverEntry({ chunkIndex: 0, uploadStatus: 'pending' })];

    const result = reconcileLocalWithServer(
      '00000000-0000-0000-0000-000000000001' as never,
      local,
      server,
    );
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.type).toBe('complete');
  });

  it('detects checksum conflict', () => {
    const local = [localEntry({ chunkIndex: 0, sha256: 'a'.repeat(64) as never })];
    const server = [serverEntry({ chunkIndex: 0, sha256: 'b'.repeat(64) })];

    const result = reconcileLocalWithServer(
      '00000000-0000-0000-0000-000000000001' as never,
      local,
      server,
    );
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.type).toBe('conflict');
  });

  it('produces upload action for local-only entries', () => {
    const local = [localEntry({ chunkIndex: 0 })];
    const server: ServerManifestEntry[] = [];

    const result = reconcileLocalWithServer(
      '00000000-0000-0000-0000-000000000001' as never,
      local,
      server,
    );
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.type).toBe('upload');
  });

  it('detects server-only entries (missing from local)', () => {
    const local: ManifestEntry[] = [];
    const server = [serverEntry({ chunkIndex: 0 })];

    const result = reconcileLocalWithServer(
      '00000000-0000-0000-0000-000000000001' as never,
      local,
      server,
    );
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.type).toBe('missing_server');
  });

  it('handles mixed scenarios correctly', () => {
    const local = [
      localEntry({ chunkIndex: 0, sha256: 'a'.repeat(64) as never }),
      localEntry({ chunkIndex: 1, sha256: 'b'.repeat(64) as never }),
      localEntry({ chunkIndex: 2, sha256: 'c'.repeat(64) as never }),
    ];
    const server = [
      serverEntry({ chunkIndex: 0, sha256: 'a'.repeat(64), uploadStatus: 'completed' }), // skip
      serverEntry({ chunkIndex: 1, sha256: 'x'.repeat(64) }), // conflict
      // chunkIndex 2 missing from server → upload
      serverEntry({ chunkIndex: 3, sha256: 'd'.repeat(64) }), // server-only
    ];

    const result = reconcileLocalWithServer(
      '00000000-0000-0000-0000-000000000001' as never,
      local,
      server,
    );

    expect(result.summary.skip).toBe(1);
    expect(result.summary.conflict).toBe(1);
    expect(result.summary.upload).toBe(1);
    expect(result.summary.missingServer).toBe(1);
    expect(result.actions).toHaveLength(4);
  });

  it('getSafeUploads returns only upload and complete actions', () => {
    const local = [
      localEntry({ chunkIndex: 0 }),
      localEntry({ chunkIndex: 1, sha256: 'b'.repeat(64) as never }),
    ];
    const server = [
      serverEntry({ chunkIndex: 0, uploadStatus: 'pending' }),
      serverEntry({ chunkIndex: 1, sha256: 'x'.repeat(64) }),
    ];

    const result = reconcileLocalWithServer(
      '00000000-0000-0000-0000-000000000001' as never,
      local,
      server,
    );
    const safe = getSafeUploads(result);
    expect(safe).toHaveLength(1); // only the complete action
    expect(safe[0]!.type).toBe('complete');
  });

  it('hasConflicts returns true when checksum mismatch detected', () => {
    const local = [localEntry({ sha256: 'a'.repeat(64) as never })];
    const server = [serverEntry({ sha256: 'b'.repeat(64) })];

    const result = reconcileLocalWithServer(
      '00000000-0000-0000-0000-000000000001' as never,
      local,
      server,
    );
    expect(hasConflicts(result)).toBe(true);
  });

  it('hasConflicts returns false when no conflicts', () => {
    const local = [localEntry()];
    const server: ServerManifestEntry[] = [];

    const result = reconcileLocalWithServer(
      '00000000-0000-0000-0000-000000000001' as never,
      local,
      server,
    );
    expect(hasConflicts(result)).toBe(false);
  });
});
