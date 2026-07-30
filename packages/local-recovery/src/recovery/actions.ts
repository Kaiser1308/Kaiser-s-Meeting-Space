import type { MeetingId, AudioSource } from '@kms/domain';

// ── Recovery action types ──

export type RecoveryActionType = 'Continue' | 'Finalize' | 'Delete';

export interface RecoveryAction {
  readonly type: RecoveryActionType;
  readonly sessionId: string; // `${meetingId}/${source}`
  readonly meetingId: MeetingId;
  readonly source: AudioSource;
  readonly description: string;
  readonly destructive: boolean;
  readonly requiresConfirmation: boolean;
  readonly estimatedImpact: string;
}

export interface ActionResult {
  readonly success: boolean;
  readonly action: RecoveryActionType;
  readonly sessionId: string;
  readonly errors: string[];
  readonly warnings: string[];
  readonly modifiedChunks: number;
}

// ── Action factory ──

export function createContinueAction(
  meetingId: MeetingId,
  source: AudioSource,
  chunkCount: number,
): RecoveryAction {
  return {
    type: 'Continue',
    sessionId: `${meetingId}/${source}`,
    meetingId,
    source,
    description: `Resume capture for session. ${chunkCount} acknowledged chunks preserved.`,
    destructive: false,
    requiresConfirmation: false,
    estimatedImpact: `Source will continue from chunk index ${chunkCount}`,
  };
}

export function createFinalizeAction(
  meetingId: MeetingId,
  source: AudioSource,
  chunkCount: number,
): RecoveryAction {
  return {
    type: 'Finalize',
    sessionId: `${meetingId}/${source}`,
    meetingId,
    source,
    description: `Mark session as finalized. ${chunkCount} chunks will be preserved.`,
    destructive: false,
    requiresConfirmation: true,
    estimatedImpact: `Session state will be set to finalized; upload queue will be processed`,
  };
}

export function createDeleteAction(
  meetingId: MeetingId,
  source: AudioSource,
  orphanCount: number,
): RecoveryAction {
  return {
    type: 'Delete',
    sessionId: `${meetingId}/${source}`,
    meetingId,
    source,
    description: `Delete ${orphanCount} unrecoverable chunks and manifest entries. THIS CANNOT BE UNDONE.`,
    destructive: true,
    requiresConfirmation: true,
    estimatedImpact: `${orphanCount} chunk files and manifest entries will be permanently deleted`,
  };
}
