import type { UploadTransport } from '@kms/local-recovery';
import type { ManifestStore } from '@kms/local-recovery';
import { reconcileLocalWithServer } from '@kms/local-recovery';
import type { RecordingService } from '../../recording/service/recording-service';
import { UploadTransportError } from '@kms/local-recovery';
import type { MeetingId } from '@kms/domain';

export type EndState = 'idle' | 'requesting' | 'accepted' | 'pending' | 'unavailable' | 'error';

export interface EndResult {
  meetingId: string;
  state: EndState;
  serverState: string | null;
  finalizedAt: string | null;
  unreconciledChunks: number;
}

/**
 * Handles the End meeting flow:
 * 1. Ensure local manifest is closed (RecordingService.end())
 * 2. Reconcile local manifest with server manifest
 * 3. Issue idempotent server End request
 * 4. Expose truthful state (accepted/pending/unavailable)
 */
export class EndRequestor {
  constructor(
    private readonly transport: UploadTransport,
    private readonly manifestStore: ManifestStore,
    private readonly recordingService: RecordingService,
  ) {}

  async requestEnd(meetingId: string): Promise<EndResult> {
    const mid = meetingId as MeetingId;

    // Step 1: Ensure recording is stopped locally
    const recordingState = this.recordingService.getState();
    if (recordingState.status === 'recording' || recordingState.status === 'paused') {
      await this.recordingService.end();
    }

    // Step 2: Reconcile local manifest with server
    let unreconciled = 0;
    try {
      const serverManifest = await this.transport.getServerManifest(meetingId);
      const localEntries = await this.manifestStore.listEntries(mid);
      const reconcileResult = reconcileLocalWithServer(mid, localEntries, serverManifest);
      unreconciled = reconcileResult.actions.filter((a) => a.type !== 'skip').length;
    } catch (err) {
      if (err instanceof UploadTransportError && err.category === 'NETWORK') {
        // Server unreachable — still allow local end
      }
    }

    // Step 3: Issue idempotent End request
    try {
      const result = await this.transport.endMeeting(meetingId);
      return {
        meetingId,
        state:
          result.state === 'finalizing' || result.state === 'processing' || result.state === 'ready'
            ? 'accepted'
            : 'pending',
        serverState: result.state,
        finalizedAt: result.finalizedAt,
        unreconciledChunks: unreconciled,
      };
    } catch (err) {
      if (err instanceof UploadTransportError) {
        if (err.category === 'NETWORK' || err.category === 'AUTH_EXPIRED') {
          // Server unreachable — end is pending
          return {
            meetingId,
            state: 'pending',
            serverState: null,
            finalizedAt: new Date().toISOString(),
            unreconciledChunks: unreconciled,
          };
        }
        return {
          meetingId,
          state: 'error',
          serverState: null,
          finalizedAt: null,
          unreconciledChunks: unreconciled,
        };
      }

      // Unknown error → unavailable
      return {
        meetingId,
        state: 'unavailable',
        serverState: null,
        finalizedAt: null,
        unreconciledChunks: unreconciled,
      };
    }
  }
}
