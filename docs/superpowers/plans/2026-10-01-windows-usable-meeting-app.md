# Windows usable meeting app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Windows application record, report capture health, and transcribe Vietnamese/English locally through one truthful user flow.

**Architecture:** Native owns durable raw capture health and model verification; Electron forwards typed values; React and the physical harness consume the same fields. Capture remains independent of models and network.

**Tech Stack:** Rust/WASAPI/SQLite, Electron/TypeScript/React/Vitest, whisper-rs.

## Global Constraints

- Never modify immutable source chunks after capture.
- A diagnostic is not a source gap; only positive proven loss, overflow, or recovery failure fails integrity.
- Never auto-switch the user's audio endpoint.
- Recordings must finalize without network or an installed model.
- Use TDD and commit each completed task separately.

---

### Task 1: Publish typed raw capture health

**Files:** `native/crates/kms-native/src/capture/manager.rs`, `native/crates/kms-native/src/runtime.rs`, `apps/desktop/src/main/windows-physical-recording-runner.ts`, `apps/desktop/src/main/windows-physical-recording.test.ts`

**Interfaces:** Native `capture_get_state` returns `mic`/`sys` objects with `peak`, `sourceGapCount`, `missingSourceFrames`, `overflowCount`, `overflowFrames`, `diagnosticCount`, `diagnosticReasons`, and compatibility `gapCount` equal to `sourceGapCount`.

- [ ] Write Rust and Vitest failing tests: diagnostic-only health has zero source loss; any positive durable range or overflow fails the harness.
- [ ] Run the narrow Rust and Vitest tests; confirm failure is missing typed fields.
- [ ] Implement counters/projection in `CaptureManager.get_metrics`; forward unchanged in runtime; read raw fields in the harness and report diagnostics separately.
- [ ] Re-run `cargo +stable-x86_64-pc-windows-msvc test -p kms-native --features local-speech` and `pnpm.cmd --filter @kms/desktop exec vitest run src/main/windows-physical-recording.test.ts`.
- [ ] Run `detect_changes`, stage only these files, and commit `feat(capture): distinguish source loss from diagnostics`.

### Task 2: Render headset-safe recording health

**Files:** `apps/desktop/src/main.tsx` and its focused tests.

**Interfaces:** Consume Task 1 health without converting `diagnosticCount` to source loss. `headsetCompatibilityWarning(micLabel, systemLabel)` returns warning text only for matching Bluetooth headset base names.

- [ ] Write failing tests for matching `Headset (2- soundcore R50i NC)` / `Headphones (2- soundcore R50i NC)`, nonmatching endpoints, and typed health labels.
- [ ] Run focused desktop test and verify RED.
- [ ] Render `SOURCE LOSS`, `OVERFLOW`, and `DEVICE DIAGNOSTICS`; show a non-blocking warning stating endpoints are never changed automatically.
- [ ] Run focused test and desktop typecheck.
- [ ] Run `detect_changes`, stage task files, commit `feat(desktop): show truthful headset capture health`.

### Task 3: Complete local model-to-transcript path

**Files:** `native/crates/kms-native/src/local_speech/model.rs`, `apps/desktop/src/local-speech-client.ts`, `apps/desktop/src/transcription-workflow.ts`, relevant focused tests.

**Interfaces:** A verified installed Large Turbo model is selected by default for `vi` and `en`; missing/download/verification failure returns explicit user-visible state without affecting finalized recordings.

- [ ] Write failing tests for default verified Large Turbo selection and missing-model transcript result.
- [ ] Run focused tests and verify RED.
- [ ] Implement verified local selection/loading and explicit state mapping; retain Small as selectable fallback.
- [ ] Run local-speech Rust tests, desktop workflow tests, and typecheck.
- [ ] Run `detect_changes`, stage task files, commit `feat(transcript): default to verified large turbo`.

### Task 4: Verify selected Windows profile

**Files:** physical runner artifact directory only, created after a consented run.

- [ ] Build the packaged desktop application.
- [ ] Run exactly one explicitly selected profile with isolated storage and endpoints; never play fixtures during a live meeting.
- [ ] Require zero source loss, missing frames, and overflow; record diagnostics separately.
- [ ] If it fails, preserve content-free metrics, add a regression test for the root cause, and rerun only the selected profile.
- [ ] Commit only task-scoped harness/evidence changes after direct pass evidence.
