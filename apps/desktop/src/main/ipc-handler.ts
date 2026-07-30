/**
 * IPC Handler — Main-process IPC message routing.
 *
 * Receives requests from preload, validates against the allowlist,
 * forwards to native runtime, correlates responses, enforces timeouts.
 *
 * Security invariants:
 * - Only allowlisted commands are forwarded
 * - Payload size is validated
 * - Renderer cannot choose the native runtime path/args
 */

import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  NATIVE_IPC_CHANNEL,
  NativeRequestV1Schema,
  type NativeResponseV1,
  MAX_ENVELOPE_BYTES,
} from '@kms/native-contract';
import { validateCommandAllowlist, validateProtocolVersion } from '@kms/native-contract';
import type { NativeSupervisor } from './supervisor.js';

export class IpcHandler {
  private supervisor: NativeSupervisor;

  constructor(supervisor: NativeSupervisor) {
    this.supervisor = supervisor;
  }

  /**
   * Register IPC handlers on the main process.
   */
  register(ipcMain: IpcMain): void {
    ipcMain.handle(NATIVE_IPC_CHANNEL, async (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
      return this.handleRequest(rawRequest);
    });
  }

  /**
   * Handle an incoming IPC request from the renderer.
   */
  private async handleRequest(rawRequest: unknown): Promise<NativeResponseV1> {
    try {
      // Validate the request shape
      const parseResult = NativeRequestV1Schema.safeParse(rawRequest);
      if (!parseResult.success) {
        return this.makeErrorResponse(
          'unknown',
          'MALFORMED',
          `Invalid request: ${parseResult.error.message}`,
          'validation',
        );
      }

      const request = parseResult.data;

      // Validate protocol version
      try {
        validateProtocolVersion(request.version);
      } catch (err) {
        return this.makeErrorResponse(
          request.correlationId,
          'VERSION_MISMATCH',
          err instanceof Error ? err.message : 'Version mismatch',
          'protocol',
          request.command,
        );
      }

      // Validate command is in allowlist
      try {
        validateCommandAllowlist(request.command);
      } catch (err) {
        return this.makeErrorResponse(
          request.correlationId,
          'UNKNOWN_COMMAND',
          err instanceof Error ? err.message : 'Unknown command',
          'validation',
          request.command,
        );
      }

      // Validate payload size
      const payloadJson = JSON.stringify(request.payload ?? {});
      if (new TextEncoder().encode(payloadJson).length > MAX_ENVELOPE_BYTES) {
        return this.makeErrorResponse(
          request.correlationId,
          'OVERSIZED',
          'Request payload exceeds maximum size',
          'validation',
          request.command,
        );
      }

      // Check if supervisor is running
      if (this.supervisor.getState() !== 'running') {
        return this.makeErrorResponse(
          request.correlationId,
          'RUNTIME_NOT_READY',
          'Native runtime is not running',
          'runtime',
          request.command,
        );
      }

      // Forward to native runtime
      return await this.supervisor.send(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      return this.makeErrorResponse('unknown', 'INTERNAL', message, 'internal');
    }
  }

  /**
   * Create a standardized error response.
   */
  private makeErrorResponse(
    correlationId: string,
    code: string,
    message: string,
    category: string,
    command: string = 'ping',
  ): NativeResponseV1 {
    return {
      version: 1,
      correlationId,
      command: command as NativeResponseV1['command'],
      success: false,
      payload: {},
      error: {
        code,
        message: message.substring(0, 512),
        category: category as NativeResponseV1['error'] extends { category: infer C } ? C : never,
        retryable: false,
      },
    } as NativeResponseV1;
  }
}
