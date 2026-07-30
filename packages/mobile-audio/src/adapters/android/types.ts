// P09-T02: TypeScript adapter stubs — Android native module JSON bridge types
//
// These types document the JSON serialization contract between the
// Android Kotlin module (AudioRecorderModule) and the JS layer.
// Commands arrive as JSON strings; responses and events are JSON objects.

import type {
  ChunkEvent,
  DeviceEvent,
  InterruptEvent,
  StorageEvent,
  GapEvent,
  ErrorEvent,
  StatusResponse,
} from '../../contracts/events';

// ── Command request types (JS → Kotlin) ──
//
// Each command maps to an AsyncFunction on the Kotlin module.
// Parameters are passed as individual string arguments (JSON-encoded where needed).

export interface AndroidConfigureRequest {
  /** JSON-encoded CaptureProfile */
  profileJson: string;
  /** Private app storage directory */
  storageDir: string;
  /** UUID v4 meeting identifier */
  meetingId: string;
}

export interface AndroidStartRequest {
  // No parameters — state transition only
}

export interface AndroidPauseRequest {
  // No parameters
}

export interface AndroidResumeRequest {
  // No parameters
}

export interface AndroidStopRequest {
  // No parameters
}

export interface AndroidStatusRequest {
  // No parameters
}

export interface AndroidCancelRequest {
  // No parameters
}

// ── Command response types (Kotlin → JS) ──
//
// Every async function returns a JSON string.
// `{"status":"ok"}` on success, `{"status":"error","code":"...","detail":"..."}` on failure.

export interface AndroidOkResponse {
  status: 'ok';
}

export interface AndroidErrorResponse {
  status: 'error';
  code: string;
  detail?: string;
}

export type AndroidCommandResponse = AndroidOkResponse | AndroidErrorResponse;

// ── Status response (from status() function) ──

export interface AndroidStatusResponse {
  type: 'status';
  state: AndroidCaptureState;
  currentChunkIndex: number;
  bytesWritten: number;
  durationMs: number;
  storageAvailable: number;
}

export type AndroidCaptureState =
  'unconfigured' | 'configured' | 'recording' | 'paused' | 'stopping' | 'finalizing' | 'error';

// ── Extended chunk event (Android emits extra `format` field) ──
//
// The Android module adds a `format` field to distinguish raw PCM storage
// from the codec/container fields which describe what WILL be produced
// (opus/webm) once encoding is integrated.
//
// See AudioCaptureEngine.kt closeCurrentChunkInternal() for emission site.
// P09-T02-FUTURE: When Opus/WebM encoding is integrated, format changes to 'opus'.

export interface AndroidChunkEvent extends ChunkEvent {
  /** Storage format: 'pcm' for raw PCM, will become 'opus' after encoding integration. */
  format: 'pcm' | 'opus';
}

// ── Android event union (events emitted by the Kotlin module) ──

export type AndroidNativeEvent =
  | AndroidChunkEvent
  | DeviceEvent
  | InterruptEvent
  | StorageEvent
  | GapEvent
  | ErrorEvent
  | StatusResponse;

// ── Error codes that the Android module may return ──

export const AndroidErrorCodes = [
  'invalid_state',
  'invalid_profile',
  'permission',
  'read_error',
  'io_error',
  'disk_full',
  'timeout',
  'unknown',
] as const;

export type AndroidErrorCode = (typeof AndroidErrorCodes)[number];

// ── Mapping validation: Kotlin events → TS schema ──
//
// The Kotlin module emits events via Expo's sendEvent() with these names:
//   onChunk     → ChunkEvent (with format extension)
//   onDevice    → DeviceEvent
//   onInterrupt → InterruptEvent
//   onStorage   → StorageEvent
//   onGap       → GapEvent
//   onError     → ErrorEvent
//
// Each event payload follows the NativeEvent schema from contracts/events.ts
// wrapped in a v1 envelope: { version: 1, payload: NativeEvent }.
//
// Functions exposed by the Kotlin module:
//   configure(profileJson, storageDir, meetingId) → String (ok/error)
//   start()                                       → String
//   pause()                                       → String
//   resume()                                      → String
//   stop()                                        → String
//   status()                                      → String (StatusResponse JSON)
//   cancel()                                      → String
