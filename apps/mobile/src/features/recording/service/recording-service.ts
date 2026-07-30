import type { NativeAudioModule, NativeEvent } from '@kms/mobile-audio';
import { randomUUID } from 'expo-crypto';
import { recordingReducer } from '../reducer/recording-reducer';
import type { RecordingState, RecordingAction } from '../reducer/types';
import { INITIAL_RECORDING_STATE } from '../reducer/types';

function newCorrelationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return randomUUID();
}

// ── Debounce config ──

const DEBOUNCE_MS = 300;

// ── Timeout config ──

const STOP_TIMEOUT_MS = 30_000;

// ── Recording service ──

export class RecordingService {
  private state: RecordingState;
  private listeners: Set<(s: RecordingState) => void> = new Set();
  private nativeUnsubscribe: (() => void) | null = null;
  private lastActionTime: Map<string, number> = new Map();
  private stopTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private storagePollId: ReturnType<typeof setInterval> | null = null;
  private monotonicOffset: number = 0;
  private errorDuringCommand: boolean = false;

  constructor(private readonly nativeModule: NativeAudioModule) {
    this.state = { ...INITIAL_RECORDING_STATE };
    this.monotonicOffset = Date.now();
  }

  // ── State management ──

  getState(): RecordingState {
    return this.state;
  }

  subscribe(listener: (state: RecordingState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private dispatch(action: RecordingAction): void {
    this.state = recordingReducer(this.state, action);
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        /* isolate listener errors */
      }
    }
  }

  // ── Debounce helper ──

  private isDebounced(actionType: string): boolean {
    const last = this.lastActionTime.get(actionType);
    const now = Date.now();
    if (last && now - last < DEBOUNCE_MS) return true;
    this.lastActionTime.set(actionType, now);
    return false;
  }

  // ── Initialize ──

  async initialize(): Promise<void> {
    this.nativeUnsubscribe = this.nativeModule.addEventListener((event: NativeEvent) => {
      this.handleNativeEvent(event);
    });
  }

  // ── Commands ──

  async configure(meetingId: string, storageDirectory: string): Promise<void> {
    this.errorDuringCommand = false;
    this.dispatch({ type: 'CONFIGURE', meetingId, storageDirectory });

    try {
      await this.nativeModule.sendCommand({
        type: 'configure',
        correlationId: newCorrelationId(),
        profile: {
          sampleRate: 48000,
          channels: 1,
          codec: 'opus',
          container: 'webm',
          bitrate: 96000,
          opusFrameDurationMs: 20,
          complexity: 5,
        },
        storageDirectory,
        meetingId,
      });
      if (!this.errorDuringCommand) {
        this.dispatch({ type: 'CONFIGURE_OK' });
      }
    } catch (e) {
      this.dispatch({ type: 'CONFIGURE_ERROR', error: String(e) });
    }
  }

  async start(): Promise<void> {
    if (this.isDebounced('start')) return;
    this.errorDuringCommand = false;
    this.monotonicOffset = Date.now();

    try {
      this.dispatch({ type: 'START' });
      await this.nativeModule.sendCommand({
        type: 'start',
        correlationId: newCorrelationId(),
      });
      if (!this.errorDuringCommand) {
        this.dispatch({
          type: 'START_OK',
          startedAt: new Date().toISOString(),
          monotonicNow: this.monotonicOffset,
        });
        this.startStoragePolling();
      }
    } catch (e) {
      this.dispatch({ type: 'ERROR', code: 'start_failed', message: String(e) });
    }
  }

  async pause(): Promise<void> {
    if (this.isDebounced('pause')) return;
    if (this.state.status !== 'recording') return;

    const pauseStart = Date.now() - this.monotonicOffset;
    this.dispatch({ type: 'PAUSE' });

    try {
      await this.nativeModule.sendCommand({
        type: 'pause',
        correlationId: newCorrelationId(),
      });
      this.dispatch({ type: 'PAUSE_OK', pauseStart });
    } catch (e) {
      this.dispatch({ type: 'PAUSE_ERROR', error: String(e) });
    }
  }

  async resume(): Promise<void> {
    if (this.isDebounced('resume')) return;
    if (this.state.status !== 'paused') return;

    this.dispatch({ type: 'RESUME' });

    try {
      await this.nativeModule.sendCommand({
        type: 'resume',
        correlationId: newCorrelationId(),
      });
      this.dispatch({ type: 'RESUME_OK', resumedAt: Date.now() - this.monotonicOffset });
    } catch (e) {
      this.dispatch({ type: 'RESUME_ERROR', error: String(e) });
    }
  }

