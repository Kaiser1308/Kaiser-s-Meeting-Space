/**
 * Electron Preload Script — Typed IPC bridge.
 *
 * Exposes only the typed NativeBridgeClient methods to the renderer.
 * No Node.js APIs are exposed. contextBridge ensures isolation.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { NATIVE_IPC_CHANNEL, NATIVE_EVENT_CHANNEL, NATIVE_COMMANDS } from '@kms/native-contract';
import type { NativeRequestV1 } from '@kms/native-contract';

/** Typed API exposed to renderer via window.kmsNative. */
export interface KmsNativeApi {
  /** Send a validated command to the native runtime. */
  invoke(request: NativeRequestV1): Promise<unknown>;

  /** Subscribe to native runtime events. Returns unsubscribe function. */
  onEvent(callback: (event: unknown) => void): () => void;

  /** Get the list of allowed commands (read-only). */
  getAllowedCommands(): readonly string[];

  /** Get protocol version. */
  getProtocolVersion(): number;
}

/**
 * Expose the typed bridge API to the renderer.
 *
 * SECURITY: Only these methods are available in the renderer.
 * No Node.js APIs (fs, child_process, require, etc.) are exposed.
 */
contextBridge.exposeInMainWorld('kmsNative', {
  /**
   * Invoke a native runtime command via IPC.
   * The main process validates the command against the allowlist.
   */
  invoke: (request: NativeRequestV1): Promise<unknown> => {
    return ipcRenderer.invoke(NATIVE_IPC_CHANNEL, request);
  },

  /**
   * Subscribe to native runtime events.
   * Returns an unsubscribe function.
   */
  onEvent: (callback: (event: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data);
    };
    ipcRenderer.on(NATIVE_EVENT_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(NATIVE_EVENT_CHANNEL, handler);
    };
  },

  /**
   * Get the exhaustive list of allowed commands.
   * This is a read-only snapshot, not a reference.
   */
  getAllowedCommands: (): readonly string[] => {
    return [...NATIVE_COMMANDS];
  },

  /**
   * Get the current protocol version.
   */
  getProtocolVersion: (): number => {
    return 1;
  },
} satisfies KmsNativeApi);
