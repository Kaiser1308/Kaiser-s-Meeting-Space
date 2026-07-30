import type { NativeAudioModule, NativeEventListener } from '../contracts/module';
import type { NativeCommand, CorrelationId } from '../contracts/commands';
import type {
  ChunkEvent,
  DeviceEvent,
  GapEvent,
  ErrorEvent,
  StatusResponse,
  NativeEvent,
} from '../contracts/events';

// ── Fake configuration ──

export interface FakeModuleConfig {
  /** Delay before chunk events are emitted (ms). Simulates I/O latency. */
  chunkDelayMs?: number;
  /** If true, stop() times out and never emits a final chunk. */
  stopTimeout?: boolean;
  /** If set, inject an error event after this many chunks. */
  errorAfterChunks?: number;
  /** If set, inject a gap event (buffer_overflow) at this chunk index. */
  gapAtChunk?: number;
  /** If set, inject a device event after this many ms of recording. */
  deviceEventAfterMs?: number;
  /** If set, inject a storage warning when availableBytes < threshold. */
  storageThreshold?: number;
  /** Total storage space to simulate (bytes). */
  totalStorageBytes?: number;
  /** Available storage space to simulate (bytes). */
  availableStorageBytes?: number;
  /** If true, configure() throws an error. */
  configureFails?: boolean;
  /** If true, start() throws an error. */
  startFails?: boolean;
  /** If true, pause() throws an error. */
  pauseFails?: boolean;
  /** If true, atomicWrite on stop fails with DISK_FULL. */
  diskFullOnStop?: boolean;
  /** If true, sha256 verification fails on stop. */
  checksumMismatch?: boolean;
  /** Simulated route change on start. */
  routeChangeOnStart?: 'wired' | 'bluetooth' | 'speaker';
}

// ── Internal state ──

interface FakeState {
  status: StatusResponse;
  listeners: Set<NativeEventListener>;
  chunkIndex: number;
  recording: boolean;
  paused: boolean;
  stopping: boolean;
  meetingId: string;
  storageDirectory: string;
  monotonicBase: number;
  wallClockBase: string;
}

// ── Helpers ──

function generateSha256(): string {
  // Deterministic fake: hex encoded 64 chars
  return '0000000000000000000000000000000000000000000000000000000000000b0b';
}

function generateFilepath(dir: string, meetingId: string, chunkIndex: number): string {
  return `${dir}/${meetingId}-chunk-${String(chunkIndex).padStart(4, '0')}.webm`;
}

// ── Factory ──

