import type { MeetingId, AudioSource } from '@kms/domain';
import type { ManifestStore } from '../manifest/store.js';
import type { FileSystem } from '../contracts/filesystem.js';
import { RecoveryError } from '../contracts/errors.js';
import {
  createContinueAction,
  createFinalizeAction,
  createDeleteAction,
  type RecoveryAction,
  type ActionResult,
} from './actions.js';

// ── Types ──

export interface IncompleteSession {
  readonly meetingId: MeetingId;
  readonly source: AudioSource;
  readonly totalChunks: number;
  readonly acknowledgedChunks: number;
  readonly unacknowledgedChunks: number;
  readonly orphanFiles: string[];
  readonly hasMissingFiles: boolean;
  readonly hasServerConflict: boolean;
  readonly lastActivityAt: string;
}

// ── RecoveryInbox ──

export class RecoveryInbox {
  constructor(
    private readonly manifestStore: ManifestStore,
    private readonly fs: FileSystem,
  ) {}

  /** Discover all incomplete sessions from the manifest. */
  async discover(): Promise<IncompleteSession[]> {
    const meetings = await this.manifestStore.listMeetings();
    const sessions: IncompleteSession[] = [];

    for (const meetingId of meetings) {
      const sources = new Set<AudioSource>(['mic', 'system']);
      for (const source of sources) {
        const entries = await this.manifestStore.listEntries(meetingId, source);
        if (entries.length === 0) continue;

        // Check for orphans (entries with missing files)
        const orphans = await this.manifestStore.listOrphans(this.fs);
        const meetingOrphans = orphans.filter(
          (o) => o.meetingId === meetingId && o.source === source,
        );
        const orphanFiles = meetingOrphans.map((o) => o.filePath);
        const hasMissingFiles = orphanFiles.length > 0;

        // Entries with files present are "acknowledged" (durably committed)
        const orphanIndices = new Set(meetingOrphans.map((o) => o.chunkIndex));
        const acknowledged = entries.filter((e) => !orphanIndices.has(e.chunkIndex));
        const unacknowledged = meetingOrphans;

        const hasServerConflict = entries.some((e) => e.uploadStatus === 'failed');

        const lastActivity = entries.reduce((latest, e) => {
          if (!latest) return e.wallClockEnd;
          return e.wallClockEnd > latest ? e.wallClockEnd : latest;
        }, '' as string);

        // A session is "incomplete" if any entry is not fully uploaded or has missing files
        const anyIncompleteUpload = entries.some((e) => e.uploadStatus !== 'completed');
        const isIncomplete = anyIncompleteUpload || hasMissingFiles;

        if (isIncomplete) {
          sessions.push({
            meetingId,
            source,
            totalChunks: entries.length,
            acknowledgedChunks: acknowledged.length,
            unacknowledgedChunks: unacknowledged.length,
            orphanFiles,
            hasMissingFiles,
            hasServerConflict,
            lastActivityAt: lastActivity,
          });
        }
      }
    }

    return sessions;
  }

  /** Get safe recovery actions for a session. */
  getActions(session: IncompleteSession): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    // Always offer Continue if there are acknowledged chunks
    if (session.acknowledgedChunks > 0) {
      actions.push(
        createContinueAction(session.meetingId, session.source, session.acknowledgedChunks),
      );
    }

    // Offer Finalize if there's enough data
    if (session.totalChunks > 0) {
      actions.push(createFinalizeAction(session.meetingId, session.source, session.totalChunks));
    }

    // Offer Delete if there are orphan files or unacknowledged chunks
    if (session.hasMissingFiles || session.unacknowledgedChunks > 0) {
      actions.push(
        createDeleteAction(
          session.meetingId,
          session.source,
          session.orphanFiles.length + session.unacknowledgedChunks,
        ),
      );
    }

    return actions;
  }

  /** Execute one recovery action. */
  async executeAction(action: RecoveryAction, confirmed?: boolean): Promise<ActionResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let modifiedChunks = 0;

    // Destructive actions require explicit confirmation
    if (action.destructive && !confirmed) {
      return {
        success: false,
        action: action.type,
        sessionId: action.sessionId,
        errors: ['Delete requires explicit confirmation (confirmed=true)'],
        warnings,
        modifiedChunks: 0,
      };
    }

    try {
      switch (action.type) {
        case 'Continue': {
          // Continue: no destructive change needed. Acknowledge the session recovery.
          const entries = await this.manifestStore.listEntries(action.meetingId, action.source);
          // Mark any failed entries back to pending for retry
          for (const entry of entries) {
            if (entry.uploadStatus === 'failed') {
              await this.manifestStore.updateUploadStatus(
                action.meetingId,
                action.source,
                entry.chunkIndex,
                'pending',
              );
              modifiedChunks++;
            }
          }
          break;
        }

        case 'Finalize': {
          // Finalize: mark all pending entries as completed
          const entries = await this.manifestStore.listEntries(action.meetingId, action.source);
          for (const entry of entries) {
            if (entry.uploadStatus === 'pending' || entry.uploadStatus === 'uploading') {
              await this.manifestStore.updateUploadStatus(
                action.meetingId,
                action.source,
                entry.chunkIndex,
                'completed',
              );
              modifiedChunks++;
            }
          }
          if (modifiedChunks === 0) {
            warnings.push('No pending chunks to finalize');
          }
          break;
        }

        case 'Delete': {
          // Delete: remove orphan files and their manifest entries
          const orphans = await this.manifestStore.listOrphans(this.fs);
          const sessionOrphans = orphans.filter(
            (o) => o.meetingId === action.meetingId && o.source === action.source,
          );

          for (const orphan of sessionOrphans) {
            try {
              await this.fs.delete(orphan.filePath);
            } catch (err) {
              warnings.push(
                `Failed to delete orphan file ${orphan.filePath}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
            modifiedChunks++;
          }

          // Also clean up unacknowledged entries
          const entries = await this.manifestStore.listEntries(action.meetingId, action.source);
          for (const entry of entries) {
            if (entry.uploadStatus === 'failed') {
              // Don't delete the manifest entry — just mark it
              // Actual file deletion has already been done above for orphans
              if (!sessionOrphans.some((o) => o.chunkIndex === entry.chunkIndex)) {
                warnings.push(
                  `Chunk ${entry.chunkIndex} has failed upload but file still exists; not deleting`,
                );
              }
            }
          }

          if (modifiedChunks === 0) {
            warnings.push('No orphan files to delete');
          }
          break;
        }
      }

      return {
        success: errors.length === 0,
        action: action.type,
        sessionId: action.sessionId,
        errors,
        warnings,
        modifiedChunks,
      };
    } catch (err) {
      throw new RecoveryError(
        'action_failed',
        `Recovery action ${action.type} failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      );
    }
  }
}
