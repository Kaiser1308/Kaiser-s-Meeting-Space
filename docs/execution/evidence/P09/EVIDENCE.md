# P09 Evidence

> Latest run supersedes the earlier no-device continuation: Android CPH2699/API
> 36 now has fresh native-start evidence, but P09 remains IMPLEMENTED until
> the physical interruption matrix and mandatory two-hour qualification pass.

Latest task continuation: [`RUN-20260925-1418.md`](RUN-20260925-1418.md) verifies
root Android autolinking and APK DEX inclusion of `AudioRecorderModule`. This
APK was not installed or run on-device and adds no physical recording evidence.

Latest run: [`RUN-20260806-1615.md`](RUN-20260806-1615.md).

The latest physical run directly verified native start and durable End
finalization through the Expo event bridge: the app reached `idle`, committed
one chunk, and reported a finalized local manifest. The interruption/route
matrix and mandatory two-hour qualification remain open, so P09 remains
IMPLEMENTED.

- Phase/state: P09 — IMPLEMENTED
- Latest qualification run: [`RUN-20260806-1325.md`](RUN-20260806-1325.md) — Android SDK/ADB is present but no physical device is attached; the physical interruption/route/background matrix and continuous two-hour session could not start. P09 remains IMPLEMENTED.
- Run record: `RUN-20260725-2150.md`
- Date/timezone: 2026-07-26 UTC+7
- Environment and exact tool versions: Node.js v24.18.0, pnpm 10.14.0, TypeScript 5.9.3, Vitest 4.1.10, React Native 0.81.4, Expo ~54.0.0, Zod 3.25.76, Windows 11 Pro 10.0.26200
- Starting and ending commit/tree: Starting: 2935261 + P00-P08 working tree. Ending: working tree (additive: `packages/mobile-audio/`, `apps/mobile/src/features/recording/`, `apps/mobile/modules/audio-recorder/`).
- Pre-existing dirty files preserved: All P00-P08 working-tree changes preserved.

## Requirement and acceptance mapping

| Requirement / acceptance ID | Test or scenario                                                                                 | Result                            | Artifact                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P09-A01                     | Every acknowledged mobile chunk survives crash/restart with exact checksum/sample metadata       | IMPLEMENTED (CI-grade)            | `recording-reducer.test.ts` (CHUNK_COMMITTED preserves sha256/byteLength/durationMs/monotonic bounds); `end-handshake.test.ts` (final chunk metadata); `contract.test.ts` (ChunkEvent schema validates all timing fields)                                                      |
| P09-A02                     | Pause/resume/end intervals and state/idempotency are exact under races                           | PASS                              | `recording-reducer.test.ts` (full lifecycle, pause/resume timeline entries, idempotent transitions, double-pause/end rejected); `recording-service.test.ts` (debounce rapid taps, double-end idempotent)                                                                       |
| P09-A03                     | Capture functions with network/providers absent and never logs content                           | PASS                              | A05 scan: no network/provider imports in any recording feature file; `fake-module.ts` (synchronous, no network I/O); `contracts/commands.ts` (versioned, correlation-ID tracked, content-free)                                                                                 |
| P09-A04                     | Supported Android/iOS physical interruption/route/background matrices pass declared limits       | IMPLEMENTED (native code written) | `AudioRecorderModule.kt` (focus/route handlers), `AudioSessionHandler.swift` (interrupt/route/media-reset) — physical device verification BLOCKED                                                                                                                              |
| P09-A05                     | Two-hour memory/buffer/storage/battery and control-latency budgets pass with every loss explicit | IMPLEMENTED (design verified)     | `AudioCaptureEngine.kt` (64-slot ring buffer, bounded), `AudioCaptureEngine.swift` (64-slot preallocated pool); `health-monitor.test.ts` (threshold warnings, estimated time); `end-handshake.test.ts` (timeout/crash/disk-full paths) — physical device qualification BLOCKED |

## Dependency-consumption evidence

Exposes to P10:

