import type { MeetingId, AudioSource } from '@kms/domain';
import type { ManifestEntry } from '../manifest/store.js';
import type { ServerManifestEntry } from '../contracts/transport.js';

// ── Reconciliation types ──

export type ReconcileAction =
  | { type: 'upload'; chunkIndex: number; source: AudioSource; reason: string }
  | { type: 'complete'; chunkIndex: number; source: AudioSource; reason: string }
  | { type: 'skip'; chunkIndex: number; source: AudioSource; reason: string }
  | {
      type: 'conflict';
      chunkIndex: number;
      source: AudioSource;
      localHash: string;
      serverHash: string;
      reason: string;
    }
  | { type: 'missing_server'; chunkIndex: number; source: AudioSource; reason: string }
  | { type: 'stale_version'; chunkIndex: number; source: AudioSource; reason: string };

export interface ReconcileResult {
  readonly meetingId: MeetingId;
  readonly actions: ReconcileAction[];
  readonly summary: {
    readonly upload: number;
    readonly complete: number;
    readonly skip: number;
    readonly conflict: number;
    readonly missingServer: number;
    readonly staleVersion: number;
  };
}

// ── Reconciliation logic ──

/**
 * Compare local manifest with server manifest and produce deterministic actions.
 *
 * Rules (order matters):
 * 1. Local entry exists, server entry exists, same hash, server completed/finalized → skip
 * 2. Local entry exists, server entry exists, same hash, server pending → complete
 * 3. Local entry exists, server entry exists, different hash → conflict (terminal, stop retry)
 * 4. Local entry exists, server entry missing → upload
 * 5. Local entry missing, server entry exists → missing_server (gap)
 * 6. Local entry exists, version mismatch → stale_version
 */
export function reconcileLocalWithServer(
  meetingId: MeetingId,
  local: ManifestEntry[],
  server: ServerManifestEntry[],
): ReconcileResult {
  const actions: ReconcileAction[] = [];
  const summary = {
    upload: 0,
    complete: 0,
    skip: 0,
    conflict: 0,
    missingServer: 0,
    staleVersion: 0,
  };

  // Build server index by (source, chunkIndex)
  const serverByKey = new Map<string, ServerManifestEntry>();
  for (const s of server) {
    serverByKey.set(`${s.source}/${s.chunkIndex}`, s);
  }

  // Build local index
  const localByKey = new Map<string, ManifestEntry>();
  for (const l of local) {
    localByKey.set(`${l.source}/${l.chunkIndex}`, l);
  }

  // All local + server chunk keys
  const allKeys = new Set([...localByKey.keys(), ...serverByKey.keys()]);

  for (const key of allKeys) {
    const localEntry = localByKey.get(key);
    const serverEntry = serverByKey.get(key);

    if (localEntry && serverEntry) {
      // Both exist
      if (localEntry.sha256 === serverEntry.sha256) {
        if (serverEntry.uploadStatus === 'completed' || serverEntry.uploadStatus === 'finalized') {
          actions.push({
            type: 'skip',
            chunkIndex: localEntry.chunkIndex,
            source: localEntry.source,
            reason: `Already finalized on server with matching hash`,
          });
          summary.skip++;
        } else {
          actions.push({
            type: 'complete',
            chunkIndex: localEntry.chunkIndex,
            source: localEntry.source,
            reason: `Server has matching hash but not finalized; complete it`,
          });
          summary.complete++;
        }
      } else {
        // Checksum conflict — terminal
        actions.push({
          type: 'conflict',
          chunkIndex: localEntry.chunkIndex,
          source: localEntry.source,
          localHash: localEntry.sha256,
          serverHash: serverEntry.sha256,
          reason: `Checksum mismatch: local ${localEntry.sha256.slice(0, 12)}... vs server ${serverEntry.sha256.slice(0, 12)}...`,
        });
        summary.conflict++;
      }
    } else if (localEntry && !serverEntry) {
      // Local only — needs upload
      actions.push({
        type: 'upload',
        chunkIndex: localEntry.chunkIndex,
        source: localEntry.source,
        reason: `Not found on server; needs upload`,
      });
      summary.upload++;
    } else if (!localEntry && serverEntry) {
      // Server only — gap in local manifest
      actions.push({
        type: 'missing_server',
        chunkIndex: serverEntry.chunkIndex,
        source: serverEntry.source as AudioSource,
        reason: `Present on server but missing from local manifest`,
      });
      summary.missingServer++;
    }
  }

  return { meetingId, actions, summary };
}

/**
 * Validate that a reconciliation result does not contain terminal conflicts
 * for auto-uploadable chunks. Returns the list of chunks that can be safely uploaded.
 */
export function getSafeUploads(result: ReconcileResult): ReconcileAction[] {
  return result.actions.filter((a) => a.type === 'upload' || a.type === 'complete');
}

/**
 * Check if reconciliation has any terminal (blocking) conflicts.
 */
export function hasConflicts(result: ReconcileResult): boolean {
  return result.summary.conflict > 0;
}
