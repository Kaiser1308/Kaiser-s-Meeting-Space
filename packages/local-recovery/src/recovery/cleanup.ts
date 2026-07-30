import type { MeetingId, AudioSource } from '@kms/domain';
import type { ManifestStore } from '../manifest/store.js';
import type { FileSystem } from '../contracts/filesystem.js';
import { CleanupError } from '../contracts/errors.js';

// ── Types ──

export type CleanupDecisionReason =
  | 'ok'
  | 'active_session'
  | 'recovery_required'
  | 'unverified_hash'
  | 'retention_active'
  | 'pinned'
  | 'conflicted'
  | 'upload_incomplete'
  | 'already_cleaned';

export interface CleanupDecision {
  readonly meetingId: MeetingId;
  readonly source: AudioSource;
  readonly eligible: boolean;
  readonly reason: CleanupDecisionReason;
  readonly detail: string;
}

export interface SourceState {
  readonly meetingId: MeetingId;
  readonly source: AudioSource;
  readonly isActive: boolean;
  readonly isRecoveryRequired: boolean;
  readonly allChunksVerified: boolean;
  readonly allChunksUploaded: boolean;
  readonly allChunksFinalized: boolean;
  readonly anyServerConflict: boolean;
  readonly lastActivityAt: string;
  readonly isPinned: boolean;
}

export interface CleanupContext {
  readonly now: string;
  readonly retentionDurationMs: number;
  readonly serverVerifiedThreshold: boolean;
}

export const DEFAULT_CLEANUP_CONTEXT: CleanupContext = {
  now: new Date().toISOString(),
  retentionDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  serverVerifiedThreshold: true,
};

// ── CleanupPolicy ──

export class CleanupPolicy {
  /**
   * Pure predicate: is this source eligible for cleanup under the given context?
   */
  isEligible(source: SourceState, ctx: CleanupContext): CleanupDecision {
    // 1. Active session — never eligible
    if (source.isActive) {
      return {
        meetingId: source.meetingId,
        source: source.source,
        eligible: false,
        reason: 'active_session',
        detail: 'Source is currently being captured',
      };
    }

    // 2. Recovery required — never eligible
    if (source.isRecoveryRequired) {
      return {
        meetingId: source.meetingId,
        source: source.source,
        eligible: false,
        reason: 'recovery_required',
        detail: 'Source has unacknowledged chunks requiring recovery',
      };
    }

    // 3. Unverified hash — never eligible
    if (!source.allChunksVerified) {
      return {
        meetingId: source.meetingId,
        source: source.source,
        eligible: false,
        reason: 'unverified_hash',
        detail: 'Not all chunks have server-verified hashes',
      };
    }

    // 4. Upload incomplete — never eligible
    if (!source.allChunksUploaded) {
      return {
        meetingId: source.meetingId,
        source: source.source,
        eligible: false,
        reason: 'upload_incomplete',
        detail: 'Not all chunks have been uploaded',
      };
    }

    // 5. Server conflict — never eligible
    if (source.anyServerConflict) {
      return {
        meetingId: source.meetingId,
        source: source.source,
        eligible: false,
        reason: 'conflicted',
        detail: 'Server reported checksum conflict; requires user resolution',
      };
    }

    // 6. Pinned — never eligible
    if (source.isPinned) {
      return {
        meetingId: source.meetingId,
        source: source.source,
        eligible: false,
        reason: 'pinned',
        detail: 'Source has been pinned by user',
      };
    }

    // 7. Retention period active — never eligible
    const lastActivity = new Date(source.lastActivityAt).getTime();
    const now = new Date(ctx.now).getTime();
    if (now - lastActivity < ctx.retentionDurationMs) {
      return {
        meetingId: source.meetingId,
        source: source.source,
        eligible: false,
        reason: 'retention_active',
        detail: `Retention period active until ${new Date(lastActivity + ctx.retentionDurationMs).toISOString()}`,
      };
    }

    // 8. All checks passed — eligible
    return {
      meetingId: source.meetingId,
      source: source.source,
      eligible: true,
      reason: 'ok',
      detail: 'Source meets all cleanup eligibility criteria',
    };
  }

  /** Dry run against multiple sources. Never modifies state. */
  dryRun(sources: SourceState[], ctx: CleanupContext): CleanupDecision[] {
    return sources.map((s) => this.isEligible(s, ctx));
  }
}

// ── CleanupExecutor ──

export class CleanupExecutor {
  constructor(
    private readonly manifestStore: ManifestStore,
    private readonly fs: FileSystem,
    private readonly policy: CleanupPolicy,
  ) {}

  /**
   * Delete all local chunk files and their manifest entries for an eligible source.
   * Throws CleanupError if the source is not eligible.
   */
  async execute(source: SourceState, ctx: CleanupContext): Promise<CleanupDecision> {
    // Check eligibility first
    const decision = this.policy.isEligible(source, ctx);
    if (!decision.eligible) {
      throw new CleanupError(
        'not_eligible',
        `Cannot clean up source: ${decision.reason} — ${decision.detail}`,
      );
    }

    try {
      // Delete chunk files
      const entries = await this.manifestStore.listEntries(source.meetingId, source.source);
      for (const entry of entries) {
        if (await this.fs.exists(entry.filePath)) {
          await this.fs.delete(entry.filePath);
        }
      }

      return decision;
    } catch (err) {
      throw new CleanupError(
        'cleanup_failed',
        `Cleanup execution failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      );
    }
  }
}
