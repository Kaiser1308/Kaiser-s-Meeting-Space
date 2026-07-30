import type { ChunkEvent, GapEvent, DeviceEvent, InterruptEvent } from '@kms/mobile-audio';

// ── Recorder status codes ──

export type RecorderStatusCode =
  'idle' | 'configuring' | 'recording' | 'paused' | 'stopping' | 'finalizing' | 'error';

// ── Storage warning levels ──

export type StorageWarningLevel = 'ok' | 'warning' | 'critical';

// ── Health metrics ──

export interface HealthMetrics {
  /** Total recording duration in ms (excluding paused time). */
  totalDurationMs: number;
  /** Total bytes written across all chunks. */
  totalBytesWritten: number;
  /** Available storage in bytes. */
  storageAvailableBytes: number;
  /** Percentage of storage remaining (0-100). */
  storagePercentRemaining: number;
  /** Estimated remaining recording time in minutes. */
  estimatedRemainingMinutes: number;
}

// ── Timeline event (union of P02 types) ──

export interface PauseInterval {
  type: 'pause';
  startMs: number;
  durationMs: number;
}

export interface TimelineGapMarker {
  type: 'gap';
  description: 'source_disconnect' | 'buffer_overflow' | 'crash_recovery' | 'route_change';
  startMs: number;
  endMs: number;
  durationMs: number;
}

export type TimelineEvent = PauseInterval | TimelineGapMarker;

// ── Recording state ──

export interface RecordingState {
  status: RecorderStatusCode;
  meetingId: string | null;

  // Chunk tracking
  currentChunkIndex: number;
  chunksCommitted: number;

  // Timing
  startedAt: string | null;
  totalPausedDurationMs: number;
  lastResumedAt: number | null; // monotonic
  totalDurationMs: number;

  // Timeline
  timeline: TimelineEvent[];

  // Storage
  storageAvailableBytes: number;
  storageTotalBytes: number;
  storageWarning: StorageWarningLevel;

  // Health
  health: HealthMetrics;

  // Error
  error: string | null;

  // Actions in flight (for debouncing)
  pendingAction: 'pause' | 'resume' | 'stop' | null;

  // Last correlation ID for tracking
  lastCorrelationId: string | null;
}

// ── Recording actions ──

export type RecordingAction =
  | { type: 'CONFIGURE'; meetingId: string; storageDirectory: string }
  | { type: 'CONFIGURE_OK' }
  | { type: 'CONFIGURE_ERROR'; error: string }
  | { type: 'START' }
  | { type: 'START_OK'; startedAt: string; monotonicNow: number }
  | { type: 'PAUSE' }
  | { type: 'PAUSE_OK'; pauseStart: number }
  | { type: 'PAUSE_ERROR'; error: string }
  | { type: 'RESUME' }
  | { type: 'RESUME_OK'; resumedAt: number }
  | { type: 'RESUME_ERROR'; error: string }
  | { type: 'END' }
  | { type: 'STOP_OK' }
  | { type: 'CHUNK_COMMITTED'; chunk: ChunkEvent }
  | { type: 'FINALIZE_OK' }
  | { type: 'FINALIZE_ERROR'; error: string }
  | { type: 'DEVICE_EVENT'; event: DeviceEvent }
  | { type: 'INTERRUPT'; event: InterruptEvent }
  | { type: 'STORAGE_UPDATE'; availableBytes: number; totalBytes: number }
  | { type: 'GAP_EVENT'; event: GapEvent }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'RECOVERY_TIMEOUT' }
  | { type: 'RESET' }
  | { type: 'RESTORE'; state: Partial<RecordingState> };

// ── Initial state ──

export const INITIAL_RECORDING_STATE: RecordingState = {
  status: 'idle',
  meetingId: null,
  currentChunkIndex: 0,
  chunksCommitted: 0,
  startedAt: null,
  totalPausedDurationMs: 0,
  lastResumedAt: null,
  totalDurationMs: 0,
  timeline: [],
  storageAvailableBytes: 0,
  storageTotalBytes: 0,
  storageWarning: 'ok',
  health: {
    totalDurationMs: 0,
    totalBytesWritten: 0,
    storageAvailableBytes: 0,
    storagePercentRemaining: 100,
    estimatedRemainingMinutes: 0,
  },
  error: null,
  pendingAction: null,
  lastCorrelationId: null,
};