  async end(): Promise<void> {
    if (this.isDebounced('stop')) return;
    if (this.state.status !== 'recording' && this.state.status !== 'paused') return;

    this.dispatch({ type: 'END' });

    // Start stop timeout
    this.stopTimeoutId = setTimeout(() => {
      this.dispatch({ type: 'RECOVERY_TIMEOUT' });
      this.stopStoragePolling();
    }, STOP_TIMEOUT_MS);

    try {
      await this.nativeModule.sendCommand({
        type: 'stop',
        correlationId: newCorrelationId(),
      });
      this.dispatch({ type: 'STOP_OK' });
      // Finalize happens after CHUNK_COMMITTED is received
    } catch (e) {
      this.clearStopTimeout();
      this.dispatch({ type: 'ERROR', code: 'stop_failed', message: String(e) });
    }
  }

  async cancel(): Promise<void> {
    this.clearStopTimeout();
    this.stopStoragePolling();

    try {
      await this.nativeModule.sendCommand({
        type: 'cancel',
        correlationId: newCorrelationId(),
      });
    } catch {
      // Cancel failures are non-fatal
    }

    this.dispatch({ type: 'RESET' });
  }

  // ── Teardown ──

  destroy(): void {
    this.clearStopTimeout();
    this.stopStoragePolling();
    if (this.nativeUnsubscribe) {
      this.nativeUnsubscribe();
      this.nativeUnsubscribe = null;
    }
    this.listeners.clear();
  }

  // ── Native event handler ──

  private handleNativeEvent(event: NativeEvent): void {
    switch (event.type) {
      case 'chunk': {
        const wasStopping = this.state.status === 'stopping';
        this.dispatch({ type: 'CHUNK_COMMITTED', chunk: event });

        // The reducer transitions stopping→finalizing on CHUNK_COMMITTED.
        // If we were stopping, this was the final chunk → finalize.
        if (wasStopping || this.state.status === 'finalizing') {
          this.clearStopTimeout();
          this.dispatch({
            type: 'STORAGE_UPDATE',
            availableBytes: this.state.storageAvailableBytes,
            totalBytes: this.state.storageTotalBytes,
          });
          this.dispatch({ type: 'FINALIZE_OK' });
          this.stopStoragePolling();
        }
        break;
      }

      case 'device': {
        this.dispatch({ type: 'DEVICE_EVENT', event });
        break;
      }

      case 'interrupt': {
        this.dispatch({ type: 'INTERRUPT', event });
        if (event.action === 'stop') {
          this.clearStopTimeout();
          this.stopStoragePolling();
        }
        break;
      }

      case 'storage': {
        this.dispatch({
          type: 'STORAGE_UPDATE',
          availableBytes: event.availableBytes,
          totalBytes: event.totalBytes,
        });
        break;
      }

      case 'gap': {
        this.dispatch({ type: 'GAP_EVENT', event });
        break;
      }

      case 'error': {
        this.errorDuringCommand = true;
        this.dispatch({
          type: 'ERROR',
          code: event.code,
          message: event.detail ?? 'Unknown error',
        });
        if (event.fatal) {
          this.clearStopTimeout();
          this.stopStoragePolling();
        }
        break;
      }

      case 'status': {
        // Status responses update storage info
        this.dispatch({
          type: 'STORAGE_UPDATE',
          availableBytes: event.storageAvailable,
          totalBytes: this.state.storageTotalBytes || event.storageAvailable + 1_000_000_000,
        });
        break;
      }
    }
  }

  // ── Storage polling ──

  private startStoragePolling(): void {
    if (this.storagePollId) return;
    this.storagePollId = setInterval(() => {
      const status = this.nativeModule.getStatus();
      this.dispatch({
        type: 'STORAGE_UPDATE',
        availableBytes: status.storageAvailable,
        totalBytes: this.state.storageTotalBytes || status.storageAvailable + 1_000_000_000,
      });
    }, 5000);
  }

  private stopStoragePolling(): void {
    if (this.storagePollId) {
      clearInterval(this.storagePollId);
      this.storagePollId = null;
    }
  }

  private clearStopTimeout(): void {
    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }
  }
}
