# P09 Recording Controls and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add local recording controls and truthful interrupted-session recovery to the Android P09 start flow, then qualify the result on CPH2699.

**Architecture:** Keep one `RecordingService` behind a small controller owned by `App`. The controller persists a content-free local session marker before native start, exposes pause/resume/stop/end/status, and marks an interrupted session on next launch when the marker remains. A dedicated recording screen renders only operational metadata and never audio content.

**Tech Stack:** React Native/Expo 54, TypeScript, Vitest, existing `RecordingService`, native `AudioRecorder`, Android ADB.

## Global Constraints

- Android is the sole gating mobile platform under ADR-007; iOS remains reserve/non-gating.
- Recording is local-first and must not depend on network/provider availability.
- Audio/source content and transcripts are immutable; tests use synthetic or silence fixtures only.
- Logs, markers, UI errors, and evidence remain content-free.
- No fake capture fallback on Android production runtime.

---

### Task 1: Controller contract and recovery marker

**Files:**

- Create: `apps/mobile/src/features/recording/controller/recording-controller.ts`
- Test: `apps/mobile/src/features/recording/controller/recording-controller.test.ts`

**Interfaces:**

- Consumes: `NativeAudioModule`, `RecordingService`, meeting id, local marker store.
- Produces: `initialize`, `start`, `pause`, `resume`, `stop`, `end`, `getSnapshot`, `dispose`.

- [ ] Write tests for start/pause/resume/stop transitions, repeated end idempotency, and an uncleared marker producing `interrupted` on initialization.
- [ ] Run the focused test and verify it fails because the controller does not exist.
- [ ] Implement the smallest controller that owns one service instance and persists only `{meetingId, startedAt, state}` in a local marker abstraction.
- [ ] Run the focused test and then the recording service tests.

### Task 2: Recording screen controls

**Files:**

- Create: `apps/mobile/src/features/recording/screens/RecordingControlsScreen.tsx`
- Test: `apps/mobile/src/features/recording/screens/RecordingControlsScreen.test.tsx`
- Modify: `apps/mobile/App.tsx`

**Interfaces:**

- Consumes: controller snapshot and controller commands.
- Produces: accessible controls with stable resource ids for ADB: pause, resume, stop/end, recovery, discard.

- [ ] Write component tests for recording, paused, interrupted, finalizing, and completed states; assert duplicate end is disabled while finalizing.
- [ ] Run focused component tests and verify the new screen fails before implementation.
- [ ] Implement the screen with operational metadata only: state, duration, chunk index, bytes, gap count/error code.
- [ ] Add App routing from native start to recording screen and create the controller once per native session.
- [ ] Run component tests, App typecheck, and the complete mobile suite.

### Task 3: Recovery and restart behavior

**Files:**

- Modify: `apps/mobile/src/features/recording/controller/recording-controller.ts`
- Modify: `apps/mobile/src/features/recording/screens/RecordingControlsScreen.tsx`
- Test: `apps/mobile/src/features/recording/controller/recording-controller.test.ts`

- [ ] Add tests proving an interrupted marker is visible after reinitialization, discard clears only the marker, and recover never fabricates completion.
- [ ] Run the focused recovery tests and verify the new cases fail first.
- [ ] Implement recovery actions: inspect native status, retain verifiable chunks, expose `interrupted` when status cannot prove a clean end, and clear the marker only after successful end/discard.
- [ ] Run all mobile recording/controller tests and typecheck.

### Task 4: Build and device qualification

**Files:**

- Update: `docs/execution/evidence/P09/RUN-20260806-*.md`
- Update: `docs/execution/evidence/P09/EVIDENCE.md`
- Update: `docs/execution/PROGRESS.md`
- Update: `docs/execution/TRACEABILITY.md`
- Update: `docs/STATUS.md`

- [ ] Build the release APK with Gradle 8.13, record hash, install on CPH2699/API 36, and verify the controls by UIAutomator.
- [ ] Run background/lock, microphone interruption, route changes, force-stop/restart, and repeated end with content-free ADB/logcat/AudioFlinger evidence.
- [ ] Run the synthetic/silence two-hour session while sampling memory, battery, storage, chunk counters, gaps, and control latency.
- [ ] Update phase evidence only with directly observed results; leave P09 IMPLEMENTED if any binary gate lacks evidence.
- [ ] Run full package tests, typechecks, execution-plan validation, and `git diff --check` before reporting status.
