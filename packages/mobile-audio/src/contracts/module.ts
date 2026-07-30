import type { NativeCommand } from './commands';
import type { NativeEvent } from './events';

/**
 * Event listener callback for native module events.
 * Content-free operational detail only — no audio content through this boundary.
 */
export type NativeEventListener = (event: NativeEvent) => void;

/**
 * Versioned native audio module interface.
 *
 * Commands are JS → Native. Events are Native → JS.
 * P09 replaces the fake with real Android/iOS Expo native modules.
 * P10+ adds upload transport when network is available.
 */
export interface NativeAudioModule {
  /**
   * Register an event listener. Multiple listeners may be registered.
   * Removing a listener is done via the returned unsubscribe function.
   */
  addEventListener(listener: NativeEventListener): () => void;

  /**
   * Send a command to the native module.
   *
   * Commands are version-validated at the native boundary.
   * Each command carries a correlationId for tracing and deduplication.
   *
   * @throws {Error} if the command is rejected (malformed, unknown, stale).
   */
  sendCommand(command: NativeCommand): Promise<void>;

  /**
   * Get current module status synchronously (cached state).
   * For a fresh status, use sendCommand({ type: 'status', ... }).
   */
  getStatus(): {
    state:
      'unconfigured' | 'configured' | 'recording' | 'paused' | 'stopping' | 'finalizing' | 'error';
    currentChunkIndex: number;
    bytesWritten: number;
    durationMs: number;
    storageAvailable: number;
  };
}
