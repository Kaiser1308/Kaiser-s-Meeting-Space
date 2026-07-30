/**
 * Shared validation utilities for IPC envelope messages.
 *
 * Used by both TS (Electron) and Rust (via equivalent implementation).
 */

import {
  PROTOCOL_VERSION,
  MAX_PAYLOAD_BYTES,
  MAX_ENVELOPE_BYTES,
  EnvelopeError,
} from './envelope.js';
import { NATIVE_COMMANDS, type NativeCommand } from './commands.js';

/**
 * Validate raw message size before any parsing.
 * Returns the validated string or throws EnvelopeError.
 */
export function validateMessageSize(raw: string): string {
  const byteLength = new TextEncoder().encode(raw).length;
  if (byteLength > MAX_ENVELOPE_BYTES) {
    throw new EnvelopeError(
      'OVERSIZED',
      `Message size ${byteLength} bytes exceeds limit of ${MAX_ENVELOPE_BYTES} bytes`,
    );
  }
  return raw;
}

/**
 * Validate payload size.
 */
export function validatePayloadSize(payload: Record<string, unknown>): void {
  const serialized = JSON.stringify(payload);
  const byteLength = new TextEncoder().encode(serialized).length;
  if (byteLength > MAX_PAYLOAD_BYTES) {
    throw new EnvelopeError(
      'OVERSIZED',
      `Payload size ${byteLength} bytes exceeds limit of ${MAX_PAYLOAD_BYTES} bytes`,
    );
  }
}

/**
 * Validate a command against the exhaustive allowlist.
 */
export function validateCommandAllowlist(command: string): NativeCommand {
  if (!(NATIVE_COMMANDS as readonly string[]).includes(command)) {
    throw new EnvelopeError(
      'UNKNOWN_COMMAND',
      `Command '${command}' is not in the allowlist. Allowed: ${NATIVE_COMMANDS.join(', ')}`,
    );
  }
  return command as NativeCommand;
}

/**
 * Validate protocol version.
 */
export function validateProtocolVersion(version: number): void {
  if (version !== PROTOCOL_VERSION) {
    throw new EnvelopeError(
      'VERSION_MISMATCH',
      `Protocol version ${version} is not supported. Expected: ${PROTOCOL_VERSION}`,
    );
  }
}

/**
 * Validate a UUID v4 correlation ID format.
 */
export function validateCorrelationId(id: string): void {
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidV4Regex.test(id)) {
    throw new EnvelopeError(
      'MALFORMED',
      `Invalid correlation ID format: '${id}'. Must be UUID v4.`,
    );
  }
}

/**
 * Generate a new UUID v4 correlation ID.
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Build a framed message for stdio transport.
 * Format: 4-byte length prefix (big-endian uint32) + JSON payload.
 */
export function frameMessage(json: string): Uint8Array {
  const payload = new TextEncoder().encode(json);
  const frame = new Uint8Array(4 + payload.length);
  const view = new DataView(frame.buffer);
  view.setUint32(0, payload.length, false); // big-endian
  frame.set(payload, 4);
  return frame;
}

/**
 * Read the length prefix from a framed message.
 */
export function readFrameLength(header: Uint8Array): number {
  if (header.length < 4) {
    throw new EnvelopeError('MALFORMED', 'Frame header must be at least 4 bytes');
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  return view.getUint32(0, false); // big-endian
}
