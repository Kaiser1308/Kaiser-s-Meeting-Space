# Android Native Module: TypeScript Bridge Types

## Overview

This directory contains TypeScript types that document the JSON bridge
contract between the Android Kotlin native module (`AudioRecorderModule`)
and the JavaScript layer. The module is accessed through Expo's
`NativeModules` proxy at runtime.

## Module Name

The Kotlin module registers as `AudioRecorder` via `Name("AudioRecorder")`.
JS accesses it as `NativeModules.AudioRecorder`.

## Function Mapping

Each Kotlin `AsyncFunction` maps to a JS function that returns a Promise:

| Kotlin AsyncFunction                            | JS Call                                          | Return Type                    |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------ |
| `configure(profileJson, storageDir, meetingId)` | `NativeModules.AudioRecorder.configure(p, d, m)` | `string` (ok/error JSON)       |
| `start()`                                       | `NativeModules.AudioRecorder.start()`            | `string` (ok/error JSON)       |
| `pause()`                                       | `NativeModules.AudioRecorder.pause()`            | `string` (ok/error JSON)       |
| `resume()`                                      | `NativeModules.AudioRecorder.resume()`           | `string` (ok/error JSON)       |
| `stop()`                                        | `NativeModules.AudioRecorder.stop()`             | `string` (ok/error JSON)       |
| `status()`                                      | `NativeModules.AudioRecorder.status()`           | `string` (StatusResponse JSON) |
| `cancel()`                                      | `NativeModules.AudioRecorder.cancel()`           | `string` (ok/error JSON)       |

## Event Mapping

Events are emitted via Expo's `sendEvent()` and received in JS via
`NativeModules.AudioRecorder.addListener(eventName, handler)`:

| Event Name    | Payload Type        | Description                                |
| ------------- | ------------------- | ------------------------------------------ |
| `onChunk`     | `AndroidChunkEvent` | Chunk completed (includes `format: "pcm"`) |
| `onDevice`    | `DeviceEvent`       | Route/focus change                         |
| `onInterrupt` | `InterruptEvent`    | Interruption (call, alarm, etc.)           |
| `onStorage`   | `StorageEvent`      | Storage threshold warning                  |
| `onGap`       | `GapEvent`          | Audio gap (buffer overflow, route change)  |
| `onError`     | `ErrorEvent`        | Error (permission, I/O, disk full, etc.)   |

## Format Field

The Kotlin module's chunk events include a `format` field set to `"pcm"`
indicating the current storage is raw PCM. The `codec` and `container`
fields still report `"opus"` and `"webm"` respectively — these describe
what will be produced once Opus/WebM encoding is integrated
(P09-T02-FUTURE).

## Error Handling

All functions return `{"status":"ok"}` on success. On failure, they return
`{"status":"error","code":"...","detail":"..."}` with the following codes:

- `invalid_state` — Command not allowed in current state
- `invalid_profile` — Capture profile JSON parse/validation failure
- `permission` — Microphone permission denied
- `read_error` — AudioRecord read failure
- `io_error` — File I/O failure
- `disk_full` — No space for chunk write
- `timeout` — Operation timed out
- `unknown` — Unexpected error

## Files

- `types.ts` — Full type definitions for the Android JSON bridge
- `index.ts` — Re-exports for consumers

## See Also

- `packages/mobile-audio/src/contracts/commands.ts` — P09 command schemas
- `packages/mobile-audio/src/contracts/events.ts` — P09 event schemas
- `packages/mobile-audio/src/adapters/fake-module.ts` — Deterministic fake for testing
- `apps/mobile/modules/audio-recorder/android/` — Kotlin native module source
