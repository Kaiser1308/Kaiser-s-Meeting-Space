# iOS Native Module Bridge — TS to Swift Interface Mapping

## Module Registration

The iOS native module is registered as `AudioRecorder` via:

- **expo-module.config.json** — Registers `AudioRecorderModule` for Expo autolinking
- **AudioRecorder.podspec** — CocoaPods spec for the Swift module

## Command Mapping

| Swift AsyncFunction | JS Method Signature                             | Return Type |
| ------------------- | ----------------------------------------------- | ----------- |
| `configure`         | `configure(profileJson, storageDir, meetingId)` | JSON string |
| `start`             | `start()`                                       | JSON string |
| `pause`             | `pause()`                                       | JSON string |
| `resume`            | `resume()`                                      | JSON string |
| `stop`              | `stop()`                                        | JSON string |
| `status`            | `status()`                                      | JSON string |
| `cancel`            | `cancel()`                                      | JSON string |

All commands return a JSON string serialized from `NativeCommandResponse`:

```json
{ "success": true, "correlationId": "...", "detail": "Recording" }
```

## Event Mapping

Events flow from Swift to JS via Expo's `sendEvent()`:

| Swift Event   | JS Event Name | Payload Type         |
| ------------- | ------------- | -------------------- |
| `onChunk`     | `onChunk`     | NativeChunkEvent     |
| `onDevice`    | `onDevice`    | NativeDeviceEvent    |
| `onInterrupt` | `onInterrupt` | NativeInterruptEvent |
| `onStorage`   | `onStorage`   | NativeStorageEvent   |
| `onGap`       | `onGap`       | NativeGapEvent       |
| `onError`     | `onError`     | NativeErrorEvent     |
| `onChunk`     | (status)      | NativeStatusResponse |

## Required Adapters for the JS Bridge

The TS bridge between the Expo NativeModule proxy and the NativeAudioModule interface
lives in `packages/mobile-audio/src/adapters/expo-module.ts` (P09-T04).

## Architecture

```
JS (Expo Modules Core)  →  AudioRecorderModule (Swift)
                                     ↓
                           AudioCaptureEngine (AVAudioEngine)
                                     ↓
                           AudioSessionHandler (AVAudioSession)
                                     ↓
                           IOSFileSystem / IOSClock / IOSChecksum (adapters)
```

## Key Constraints

1. **No blocking calls in audio tap callback** — The `installTap` callback runs on a
   real-time audio thread. Buffer pool acquisition and ring buffer push are the only
   operations performed.
2. **Preallocated buffer pool** — 64 `AVAudioPCMBuffer` slots, each ~4096 frames.
   No allocation in the tap callback.
3. **Ring buffer overflow** — Emits `onGap` with `buffer_overflow` reason.
   Bounded, never crashes.
4. **Writer thread** — Separate `DispatchQueue` with `.utility` QoS handles
   ring buffer drain, PCM→Opus encoding (via AudioConverter), and file I/O.
5. **Route/interruption changes** — Always close the current chunk before switching.

## Capture Profile

The configure command accepts a JSON profile. The native module validates:

- `sampleRate: 48000` (required)
- `channels: 1` (required)
- `codec: "opus"` (required)
- `container: "webm"` (required)
