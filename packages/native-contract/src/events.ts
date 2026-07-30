/**
 * Native runtime event types — unsolicited messages from Rust to Electron.
 *
 * Events flow one-way: Rust → Electron main process → renderer (via preload).
 * Each event type has a typed payload schema.
 */

import { z } from 'zod';

export const NATIVE_EVENT_TYPES = [
  'runtime_ready',
  'runtime_shutting_down',
  'health_status',
  'shutdown_complete',
  'storage_event',
  'device_event',
  'capture_event',
  'error',
  'local_speech_event',
] as const;

export type NativeEventType = (typeof NATIVE_EVENT_TYPES)[number];

export const NativeEventTypeSchema = z.enum(NATIVE_EVENT_TYPES);

/**
 * Runtime ready event — sent once after startup handshake.
 */
export const RuntimeReadyPayloadSchema = z
  .object({
    runtimeVersion: z.string(),
    protocolVersion: z.number().int().positive(),
    pid: z.number().int().positive(),
  })
  .strict();

export type RuntimeReadyPayload = z.infer<typeof RuntimeReadyPayloadSchema>;

/**
 * Health status event — periodic health update.
 */
export const HealthStatusPayloadSchema = z
  .object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    uptimeMs: z.number().int().nonnegative(),
    details: z.string().max(256).optional(),
  })
  .strict();

export type HealthStatusPayload = z.infer<typeof HealthStatusPayloadSchema>;

/**
 * Storage event — changes in storage state.
 */
export const StorageEventPayloadSchema = z
  .object({
    operation: z.enum(['write', 'delete', 'migrate', 'cleanup', 'error']),
    path: z.string().max(256).optional(),
    bytesAffected: z.number().int().nonnegative().optional(),
    success: z.boolean(),
    errorCode: z.string().max(64).optional(),
  })
  .strict();

export type StorageEventPayload = z.infer<typeof StorageEventPayloadSchema>;

/**
 * Device event — device state changes (simulator only in P11).
 */
export const DeviceEventPayloadSchema = z
  .object({
    deviceId: z.string().max(128),
    deviceName: z.string().max(256),
    eventKind: z.enum(['connected', 'disconnected', 'default_changed', 'format_changed', 'error']),
    deviceType: z.enum(['microphone', 'system_audio', 'unknown']),
    isSimulated: z.boolean(),
  })
  .strict();

export type DeviceEventPayload = z.infer<typeof DeviceEventPayloadSchema>;

/**
 * Capture event — capture lifecycle events (simulator only in P11).
 */
export const CaptureEventPayloadSchema = z
  .object({
    sessionId: z.string().uuid(),
    eventKind: z.enum([
      'started',
      'chunk_ready',
      'chunk_committed',
      'paused',
      'resumed',
      'gap_detected',
      'overflow',
      'format_change',
      'hot_plug',
      'sleep_wake',
      'crash',
      'stopped',
    ]),
    chunkIndex: z.number().int().nonnegative().optional(),
    byteLength: z.number().int().nonnegative().optional(),
    sha256: z.string().length(64).optional(),
    isSimulated: z.boolean(),
    details: z.string().max(256).optional(),
  })
  .strict();

export type CaptureEventPayload = z.infer<typeof CaptureEventPayloadSchema>;

/**
 * Error event — unstructured runtime error.
 */
export const ErrorEventPayloadSchema = z
  .object({
    code: z.string().max(64),
    message: z.string().max(512),
    category: z.string().max(64),
    fatal: z.boolean().default(false),
  })
  .strict();

export type ErrorEventPayload = z.infer<typeof ErrorEventPayloadSchema>;

/**
 * Local speech event — unsolicited lifecycle/progress events from the local STT engine.
 *
 * Conformance fixtures may use isSimulated: true for deterministic control
 * tests. Production local-file STT emits isSimulated: false after the Rust
 * runtime has verified the model and source audio.
 */
export const LocalSpeechEventPayloadSchema = z
  .object({
    runId: z.string().uuid(),
    eventKind: z.enum([
      'started',
      'window_progress',
      'window_complete',
      'window_failed',
      'cancelled',
      'stopped',
    ]),
    partIndex: z.number().int().nonnegative().optional(),
    progress: z.number().min(0).max(100).optional(),
    isSimulated: z.boolean(),
    details: z.string().max(256).optional(),
  })
  .strict();

export type LocalSpeechEventPayload = z.infer<typeof LocalSpeechEventPayloadSchema>;