- `NativeAudioModule` interface + `createFakeAudioModule` (P10 upload transport integrates here)
- `RecordingService` (P10 Recovery Inbox integration: service exposes `subscribe()`, `getState()` for manifest recovery)
- `RecordingState` / `RecordingAction` types and `recordingReducer` (P10 consumes state for recovery/sync UI)
- `ChunkEvent`, `DeviceEvent`, `InterruptEvent`, `StorageEvent`, `GapEvent`, `ErrorEvent` types
- P07 adapter implementations: `AndroidFileSystem`, `AndroidClock`, `AndroidChecksum`, `IOSFileSystem`, `IOSClock`, `IOSChecksum`

Consumes:

- P07: `FileSystem`, `Clock`, `Checksum` contracts (platform adapters)
- P08: `CaptureStarter` seam, `StartMeetingCommand`, `TranscriptionPolicyV1`
- P02: `AudioChunk`, `PauseInterval`, `GapMarker`, `TimelineEvent`, `ManifestEntry` schemas

## Commands

| Command                                     | Exit code | Intended tests | Executed tests | Duration | Report                                                                                 |
| ------------------------------------------- | --------: | -------------: | -------------: | -------: | -------------------------------------------------------------------------------------- |
| `pnpm --filter @kms/mobile-audio test:unit` |         0 |             46 |             46 |    1.16s | contract + fake tests (1 file)                                                         |
| `pnpm --filter @kms/mobile test:unit`       |         0 |            175 |            175 |    4.00s | 22 test files (recording reducer, service, health, end-handshake + existing P08 tests) |
| `pnpm --filter @kms/mobile-audio typecheck` |         0 |            All |            All |      <5s | Clean                                                                                  |
| `pnpm --filter @kms/mobile typecheck`       |         0 |            All |            All |      <5s | Clean                                                                                  |

### Verification continuation — 2026-08-06

The package-local rerun recorded in [`RUN-20260806-1325.md`](RUN-20260806-1325.md)
passed `@kms/mobile-audio` 46/46 contract tests, `@kms/mobile` 247/247 tests,
and both package typechecks. It did not close the phase: `adb devices -l` had no
attached Android device, the Gradle wrapper could not download its requested
distribution, and `pnpm` could not open the workspace store SQLite database.
Therefore the required P09-T07 physical matrix and the integrated `pnpm verify`
gate remain unverified.

## Manual, device, and provider matrix

| Scenario                           | Environment/version                         | Result  | Artifact                                                         | Reviewer |
| ---------------------------------- | ------------------------------------------- | ------- | ---------------------------------------------------------------- | -------- |
| Physical device 2h recording (T07) | Android 12+ / iOS 17+                       | BLOCKED | Physical devices not available                                   | —        |
| Physical interruption matrix       | Phone call, Bluetooth, background on device | BLOCKED | Physical devices not available                                   | —        |
| Native compilation                 | Android Studio / Xcode                      | NOT RUN | `apps/mobile/modules/audio-recorder/` (7 Kotlin + 6 Swift files) | —        |
| Emulator basic capture             | Android Emulator / iOS Simulator            | NOT RUN | Emulators not configured                                         | —        |

## Security, privacy, and data-integrity review

- No secrets in any committed file
- All test fixtures are synthetic (fake module, fake file system operations)
- Content-free: native module events contain operational metadata only (chunk indices, sample counts, file paths, checksums). No audio data in any event payload, log, or error message.
- No network, provider, or database dependency: fake module is synchronous, recording service uses only local P07 FileSystem
- No hidden auto-recording: all capture requires explicit `start()` command after `configure()`
- Correlation IDs for all commands enable traceability without content exposure
- Audio callbacks use preallocated/pooled buffers (64 slots); ring buffer overflow emits `onGap` event, never crashes or exhausts memory
- SHA-256 checksums on all chunks for integrity verification
- No speech/translation/upload behavior: scope firewall enforced

## Defects and root-cause fixes