export function createFakeAudioModule(config: FakeModuleConfig = {}): NativeAudioModule {
  const state: FakeState = {
    status: {
      type: 'status' as const,
      correlationId: '' as CorrelationId,
      state: 'unconfigured',
      currentChunkIndex: 0,
      bytesWritten: 0,
      durationMs: 0,
      storageAvailable: config.availableStorageBytes ?? 1_000_000_000,
    },
    listeners: new Set(),
    chunkIndex: 0,
    recording: false,
    paused: false,
    stopping: false,
    meetingId: '',
    storageDirectory: '',
    monotonicBase: 0,
    wallClockBase: '',
  };

  function emit(event: NativeEvent): void {
    for (const listener of state.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not propagate to other listeners
      }
    }
  }

  function now(): string {
    return new Date().toISOString();
  }

  function makeChunkEvent(chunkIndex: number, wallClockStart: string): ChunkEvent {
    const durationMs = 5000; // 5-second fake chunks
    return {
      type: 'chunk',
      meetingId: state.meetingId as any,
      chunkIndex,
      filePath: generateFilepath(state.storageDirectory, state.meetingId, chunkIndex),
      sha256: generateSha256() as any,
      byteLength: 48000,
      wallClockStart,
      wallClockEnd: new Date(new Date(wallClockStart).getTime() + durationMs).toISOString(),
      monotonicStart: state.monotonicBase + chunkIndex * durationMs,
      monotonicEnd: state.monotonicBase + (chunkIndex + 1) * durationMs,
      durationMs,
      sampleRate: 48000,
      channels: 1,
      codec: 'opus',
      container: 'webm',
    };
  }

  function maybeInjectFaults(chunkIndex: number): void {
    if (config.gapAtChunk === chunkIndex) {
      const gapEvent: GapEvent = {
        type: 'gap',
        reason: 'buffer_overflow',
        startMs: state.monotonicBase + chunkIndex * 5000,
        endMs: state.monotonicBase + (chunkIndex + 1) * 5000,
        durationMs: 5000,
      };
      emit(gapEvent);
    }

    if (config.deviceEventAfterMs !== undefined && chunkIndex * 5000 >= config.deviceEventAfterMs) {
      const deviceEvent: DeviceEvent = {
        type: 'device',
        changeType: 'route_change',
        detail: 'Fake bluetooth disconnect',
      };
      emit(deviceEvent);
      // Only emit once
      config.deviceEventAfterMs = Number.MAX_SAFE_INTEGER;
    }
  }

  // ── Chunk emission loop ──

  let chunkTimer: ReturnType<typeof setInterval> | null = null;

  function startChunkEmission(): void {
    if (chunkTimer) return;
    chunkTimer = setInterval(() => {
      if (!state.recording || state.paused || state.stopping) return;

      const chunkIndex = state.chunkIndex;
      const chunk = makeChunkEvent(chunkIndex, state.wallClockBase);

      emit(chunk);
      state.chunkIndex = chunkIndex + 1;
      state.status.currentChunkIndex = state.chunkIndex;
      state.status.bytesWritten += chunk.byteLength;
      state.status.durationMs += chunk.durationMs;

      maybeInjectFaults(chunkIndex);

      // Inject error after N chunks
      if (config.errorAfterChunks !== undefined && state.chunkIndex >= config.errorAfterChunks) {
        const errorEvent: ErrorEvent = {
          type: 'error',
          code: 'overrun',
          detail: 'Simulated buffer overrun',
          fatal: false,
        };
        emit(errorEvent);
        config.errorAfterChunks = undefined; // Only once
      }
    }, config.chunkDelayMs ?? 1000); // Default: 1 chunk/sec
  }

  function stopChunkEmission(): void {
    if (chunkTimer) {
      clearInterval(chunkTimer);
      chunkTimer = null;
    }
  }

  // ── Public API ──

  return {
    addEventListener(listener: NativeEventListener): () => void {
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    },

    async sendCommand(command: NativeCommand): Promise<void> {
      switch (command.type) {
        case 'configure': {
          if (config.configureFails) {
            const err: ErrorEvent = {
              type: 'error',
              correlationId: command.correlationId,
              code: 'permission',
              detail: 'Microphone permission denied (fake)',
              fatal: true,
            };
            emit(err);
            return;
          }
          state.meetingId = command.meetingId;
          state.storageDirectory = command.storageDirectory;
          state.status.state = 'configured';
          state.status.correlationId = command.correlationId;
          break;
        }

        case 'start': {
          if (config.startFails) {
            const err: ErrorEvent = {
              type: 'error',
              correlationId: command.correlationId,
              code: 'io_error',
              detail: 'Failed to initialize AudioRecord (fake)',
              fatal: true,
            };
            emit(err);
            return;
          }
          state.recording = true;
          state.paused = false;
          state.stopping = false;
          state.monotonicBase = Date.now();
          state.wallClockBase = now();
          state.status.state = 'recording';
          state.status.correlationId = command.correlationId;

          // Maybe inject route change event on start
          if (config.routeChangeOnStart) {
            const dev: DeviceEvent = {
              type: 'device',
              changeType: 'route_change',
              detail: `Route changed to ${config.routeChangeOnStart}`,
            };
            emit(dev);
          }

          startChunkEmission();
          break;
        }

        case 'pause': {
          if (config.pauseFails) {
            const err: ErrorEvent = {
              type: 'error',
              correlationId: command.correlationId,
              code: 'io_error',
              detail: 'Failed to pause (fake)',
              fatal: false,
            };
            emit(err);
            return;
          }
          state.paused = true;
          state.status.state = 'paused';
          state.status.correlationId = command.correlationId;
          break;
        }

        case 'resume': {
          state.paused = false;
          state.status.state = 'recording';
          state.status.correlationId = command.correlationId;
          // Resume starts a new timeline interval
          state.monotonicBase = Date.now();
          break;
        }

        case 'stop': {
          if (config.stopTimeout) {
            // Simulate timeout: never emit final chunk
            state.stopping = true;
            state.recording = false; // Stop chunk emission immediately
            state.status.state = 'stopping';
            state.status.correlationId = command.correlationId;
            stopChunkEmission();
            // Never transition to finalizing — simulates stuck stop
            return;
          }

          state.stopping = true;
          state.status.state = 'stopping';
          state.status.correlationId = command.correlationId;
          stopChunkEmission();

          // Check for disk full on stop BEFORE drain
          if (config.diskFullOnStop) {
            const err: ErrorEvent = {
              type: 'error',
              code: 'disk_full',
              detail: 'Simulated disk full on stop',
              fatal: true,
            };
            emit(err);
            state.status.state = 'finalizing';
            return;
          }

          // Simulate async drain + final chunk
          await new Promise((r) => setTimeout(r, 50));

          if (config.checksumMismatch) {
            const err: ErrorEvent = {
              type: 'error',
              code: 'io_error',
              detail: 'Checksum verification failed',
              fatal: true,
            };
            emit(err);
            state.status.state = 'finalizing';
            return;
          }

          // Emit the final chunk
          const finalChunk = makeChunkEvent(state.chunkIndex, state.wallClockBase);
          emit(finalChunk);
          state.chunkIndex += 1;
          state.status.currentChunkIndex = state.chunkIndex;
          state.status.bytesWritten += finalChunk.byteLength;
          state.status.durationMs += finalChunk.durationMs;
          state.status.state = 'finalizing';
          break;
        }

        case 'status': {
          const statusResp: StatusResponse = {
            ...state.status,
            correlationId: command.correlationId,
          };
          emit(statusResp);
          break;
        }

        case 'cancel': {
          stopChunkEmission();
          state.recording = false;
          state.paused = false;
          state.stopping = false;
          state.chunkIndex = 0;
          state.status.state = 'unconfigured';
          state.status.currentChunkIndex = 0;
          state.status.bytesWritten = 0;
          state.status.durationMs = 0;
          state.status.correlationId = command.correlationId;
          break;
        }
      }
    },

    getStatus() {
      return {
        state: state.status.state,
        currentChunkIndex: state.status.currentChunkIndex,
        bytesWritten: state.status.bytesWritten,
        durationMs: state.status.durationMs,
        storageAvailable: state.status.storageAvailable,
      };
    },
  };
}
