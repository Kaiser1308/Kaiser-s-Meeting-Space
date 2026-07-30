// P09-T03: TypeScript types for the iOS native module JSON bridge interface
// These types mirror the P09 NativeEvent schema from contracts/events.ts

import type { z } from 'zod';
import type {
  ChunkEventSchema,
  DeviceEventSchema,
  InterruptEventSchema,
  StorageEventSchema,
  GapEventSchema,
  ErrorEventSchema,
  StatusResponseSchema,
} from '../../contracts/events';

// ── Event types emitted by the iOS native module ──

/**
 * Chunk event — emitted when a WebM audio segment is written to disk.
 * Mirrors ChunkEventSchema in contracts/events.ts.
 */
export type NativeChunkEvent = z.infer<typeof ChunkEventSchema>;

/**
 * Device event — emitted on audio route/interruption changes.
 * Mirrors DeviceEventSchema in contracts/events.ts.
 */
export type NativeDeviceEvent = z.infer<typeof DeviceEventSchema>;

/**
 * Interrupt event — emitted on system interruptions (phone calls, alarms, etc.).
 * Mirrors InterruptEventSchema in contracts/events.ts.
 */
export type NativeInterruptEvent = z.infer<typeof InterruptEventSchema>;

/**
 * Storage event — emitted when available space falls below thresholds.
 * Mirrors StorageEventSchema in contracts/events.ts.
 */
export type NativeStorageEvent = z.infer<typeof StorageEventSchema>;

/**
 * Gap event — emitted on audio gaps (buffer overflow, disconnects, etc.).
 * Mirrors GapEventSchema in contracts/events.ts.
 */
export type NativeGapEvent = z.infer<typeof GapEventSchema>;

/**
 * Error event — emitted on capture errors.
 * Mirrors ErrorEventSchema in contracts/events.ts.
 */
export type NativeErrorEvent = z.infer<typeof ErrorEventSchema>;

/**
 * Status response — emitted in reply to a status command.
 * Mirrors StatusResponseSchema in contracts/events.ts.
 */
export type NativeStatusResponse = z.infer<typeof StatusResponseSchema>;

// ── iOS module command/response types ──

/**
 * JSON response from the iOS native module for async commands.
 */
export interface NativeCommandResponse {
  success: boolean;
  correlationId: string;
  detail: string;
  [key: string]: unknown;
}

/**
 * Capture profile JSON accepted by configure().
 */
export interface NativeCaptureProfile {
  sampleRate: 48000;
  channels: 1;
  codec: 'opus';
  container: 'webm';
  bitrate: number;
  opusFrameDurationMs: 20;
  complexity: 5;
}

// ── iOS native module interface ──

/**
 * iOS native module as exposed by Expo Modules Core.
 * The module is registered as "AudioRecorder" in expo-module.config.json.
 */
export interface IosNativeModule {
  /**
   * Configure the capture engine with a profile and storage directory.
   *
   * @param profileJson - Serialized CaptureProfile JSON.
   * @param storageDir  - Absolute path to the storage directory.
   * @param meetingId   - UUID of the current meeting.
   * @returns JSON string with NativeCommandResponse.
   */
  configure(profileJson: string, storageDir: string, meetingId: string): Promise<string>;

  /**
   * Start recording.
   * @returns JSON string with NativeCommandResponse.
   */
  start(): Promise<string>;

  /**
   * Pause recording — closes current chunk.
   * @returns JSON string with NativeCommandResponse.
   */
  pause(): Promise<string>;

  /**
   * Resume a paused recording.
   * @returns JSON string with NativeCommandResponse.
   */
  resume(): Promise<string>;

  /**
   * Stop recording — drains remaining buffers, emits final chunk.
   * @returns JSON string with NativeCommandResponse.
   */
  stop(): Promise<string>;

  /**
   * Query current module status.
   * @returns JSON string with NativeCommandResponse (includes state fields).
   */
  status(): Promise<string>;

  /**
   * Cancel recording and reset to unconfigured state.
   * @returns JSON string with NativeCommandResponse.
   */
  cancel(): Promise<string>;
}

// ── Event names ──

/**
 * Event names emitted by the iOS native module.
 * Matches the Events() registration in AudioRecorderModule.swift.
 */
export const IOS_EVENT_NAMES = {
  ON_CHUNK: 'onChunk',
  ON_DEVICE: 'onDevice',
  ON_INTERRUPT: 'onInterrupt',
  ON_STORAGE: 'onStorage',
  ON_GAP: 'onGap',
  ON_ERROR: 'onError',
} as const;

export type IosEventName = (typeof IOS_EVENT_NAMES)[keyof typeof IOS_EVENT_NAMES];

// P09-T03
