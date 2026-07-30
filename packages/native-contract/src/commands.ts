/**
 * Exhaustive command allowlist for Rust native runtime IPC.
 *
 * Every command that can cross the Electron↔Rust boundary must be listed here.
 * Unknown commands are rejected on both sides. New commands require a version bump.
 */

import { z } from 'zod';

/**
 * All allowed native commands — ordered by category.
 */
export const NATIVE_COMMANDS = [
  // Runtime lifecycle
  'ping',
  'get_version',
  'get_capabilities',
  'health_check',
  'shutdown',

  // Storage (P07 adapter operations)
  'storage_init',
  'storage_atomic_write',
  'storage_read',
  'storage_delete',
  'storage_list',
  'storage_stat',
  'storage_mkdir',
  'storage_available_space',
  'storage_checksum_compute',
  'storage_checksum_verify',

  // Manifest (P07 manifest operations)
  'manifest_init',
  'manifest_add_entry',
  'manifest_get_entry',
  'manifest_list_entries',
  'manifest_update_upload_status',
  'manifest_get_incomplete',
  'manifest_get_orphans',
  'manifest_close',

  // Simulator (deterministic device/capture, P11 only)
  'simulator_configure',
  'simulator_enumerate_devices',
  'simulator_device_health',
  'simulator_start_capture',
  'simulator_stop_capture',
  'simulator_inject_event',
  'simulator_get_state',
  'simulator_reset',

  // Production Audio Capture (P12)
  'device_enumerate',
  'capture_start',
  'capture_stop',
  'capture_get_state',

  // Local Speech (P13)
  'local_speech_manifest_load',
  'local_speech_engine_init',
  'local_speech_transcribe_window',
  'local_speech_cancel',
  'local_speech_get_state',
] as const;

export type NativeCommand = (typeof NATIVE_COMMANDS)[number];

export const NativeCommandSchema = z.enum(NATIVE_COMMANDS);

/**
 * Command categories for routing and documentation.
 */
export const COMMAND_CATEGORIES: Record<string, readonly NativeCommand[]> = {
  lifecycle: ['ping', 'get_version', 'get_capabilities', 'health_check', 'shutdown'],
  storage: [
    'storage_init',
    'storage_atomic_write',
    'storage_read',
    'storage_delete',
    'storage_list',
    'storage_stat',
    'storage_mkdir',
    'storage_available_space',
    'storage_checksum_compute',
    'storage_checksum_verify',
  ],
  manifest: [
    'manifest_init',
    'manifest_add_entry',
    'manifest_get_entry',
    'manifest_list_entries',
    'manifest_update_upload_status',
    'manifest_get_incomplete',
    'manifest_get_orphans',
    'manifest_close',
  ],
  simulator: [
    'simulator_configure',
    'simulator_enumerate_devices',
    'simulator_device_health',
    'simulator_start_capture',
    'simulator_stop_capture',
    'simulator_inject_event',
    'simulator_get_state',
    'simulator_reset',
  ],
  capture: ['device_enumerate', 'capture_start', 'capture_stop', 'capture_get_state'],
  speech: [
    'local_speech_manifest_load',
    'local_speech_engine_init',
    'local_speech_transcribe_window',
    'local_speech_cancel',
    'local_speech_get_state',
  ],
} as const;

/**
 * Version payloads for get_version command.
 */
export const VersionResponsePayloadSchema = z
  .object({
    runtimeVersion: z.string(),
    protocolVersion: z.number().int().positive(),
    platform: z.string(),
    capabilities: z.array(z.string()),
  })
  .strict();

export type VersionResponsePayload = z.infer<typeof VersionResponsePayloadSchema>;

/**
 * Health check response payload.
 */
export const HealthResponsePayloadSchema = z
  .object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    uptimeMs: z.number().int().nonnegative(),
    storageReady: z.boolean(),
    simulatorActive: z.boolean(),
    memoryUsageBytes: z.number().int().nonnegative().optional(),
  })
  .strict();

export type HealthResponsePayload = z.infer<typeof HealthResponsePayloadSchema>;

/**
 * Capabilities response — used for version/feature negotiation.
 */
export const CapabilitiesPayloadSchema = z
  .object({
    supportedCommands: z.array(NativeCommandSchema),
    protocolVersion: z.number().int().positive(),
    features: z.array(z.string()),
  })
  .strict();

export type CapabilitiesPayload = z.infer<typeof CapabilitiesPayloadSchema>;
