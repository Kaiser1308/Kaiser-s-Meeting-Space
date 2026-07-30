import type { RecordingState, RecordingAction } from './types';
import { INITIAL_RECORDING_STATE } from './types';

/**
 * Pure recording state machine reducer.
 *
 * Invariants:
 * - Pause/Resume/End are only valid from 'recording' or 'paused' (for resume).
 * - CONFIGURE is only valid from 'idle'.
 * - CHUNK_COMMITTED is only valid from 'recording', 'paused', or 'stopping'.
 * - FINALIZE_OK transitions to 'idle'.
 * - All invalid transitions are silently rejected (state unchanged).
 */
export function recordingReducer(state: RecordingState, action: RecordingAction): RecordingState {
  switch (action.type) {
    // ── Configure ──
    case 'CONFIGURE': {
      if (state.status !== 'idle') return state;
      return {
        ...state,
        status: 'configuring',
        meetingId: action.meetingId,
        storageAvailableBytes: 0,
      };
    }

    case 'CONFIGURE_OK': {
      if (state.status !== 'configuring') return state;
      return { ...state, status: 'idle' }; // Ready for start
    }

    case 'CONFIGURE_ERROR': {
      if (state.status !== 'configuring') return state;
      return { ...state, status: 'error', error: action.error };
    }

    // ── Start ──
    case 'START': {
      if (state.status !== 'idle' && state.status !== 'error') return state;
      return { ...state, status: 'recording', error: null, pendingAction: null };
    }

    case 'START_OK': {
      if (state.status !== 'recording' && state.status !== 'idle') return state;
      return {
        ...state,
        status: 'recording',
        startedAt: action.startedAt,
        lastResumedAt: action.monotonicNow,
        currentChunkIndex: 0,
        chunksCommitted: 0,
        totalDurationMs: 0,
        totalPausedDurationMs: 0,
        timeline: [],
        error: null,
      };
    }

    // ── Pause ──
    case 'PAUSE': {
      if (state.status !== 'recording') return state;
      return { ...state, pendingAction: 'pause' };
    }

    case 'PAUSE_OK': {
      if (state.status !== 'recording') return state;
      const pauseDuration = action.pauseStart - (state.lastResumedAt ?? 0);
      return {
        ...state,
        status: 'paused',
        pendingAction: null,
        totalPausedDurationMs: state.totalPausedDurationMs + Math.max(0, pauseDuration),
        timeline: [
          ...state.timeline,
          {
            type: 'pause' as const,
            startMs: state.totalDurationMs,
            durationMs: Math.max(0, pauseDuration),
          },
        ],
      };
    }

    case 'PAUSE_ERROR': {
      return { ...state, pendingAction: null, error: action.error };
    }

    // ── Resume ──
    case 'RESUME': {
      if (state.status !== 'paused') return state;
      return { ...state, pendingAction: 'resume' };
    }

    case 'RESUME_OK': {
      if (state.status !== 'paused') return state;
      return {
        ...state,
        status: 'recording',
        pendingAction: null,
        lastResumedAt: action.resumedAt,
      };
    }

    case 'RESUME_ERROR': {
      return { ...state, pendingAction: null, error: action.error };
    }

    // ── End/Stop ──
    case 'END': {
      if (state.status !== 'recording' && state.status !== 'paused') return state;
      return { ...state, status: 'stopping', pendingAction: 'stop' };
    }

    case 'STOP_OK': {
      if (state.status !== 'stopping') return state;
      return { ...state, pendingAction: null };
    }

    case 'CHUNK_COMMITTED': {
      if (
        state.status !== 'recording' &&
        state.status !== 'paused' &&
        state.status !== 'stopping'
      ) {
        return state;
      }
      const duration = state.totalDurationMs + action.chunk.durationMs;
      const next: RecordingState = {
        ...state,
        chunksCommitted: state.chunksCommitted + 1,
        currentChunkIndex: state.chunksCommitted + 1,
        totalDurationMs: duration,
        health: {
          ...state.health,
          totalDurationMs: duration,
          totalBytesWritten: state.health.totalBytesWritten + action.chunk.byteLength,
        },
      };

      // During stopping, the first chunk committed after stop is the final chunk → finalizing
      if (state.status === 'stopping') {
        next.status = 'finalizing';
        next.pendingAction = null;
      }

      return next;
    }

    case 'FINALIZE_OK': {
      if (state.status !== 'finalizing') return state;
      return {
        ...state,
        status: 'idle',
        pendingAction: null,
      };
    }

    case 'FINALIZE_ERROR': {
      if (state.status !== 'finalizing') return state;
      return { ...state, status: 'finalizing', error: action.error, pendingAction: null };
    }

    // ── Events ──
    case 'DEVICE_EVENT': {
      // Allow in any non-idle state
      if (state.status === 'idle') return state;
      return state; // Device events are informational; don't change state
    }

    case 'INTERRUPT': {
      if (state.status !== 'recording') return state;
      // Interrupt always pauses recording
      return {
        ...state,
        status: 'paused',
        pendingAction: null,
        timeline: [
          ...state.timeline,
          {
            type: 'gap' as const,
            description: 'source_disconnect' as const,
            startMs: state.totalDurationMs,
            endMs: state.totalDurationMs,
            durationMs: 0,
          },
        ],
      };
    }

    case 'STORAGE_UPDATE': {
      const pct =
        action.totalBytes > 0 ? Math.round((action.availableBytes / action.totalBytes) * 100) : 100;
      let warning: RecordingState['storageWarning'] = 'ok';
      if (pct <= 5) warning = 'critical';
      else if (pct <= 10) warning = 'warning';

      // Estimate remaining time: assume 96kbps / 8 = 12KB/s ≈ 720KB/min
      const bytesPerMinute = 720_000;
      const estimatedMinutes = Math.floor(action.availableBytes / bytesPerMinute);

      return {
        ...state,
        storageAvailableBytes: action.availableBytes,
        storageTotalBytes: action.totalBytes,
        storageWarning: warning,
        health: {
          ...state.health,
          storageAvailableBytes: action.availableBytes,
          storagePercentRemaining: pct,
          estimatedRemainingMinutes: estimatedMinutes,
        },
      };
    }

    case 'GAP_EVENT': {
      if (state.status === 'idle') return state;
      return {
        ...state,
        timeline: [
          ...state.timeline,
          {
            type: 'gap' as const,
            description: eventToGapDescription(action.event.reason),
            startMs: action.event.startMs,
            endMs: action.event.endMs,
            durationMs: action.event.durationMs,
          },
        ],
      };
    }

    // ── Error / Recovery ──
    case 'ERROR': {
      return { ...state, error: action.message };
    }

    case 'RECOVERY_TIMEOUT': {
      if (state.status !== 'stopping') return state;
      return {
        ...state,
        status: 'finalizing',
        pendingAction: null,
        error: 'Stop timeout; chunk may be incomplete.',
      };
    }

    // ── Reset ──
    case 'RESET': {
      return INITIAL_RECORDING_STATE;
    }

    case 'RESTORE': {
      return {
        ...INITIAL_RECORDING_STATE,
        ...action.state,
        status: 'idle', // Always start idle after restore
        pendingAction: null,
        error: null,
      };
    }

    default:
      return state;
  }
}

function eventToGapDescription(reason: string): TimelineGapMarker['description'] {
  switch (reason) {
    case 'buffer_overflow':
      return 'buffer_overflow';
    case 'source_disconnect':
      return 'source_disconnect';
    case 'crash_recovery':
      return 'crash_recovery';
    case 'route_change':
      return 'route_change';
    default:
      return 'buffer_overflow';
  }
}

// Re-export for convenience
import type { TimelineGapMarker } from './types';
