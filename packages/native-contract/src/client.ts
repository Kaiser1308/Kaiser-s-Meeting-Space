/**
 * NativeBridgeClient — Typed IPC client exposed through Electron preload.
 *
 * This client is used in the renderer process via window.kmsNative.
 * It validates all responses through the contract schemas.
 * The actual IPC transport (ipcRenderer.invoke) is injected.
 */

import {
  type NativeRequestV1,
  type NativeResponseV1,
  NativeResponseV1Schema,
  PROTOCOL_VERSION,
  EnvelopeError,
} from './envelope.js';
import type { NativeCommand } from './commands.js';
import { validateCommandAllowlist, generateCorrelationId } from './validation.js';

/** IPC transport interface — injected by preload via contextBridge. */
export interface NativeIpcTransport {
  invoke(channel: string, request: NativeRequestV1): Promise<unknown>;
  on(channel: string, callback: (event: unknown) => void): () => void;
}

/** Default IPC channel name. */
export const NATIVE_IPC_CHANNEL = 'kms-native-ipc';
export const NATIVE_EVENT_CHANNEL = 'kms-native-event';

/** Client configuration. */
export interface NativeBridgeClientConfig {
  /** Default timeout in ms for requests. */
  defaultTimeoutMs?: number;
}

/**
 * Typed bridge client for communicating with the Rust native runtime.
 *
 * Usage in renderer:
 * ```ts
 * const bridge = new NativeBridgeClient(window.kmsNative);
 * const result = await bridge.send('ping');
 * ```
 */
export class NativeBridgeClient {
  private readonly defaultTimeoutMs: number;
  private readonly transport: NativeIpcTransport;

  constructor(transport: NativeIpcTransport, config?: NativeBridgeClientConfig) {
    this.transport = transport;
    this.defaultTimeoutMs = config?.defaultTimeoutMs ?? 30_000;
  }

  /**
   * Send a validated command to the native runtime and return the response.
   */
  async send(
    command: NativeCommand,
    payload?: Record<string, unknown>,
    options?: { timeoutMs?: number; cancel?: boolean },
  ): Promise<NativeResponseV1> {
    // Validate command is in allowlist
    validateCommandAllowlist(command);

    const request: NativeRequestV1 = {
      version: PROTOCOL_VERSION,
      correlationId: generateCorrelationId(),
      command,
      payload: payload ?? {},
      timeoutMs: options?.timeoutMs ?? this.defaultTimeoutMs,
      cancel: options?.cancel ?? false,
    };

    const rawResponse = await this.transport.invoke(NATIVE_IPC_CHANNEL, request);

    // Validate response through schema
    const result = NativeResponseV1Schema.safeParse(rawResponse);
    if (!result.success) {
      throw new EnvelopeError(
        'MALFORMED',
        `Invalid response from native runtime: ${result.error.message}`,
      );
    }

    const response = result.data;

    // Verify correlation ID matches
    if (response.correlationId !== request.correlationId) {
      throw new EnvelopeError(
        'MALFORMED',
        `Response correlation ID mismatch: expected ${request.correlationId}, got ${response.correlationId}`,
      );
    }

    return response;
  }

  /**
   * Subscribe to native runtime events.
   * Returns an unsubscribe function.
   */
  onEvent(callback: (event: unknown) => void): () => void {
    return this.transport.on(NATIVE_EVENT_CHANNEL, callback);
  }

  /**
   * Convenience: ping the runtime.
   */
  async ping(): Promise<boolean> {
    const response = await this.send('ping');
    return response.success;
  }

  /**
   * Convenience: get runtime version info.
   */
  async getVersion(): Promise<NativeResponseV1> {
    return this.send('get_version');
  }

  /**
   * Convenience: health check.
   */
  async healthCheck(): Promise<NativeResponseV1> {
    return this.send('health_check');
  }

  /**
   * Convenience: request graceful shutdown.
   */
  async shutdown(): Promise<NativeResponseV1> {
    return this.send('shutdown');
  }
}
