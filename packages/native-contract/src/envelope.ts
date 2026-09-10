/**
 * NativeEnvelopeV1 — Versioned IPC envelope for Electron↔Rust communication.
 *
 * Every message between the Electron main process and the Rust native runtime
 * uses this envelope. It is validated on both sides (TS + Rust) and must be
 * byte/semantic conformant across golden fixtures.
 */

import { z } from 'zod';
import { NATIVE_COMMANDS, NativeCommandSchema } from './commands.js';
import { NativeEventTypeSchema } from './events.js';

/** Maximum payload size in bytes (1 MB). */
export const MAX_PAYLOAD_BYTES = 1_048_576;

/** Maximum total envelope size in bytes (1 MB + 4 KB overhead). */
export const MAX_ENVELOPE_BYTES = MAX_PAYLOAD_BYTES + 4096;

/** Current protocol version. */
export const PROTOCOL_VERSION = 1;

/** Correlation ID format: UUID v4. */
const CorrelationIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'Correlation ID must be a valid UUID v4',
  );

/**
 * NativeEnvelopeV1 — Request from Electron to Rust runtime.
 */
export const NativeRequestV1Schema = z
  .object({
    version: z.literal(PROTOCOL_VERSION),
    correlationId: CorrelationIdSchema,
    command: NativeCommandSchema,
    payload: z.record(z.unknown()).optional().default({}),
    timeoutMs: z.number().int().positive().max(300_000).optional(),
    cancel: z.boolean().optional().default(false),
  })
  .strict();

export type NativeRequestV1 = z.infer<typeof NativeRequestV1Schema>;

/**
 * Safe error detail — never exposes file paths, content, or credentials.
 */
export const SafeErrorSchema = z
  .object({
    code: z.string().max(64),
    message: z.string().max(512),
    category: z.enum([
      'protocol',
      'validation',
      'runtime',
      'storage',
      'device',
      'capture',
      'timeout',
      'cancelled',
      'internal',
    ]),
    retryable: z.boolean().default(false),
  })
  .strict();

export type SafeError = z.infer<typeof SafeErrorSchema>;

/**
 * NativeResponseV1 — Response from Rust runtime to Electron.
 */
export const NativeResponseV1Schema = z
  .object({
    version: z.literal(PROTOCOL_VERSION),
    correlationId: CorrelationIdSchema,
    command: NativeCommandSchema,
    success: z.boolean(),
    payload: z
      .union([z.record(z.unknown()), z.array(z.unknown())])
      .optional()
      .default({}),
    error: SafeErrorSchema.optional(),
  })
  .strict();

export type NativeResponseV1 = z.infer<typeof NativeResponseV1Schema>;

/**
 * NativeEventV1 — Unsolicited event from Rust runtime to Electron.
 */
export const NativeEventV1Schema = z
  .object({
    version: z.literal(PROTOCOL_VERSION),
    eventId: z.string().uuid(),
    eventType: NativeEventTypeSchema,
    payload: z.record(z.unknown()).optional().default({}),
    timestamp: z.string().datetime({ offset: true }),
  })
  .strict();

export type NativeEventV1 = z.infer<typeof NativeEventV1Schema>;

/**
 * Union type for documentation — each message is parsed individually by kind.
 * Use parseRequest / parseResponse / parseEvent for actual validation.
 */
export type NativeEnvelopeV1 = NativeRequestV1 | NativeResponseV1 | NativeEventV1;

/**
 * Parse a raw JSON string into a validated request.
 * Enforces size limits before parsing.
 */
export function parseRequest(raw: string): NativeRequestV1 {
  if (raw.length > MAX_ENVELOPE_BYTES) {
    throw new EnvelopeError(
      'OVERSIZED',
      `Envelope exceeds maximum size: ${raw.length} > ${MAX_ENVELOPE_BYTES}`,
    );
  }
  const parsed: unknown = JSON.parse(raw);
  const result = NativeRequestV1Schema.safeParse(parsed);
  if (!result.success) {
    throw new EnvelopeError('MALFORMED', `Invalid request: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Parse a raw JSON string into a validated response.
 */
export function parseResponse(raw: string): NativeResponseV1 {
  if (raw.length > MAX_ENVELOPE_BYTES) {
    throw new EnvelopeError(
      'OVERSIZED',
      `Envelope exceeds maximum size: ${raw.length} > ${MAX_ENVELOPE_BYTES}`,
    );
  }
  const parsed: unknown = JSON.parse(raw);
  const result = NativeResponseV1Schema.safeParse(parsed);
  if (!result.success) {
    throw new EnvelopeError('MALFORMED', `Invalid response: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Parse a raw JSON string into a validated event.
 */
export function parseEvent(raw: string): NativeEventV1 {
  if (raw.length > MAX_ENVELOPE_BYTES) {
    throw new EnvelopeError(
      'OVERSIZED',
      `Envelope exceeds maximum size: ${raw.length} > ${MAX_ENVELOPE_BYTES}`,
    );
  }
  const parsed: unknown = JSON.parse(raw);
  const result = NativeEventV1Schema.safeParse(parsed);
  if (!result.success) {
    throw new EnvelopeError('MALFORMED', `Invalid event: ${result.error.message}`);
  }
  return result.data;
}

/** Envelope error categories. */
export type EnvelopeErrorCode = 'OVERSIZED' | 'MALFORMED' | 'UNKNOWN_COMMAND' | 'VERSION_MISMATCH';

export class EnvelopeError extends Error {
  constructor(
    public readonly code: EnvelopeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

/**
 * Validate that a command is in the allowlist.
 */
export function validateCommand(command: string): command is (typeof NATIVE_COMMANDS)[number] {
  return (NATIVE_COMMANDS as readonly string[]).includes(command);
}

/**
 * Validate protocol version compatibility.
 */
export function validateVersion(version: number): void {
  if (version !== PROTOCOL_VERSION) {
    throw new EnvelopeError(
      'VERSION_MISMATCH',
      `Unsupported protocol version: ${version}. Expected: ${PROTOCOL_VERSION}`,
    );
  }
}