| Defect                                                                                         | Classification | Root cause                                                                                           | Regression test                                                | Fix commit   |
| ---------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------ |
| End handshake stuck in 'finalizing' (service checked 'stopping', reducer already transitioned) | Logic          | Reducer adds stopping→finalizing on CHUNK_COMMITTED; service's post-dispatch check used stale status | `end-handshake.test.ts` (successful handshake, debounce tests) | Working tree |
| Error events overwritten by subsequent OK actions                                              | Logic          | `startFails` error emitted synchronously but START_OK reset error to null                            | Added `errorDuringCommand` flag                                | Working tree |
| RECOVERY_TIMEOUT error message assertion mismatch                                              | Test           | "timed out" ≠ "timeout"                                                                              | `recording-reducer.test.ts`                                    | Working tree |
| Lifecycle test failed: FINALIZE_OK needs 'finalizing' state                                    | Logic          | CHUNK_COMMITTED during 'stopping' didn't transition to 'finalizing'                                  | Added stopping→finalizing in CHUNK_COMMITTED reducer case      | Working tree |

## Migration, rollout, rollback, and recovery

- P09 is strictly additive: new `packages/mobile-audio/`, `apps/mobile/src/features/recording/`, `apps/mobile/modules/audio-recorder/`
- No existing files were modified (except `apps/mobile/package.json` added `@kms/mobile-audio` dependency)
- Feature flag: `RecordingService` is instantiated only when `CaptureStarter.start()` is called from P08's meeting setup flow
- Rollback: remove `@kms/mobile-audio` dependency from mobile, remove `features/recording/` directory, revert `CaptureStarter` to fake
- Recovery Inbox integration (P10): `RecordingService.getState()` and `RecordingService.subscribe()` expose state for recovery UI

## Latest physical End fix

`RUN-20260806-1615.md` directly verifies the CPH2699 End/event bridge smoke:
the native chunk was finalized at 2,072,576 bytes and 21,252 ms, and the app
reached `idle` with one committed chunk and a finalized local manifest. This
does not close the phone-call/Bluetooth/full interruption matrix or P09-A05's
two-hour run; P09 remains IMPLEMENTED.

## Residual risks and owner actions

| Risk                                                     | Severity | Owner       | Action required                                                                                                               |
| -------------------------------------------------------- | -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Physical device qualification (P09-A04, P09-A05, T07)    | HIGH     | Engineering | Test on Android 12+ and iOS 17+ physical devices; verify 2h memory/storage/battery budgets and interruption matrix            |
| Opus/WebM encoding (PCM placeholder)                     | MEDIUM   | Engineering | Integrate Opus encoding via libopus JNI (Android) / AudioConverter (iOS); currently raw PCM wrapped in minimal WebM structure |
| Native compilation not verified                          | MEDIUM   | Engineering | Compile Android (Android Studio) and iOS (Xcode) native modules against Expo SDK 54                                           |
| No emulator tests run                                    | LOW      | Engineering | Configure Android emulator/iOS simulator for basic capture smoke tests                                                        |
| iOS thread safety (flags accessed from multiple threads) | LOW      | Engineering | Upgrade `Bool` flags to `os_atomic` or lock-free state machine before production                                              |

## Final state rationale

P09 is **IMPLEMENTED, not VERIFIED**. All CI-grade tasks (T01-T06) are complete:

- **221 tests** (46 mobile-audio + 175 mobile) across 23 test files, all passing
- **Typecheck** clean on both `@kms/mobile-audio` and `@kms/mobile`
- **15 native source files** created (7 Kotlin Android + 6 Swift iOS + 2 config)
- **3 TypeScript adapter stub files** created for Android/iOS bridge types

P09-A04 and P09-A05 require physical Android/iOS devices for the 2-hour capture, interruption matrix, and crash qualification. P09-T07 (physical device qualification) is explicitly blocked on device availability. The native code is structurally complete but has not been compiled against the platform SDKs.

P10 is unblocked: P09 provides the `RecordingService` state/subscription surface, chunk event types, and P07 platform adapters that P10's sync/recovery/lifecycle integration consumes.

## Latest qualification run

- [RUN-20260806-1615](RUN-20260806-1615.md): fixed the detached Expo event emitter and native writer finalization ordering. CPH2699/API 36 produced a durable 2,072,576-byte chunk and returned the UI to `idle` with one committed chunk and a finalized local manifest. P09 remains IMPLEMENTED because the phone-call/Bluetooth/full interruption matrix and P09-A05 two-hour run are still open.

- Continuation of [RUN-20260806-1615](RUN-20260806-1615.md): CPH2699 directly verified real camera microphone contention (focus loss -> paused -> focus gain -> Resume), repeated End with durable finalization, Bluetooth disable/enable route changes, and force-stop/relaunch truthful recovery. Wired route was not run because no wired/USB audio device was attached. Lock/unlock was not closed because the device remained on keyguard during the automated unlock attempt. P09-A05 two-hour capture remains NOT RUN; phase stays IMPLEMENTED, not VERIFIED.

- A05 retry (2026-08-07), appended to [RUN-20260806-1615](RUN-20260806-1615.md): after explicit recovery-discard authorization, a fresh synthetic `P09_A05_2h` capture ran on CPH2699. Native capture and writer progress were directly observed for approximately 44 minutes, reaching 277,909,504 accepted bytes, before two successive ADB checks returned no device. The two-hour duration, clean End, finalized manifest, and post-run budget checks remain unverified; no PASS claim was added.

- [RUN-20260730-1024](RUN-20260730-1024.md): Android SDK/JDK/ADB and authorized `CPH2699` verified; Expo autolinking recognized `audio-recorder (0.1.0)` and the focused native Kotlin compile passed. The full APK build failed in `expo-modules-core` CMake/Ninja due canonical pnpm path length; no APK was installed and no physical matrix was run. P09 remains IMPLEMENTED.
- [RUN-20260730-1047](RUN-20260730-1047.md): hoisted dependency layout resolved the CMake path blocker; native APK build, split ADB push/Package Manager install, and `MainActivity` launch passed on `CPH2699`. Runtime recording invocation and all physical qualification gates remain pending, so P09 remains IMPLEMENTED.
- [RUN-20260730-1100](RUN-20260730-1100.md): automated follow-up confirmed the UI preview/native wiring and dependency-runner blockers. No automated test pass or physical qualification claim was added; P09 remains IMPLEMENTED.
- [RUN-20260730-1133](RUN-20260730-1133.md): UI/native wiring, truthful PCM/raw contract handling, dependency-runner repair, automated tests, typechecks, and focused Kotlin compilation passed. A fresh full APK build remains blocked by Expo `expo-modules-core` CMake/Ninja path handling; no physical qualification claim was added and P09 remains IMPLEMENTED.
- [RUN-20260730-1155](RUN-20260730-1155.md): short-checkout/project-directory workaround produced a fresh APK with autolinked `audio-recorder`; installation was attempted but CPH2699 was disconnected/not visible to ADB. No runtime or physical qualification claim was added; P09 remains IMPLEMENTED.
- [RUN-20260730-1535](RUN-20260730-1535.md): CPH2699 reconnected and accepted the native debug APK; Metro bundle reached the app, but Expo dev-runtime errors left the UI blank. No recording or physical qualification claim was added; P09 remains IMPLEMENTED.
- [RUN-20260730-2212](RUN-20260730-2212.md): ADB enumerated CPH2699 as `unauthorized`; device property access and all physical recording scenarios were blocked before invocation. No physical qualification claim was added; P09 remains IMPLEMENTED.
- [RUN-20260925-1418](RUN-20260925-1418.md): repaired root Android autolinking, passed 254 mobile unit tests and typecheck, and built a release APK containing `AudioRecorderModule`. No device install or recording was performed; P09 remains IMPLEMENTED.
