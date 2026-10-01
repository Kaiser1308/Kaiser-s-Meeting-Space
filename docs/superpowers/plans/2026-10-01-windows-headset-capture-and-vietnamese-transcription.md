# Windows Headset Capture and Vietnamese Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Do not create a Git worktree. If subagents are selected, use Luna high and do not use Sol. The main agent owns integration, physical verification, evidence, and commits.

**Goal:** Make Windows headset capture report real source loss accurately and make verified multilingual Large Turbo the preferred local model for Vietnamese and English transcription.

**Architecture:** Native capture uses WASAPI device/QPC packet positions as the continuity clock; it separates durable source loss from bounded device diagnostics. The desktop consumes a typed health projection and warns, without changing endpoints, when the selected Bluetooth HFP microphone and A2DP loopback probably belong to one headset. The model work reuses the already-approved in-app catalog/manager design after its P14 dependency is directly verified.

**Tech Stack:** Rust `windows` WASAPI, Tokio bounded channels, SQLite source manifest, Electron 34 main/preload/React, TypeScript/Vitest, `whisper-rs`, packaged Windows harness.

## Global Constraints

- Authoritative design: `docs/superpowers/specs/2026-10-01-windows-headset-capture-and-vietnamese-transcription-design.md`.
- Existing in-app Large Turbo design/plan: `docs/superpowers/specs/2026-09-23-large-turbo-in-app-model-design.md` and `docs/superpowers/plans/2026-09-23-large-turbo-in-app-model.md`.
- Preserve immutable microphone/system source chunks. A derived timeline or diagnostic must never overwrite, remove, or silently pad source evidence.
- A source loss is only a positive-frame `CaptureHandoff::Gap`, a handoff overflow, a failed chunk commit/recovery gap, or a proven WASAPI device/QPC discontinuity.
- Diagnostics are content-free. Do not log or test with real meeting audio/transcript/title.
- Recording must work with no model installed and with network unavailable. No cloud/provider fallback or automatic model download is allowed.
- `vi` and `en` are explicit meeting languages. No automatic mixed-language detection.
- Before editing a symbol, run GitNexus `impact` upstream and stop/report if risk is HIGH or CRITICAL. Run a focused red test, minimal fix, focused green/regression suite, `detect_changes`, then stage only the task files and commit separately.
- The physical harness may use fixture playback only in a non-meeting test. Never play a fixture during a real meeting. A real meeting test requires explicit owner consent and must retain evidence rather than claiming success from console output.

## Dependency gates

| Workstream | Entry gate | Stop condition |
| --- | --- | --- |
| Capture Tasks 1–5 | An accepted corrective capture packet plus normal execution preflight | The current P20 packet is branding/export scope; do not implement capture changes under it or update P20 lifecycle/evidence. |
| Model Tasks 6–8 | `PROGRESS.md` and P14 evidence directly show P14 `VERIFIED`; independent provenance/signing prerequisites named in the existing Large plan are satisfied | P14 is currently `IMPLEMENTED`; record model work as blocked and do not edit P28 code until the gate is true. |
| Physical Tasks 9–10 | Packaged binary built from the green capture tasks, explicit opt-in, consented/synthetic source | Missing device/model/consent is `BLOCKED`, never simulated. |

## File Map

| Path | Responsibility |
| --- | --- |
| `native/crates/kms-native/src/capture/timeline.rs` | Device-position continuity and derived-only alignment state. |
| `native/crates/kms-native/src/capture/manager.rs` | Bounded handoff processing, source-loss/overflow counters, diagnostic aggregation, health projection. |
| `native/crates/kms-native/src/runtime.rs` | `capture_get_state` response boundary. |
| `apps/desktop/src/main.tsx` | Typed health rendering and non-blocking headset compatibility warning. |
| `apps/desktop/src/main.test.ts` | Renderer source-level regressions for health and warning copy. |
| `apps/desktop/src/main/windows-physical-recording-runner.ts` | Packaged-harness reading/assertion of raw health fields. |
| `apps/desktop/src/main/windows-physical-recording.test.ts` | Harness unit coverage for raw loss versus diagnostic warnings. |
| `apps/desktop/src/local-speech-client.ts` | Current default model binding used by transcript workflow. |
| `apps/desktop/src/transcription-workflow.ts` | Explicit language-to-verified-model transcription path. |
| `apps/desktop/src/main/local-model-manager.ts` and related files named in the existing Large plan | Deferred P28 verified download/activation lifecycle. |

---

### Task 1: Make derived continuity device-clock based

**Files:**

- Modify: `native/crates/kms-native/src/capture/timeline.rs`
- Modify: `native/crates/kms-native/src/capture/manager.rs`
- Test: inline Rust tests in both files

**Interfaces:**

- Consume: `CapturePacket { frames, device_position, qpc_position, format }` from `capture/wasapi.rs`.
- Produce: `TimelineAligner::align(samples, device_position, qpc_position, output_rate)` where a returned positive gap is proven by device/QPC progression, not manager wall time.

- [ ] **Step 1: Run GitNexus impact for `TimelineAligner.align` and `CaptureManager.start`; record callers/processes/risk in the task run record.**

- [ ] **Step 2: Add failing tests for the two facts being preserved.**

```rust
#[test]
fn delayed_dispatch_with_contiguous_device_positions_has_no_source_gap() {
    let mut aligner = TimelineAligner::new();
    let first = vec![0.25; 480];
    let second = vec![0.25; 480];
    assert_eq!(aligner.align(&first, 1_000, 10_000, 48_000).0, 0);
    std::thread::sleep(std::time::Duration::from_millis(150));
    assert_eq!(aligner.align(&second, 1_480, 10_010, 48_000).0, 0);
}

#[test]
fn missing_device_frames_create_one_exact_derived_gap() {
    let mut aligner = TimelineAligner::new();
    let block = vec![0.25; 480];
    let _ = aligner.align(&block, 1_000, 10_000, 48_000);
    let (gap, derived, state) = aligner.align(&block, 2_440, 10_030, 48_000);
    assert_eq!(gap, 960);
    assert_eq!(state.source_gap_count, 1);
    assert_eq!(derived.len(), 1_440);
}
```

- [ ] **Step 3: Run the narrow native test and confirm it fails because `align` still takes wall-clock-only input.**

```powershell
cd native
cargo +stable-x86_64-pc-windows-msvc test -p kms-native capture::timeline::tests
```

- [ ] **Step 4: Implement the minimal clock replacement.** Keep the first packet as the baseline. Compare consecutive `device_position` values after translating packet frames to the 48 kHz derived rate; accept normal contiguous advancement and create padding only for a positive, representable device-frame hole. Preserve QPC endpoints as diagnostic provenance; do not use `Instant` for source loss. Pass packet positions from each microphone/system dispatch branch.

- [ ] **Step 5: Run format, focused tests, and the full native local-speech suite.**

```powershell
cd native
cargo fmt --check
cargo +stable-x86_64-pc-windows-msvc test -p kms-native capture::timeline::tests
cargo +stable-x86_64-pc-windows-msvc test -p kms-native --features local-speech
```

- [ ] **Step 6: Detect staged changes and commit only the timeline/manager task.**

```powershell
git add -- native/crates/kms-native/src/capture/timeline.rs native/crates/kms-native/src/capture/manager.rs
git diff --cached --check
git commit -m "fix(native): align capture timing to WASAPI positions"
```

### Task 2: Aggregate packet diagnostics outside the capture hot path

**Files:**

- Modify: `native/crates/kms-native/src/capture/manager.rs`
- Modify: `native/crates/kms-native/src/storage.rs` only if a bounded aggregate record requires an additive schema operation
- Test: inline Rust tests in modified native files

**Interfaces:**

- Consume: `capture_packet_flag_reason(flags)` and `CapturePacket` source/device/QPC metadata.
- Produce: per-source `DiagnosticSummary { count, reasons, first_qpc, last_qpc }` flushed once per chunk/finalization boundary; raw `CaptureHandoff::Gap` remains immediate durable source-loss evidence.

- [ ] **Step 1: Run GitNexus impact for `record_durable_capture_event` and `CaptureManager.dispatch_message`; stop if the affected execution flow has HIGH/CRITICAL risk.**

- [ ] **Step 2: Add failing tests proving 100 repeated data-discontinuity flags create one bounded aggregate and no positive source gap.** Also assert a real overflow still persists its exact positive range immediately.

```rust
assert_eq!(health.microphone.diagnostic_count, 100);
assert_eq!(health.microphone.source_gap_count, 0);
assert_eq!(health.microphone.overflow_count, 0);
assert_eq!(diagnostic_rows_for("microphone", "CAPTURE_FLAG:data_discontinuity"), 1);
```

- [ ] **Step 3: Run the targeted manager tests and verify red.**

```powershell
cd native
cargo +stable-x86_64-pc-windows-msvc test -p kms-native capture::manager::tests
```

- [ ] **Step 4: Implement aggregation.** Store only counters/reasons/QPC and device ranges in the manager. Flush at the existing chunk commit/finalization boundary under the storage lock. Do not await SQLite for every packet flag; do not change `try_send` behavior in the realtime WASAPI thread. If persistence needs a count column/table, use an additive migration and preserve existing zero-width records for backward compatibility.

- [ ] **Step 5: Run the focused suite and regression suite; inspect output for content leakage.**

```powershell
cd native
cargo fmt --check
cargo +stable-x86_64-pc-windows-msvc test -p kms-native capture::manager::tests
cargo +stable-x86_64-pc-windows-msvc test -p kms-native --features local-speech
```

- [ ] **Step 6: Stage, run GitNexus change detection, and commit only this task.**

```powershell
git add -- native/crates/kms-native/src/capture/manager.rs native/crates/kms-native/src/storage.rs
git diff --cached --check
git commit -m "fix(native): aggregate capture device diagnostics"
```

### Task 3: Publish a typed raw capture-health contract

**Files:**

- Modify: `native/crates/kms-native/src/capture/manager.rs`
- Modify: `native/crates/kms-native/src/runtime.rs`
- Modify: `apps/desktop/src/main/windows-physical-recording-runner.ts`
- Modify: `apps/desktop/src/main/windows-physical-recording.test.ts`
- Test: native inline tests and `apps/desktop/src/main/windows-physical-recording.test.ts`

**Interfaces:**

```ts
type CaptureSourceHealth = {
  peak: number;
  sourceGapCount: number;
  missingSourceFrames: number;
  overflowCount: number;
  overflowFrames: number;
  diagnosticCount: number;
  diagnosticReasons: readonly string[];
  // Compatibility alias: exactly sourceGapCount.
  gapCount: number;
};
```

- [ ] **Step 1: Run GitNexus impact for `CaptureManager.get_metrics` and `Runtime.handle_capture_command`.**

- [ ] **Step 2: Add failing contract tests.** Verify `capture_get_state` returns the exact fields for both sources, `gapCount === sourceGapCount`, and the harness passes a diagnostic-only response but fails positive loss/overflow.

- [ ] **Step 3: Run narrow red tests.**

```powershell
cd native
cargo +stable-x86_64-pc-windows-msvc test -p kms-native capture::manager::tests
cd ..
pnpm.cmd --filter @kms/desktop exec vitest run src/main/windows-physical-recording.test.ts
```

- [ ] **Step 4: Implement the health projection and runner gate.** Keep old fields only as aliases. Update `readPhysicalCaptureGapSummary`/runner reporting so its `PASS` condition is raw positive source loss `0`, missing frames `0`, and overflow `0`; it must emit diagnostic totals as evidence without treating them as pass/fail substitution.

- [ ] **Step 5: Run tests and typecheck.**

```powershell
cd native
cargo +stable-x86_64-pc-windows-msvc test -p kms-native --features local-speech
cd ..
pnpm.cmd --filter @kms/desktop exec vitest run src/main/windows-physical-recording.test.ts src/main/windows-physical-full-pipeline.test.ts
pnpm.cmd --filter @kms/desktop typecheck
```

- [ ] **Step 6: Stage/detect/commit this contract task.**

```powershell
git add -- native/crates/kms-native/src/capture/manager.rs native/crates/kms-native/src/runtime.rs apps/desktop/src/main/windows-physical-recording-runner.ts apps/desktop/src/main/windows-physical-recording.test.ts
git diff --cached --check
git commit -m "feat(capture): distinguish source loss from diagnostics"
```

### Task 4: Render honest headset health and pairing warning

**Files:**

- Modify: `apps/desktop/src/main.tsx`
- Modify: `apps/desktop/src/main.test.ts`
- Create: `apps/desktop/src/headset-compatibility.ts`
- Create: `apps/desktop/src/headset-compatibility.test.ts`

**Interfaces:**

```ts
export function getHeadsetPairWarning(
  microphone: { id: string; label: string } | undefined,
  systemAudio: { id: string; label: string } | undefined,
): 'same_bluetooth_headset_profile_pair' | null;
```

- [ ] **Step 1: Run GitNexus impact for `App` and `handleStartMeeting`.**

- [ ] **Step 2: Add failing pure-function tests.** The R50i-style labels `Headset (2- soundcore R50i NC)` and `Headphones (2- soundcore R50i NC)` return the warning; different devices, default selections, and no-system-audio return `null`.

- [ ] **Step 3: Add failing renderer-source tests.** Require labels `SOURCE LOSS`, `OVERFLOW`, and `DEVICE DIAGNOSTICS`; forbid treating `diagnosticCount` as `sourceGapCount`; require warning copy explicitly says no endpoint will be changed automatically.

- [ ] **Step 4: Implement only presentation/state mapping.** Replace untyped `gapCount` display with the typed health fields. Show source loss/overflow prominently; show diagnostic count/reasons as warning telemetry. Render a non-blocking pre-start panel offering the three operator choices from the design; choosing an option changes no device except the user's explicit existing selector action.

- [ ] **Step 5: Run focused desktop tests and typecheck.**

```powershell
pnpm.cmd --filter @kms/desktop exec vitest run src/headset-compatibility.test.ts src/main.test.ts
pnpm.cmd --filter @kms/desktop typecheck
```

- [ ] **Step 6: Stage/detect/commit UI task.**

```powershell
git add -- apps/desktop/src/headset-compatibility.ts apps/desktop/src/headset-compatibility.test.ts apps/desktop/src/main.tsx apps/desktop/src/main.test.ts
git diff --cached --check
git commit -m "feat(desktop): warn on Bluetooth headset capture pairing"
```

### Task 5: Run capture integration gates before model work

**Files:**

- Modify only if direct results require an evidence-schema field: `apps/desktop/src/main/windows-physical-recording-runner.ts` and its tests.
- Create only direct run evidence after a command genuinely executes, in the evidence location named by the accepted corrective capture packet.

- [ ] **Step 1: Run full capture-focused regression.**

```powershell
cd native
cargo +stable-x86_64-pc-windows-msvc test -p kms-native --features local-speech
cd ..
pnpm.cmd --filter @kms/desktop exec vitest run src/main/windows-physical-recording.test.ts src/main/windows-physical-full-pipeline.test.ts src/main/windows-audio-pipeline.test.ts
pnpm.cmd --filter @kms/desktop typecheck
```

- [ ] **Step 2: Build a fresh Windows package with the local-speech feature enabled.** Do not reuse the package built without `--features local-speech`.

```powershell
cd native
cargo +stable-x86_64-pc-windows-msvc build -p kms-native --release --features local-speech
cd ..
pnpm.cmd --filter @kms/desktop exec electron-builder --win --config.directories.output=dist-packaged-headset-health
```

- [ ] **Step 3: Run the consented/synthetic 5-minute physical headset route.** Set explicit mic/system endpoint IDs and isolated artifact/user-data directories. Assert source gap count, missing source frames, and overflow count are all zero; report diagnostics separately. Do not run this during a live meeting or through headphones with fixture playback if it would disturb a user.

- [ ] **Step 4: If the 5-minute run fails, use systematic debugging.** Preserve the artifact, inspect only content-free metrics/IDs/timestamps, reproduce with the smallest synthetic route, add a regression test for the proven root cause, and return to Step 1. Do not lower thresholds, hide diagnostics, or call it passing.

- [ ] **Step 5: Stage only any task-scoped harness/evidence changes, run `detect_changes`, and commit.** Update only the corrective packet's evidence/state if its binary gates are directly evidenced; otherwise record `IMPLEMENTED`/open rows truthfully.

### Task 6: Enforce the P14/P28 model-work entry gate

**Files:**

- Read only: `docs/execution/PROGRESS.md`, `docs/execution/evidence/P14/EVIDENCE.md`, `docs/execution/phases/P28-*.md`, and the existing Large Turbo plan.

- [ ] **Step 1: Verify P14 directly.** If it is not `VERIFIED`, create no model code, model catalog, download state, or P28 evidence. Record the exact missing acceptance IDs and hand off the blocked model work.

- [ ] **Step 2: If and only if P14 is verified, perform P28 preflight.** Read the full packet and authoritative documents; establish catalog provenance/signing approval and a real model resource baseline exactly as required by `2026-09-23-large-turbo-in-app-model.md`.

- [ ] **Step 3: Execute Tasks 1–7 of the approved Large Turbo plan as their own commits.** That plan owns the catalog, typed main/preload bridge, resumable download manager, verified activation, default selection, model hash streaming, and model integration test. Do not reimplement it ad hoc in this capture plan.

### Task 7: Make Large Turbo the Vietnamese default at the workflow seam

**Files:**

- Modify: `apps/desktop/src/local-speech-client.ts`
- Modify: `apps/desktop/src/local-speech-client.test.ts`
- Modify: `apps/desktop/src/transcription-workflow.ts`
- Modify: `apps/desktop/src/transcription-workflow.test.ts`

**Prerequisite:** Task 6 has passed, so the model manager can resolve a verified catalog model rather than the renderer choosing a path.

- [ ] **Step 1: Run GitNexus impact for `transcribeMeeting` and `initLocalSpeechEngine`.**

- [ ] **Step 2: Add failing workflow tests.** For `{ language: 'vi' }`, assert the resolved binding has `modelId: 'whisper-large-v3-turbo-q5_0'`; assert English also prefers Large. Assert no verified model produces `MODEL_NOT_FOUND`, preserves recording data, and does not fall back to English Small or any provider.

- [ ] **Step 3: Implement resolver injection from the verified model manager.** The workflow accepts an opaque verified binding `{ modelId, modelPath, modelSha256 }`; it never accepts renderer-provided paths/URLs. Preserve the existing 300-second inference timeout and token-timestamp-disabled native path.

- [ ] **Step 4: Run focused tests and typecheck.**

```powershell
pnpm.cmd --filter @kms/desktop exec vitest run src/local-speech-client.test.ts src/transcription-workflow.test.ts
pnpm.cmd --filter @kms/desktop typecheck
```

- [ ] **Step 5: Stage/detect/commit this workflow task.**

```powershell
git add -- apps/desktop/src/local-speech-client.ts apps/desktop/src/local-speech-client.test.ts apps/desktop/src/transcription-workflow.ts apps/desktop/src/transcription-workflow.test.ts
git diff --cached --check
git commit -m "feat(desktop): prefer verified Large Turbo for Vietnamese"
```

### Task 8: Verify multilingual model behavior without real meeting content

**Files:**

- Create direct model evidence only after execution under `docs/execution/evidence/P28/local-model-download/`.
- Use existing synthetic fixture assets only; do not commit model binaries or recordings.

- [ ] **Step 1: Run catalog/download/activation tests from the approved Large plan.** Include cancelled download, wrong digest, missing disk space, interrupted/restarted manager, and offline transcription after verified installation.

- [ ] **Step 2: Run a short real-model inference on the same approved Vietnamese synthetic fixture for Small and Large.** Record model ID/hash, WER/CER, nonempty segment timing coverage, wall time, real-time factor, peak memory, and cancellation behavior. This is a measured smoke test, not a universal accuracy claim.

- [ ] **Step 3: Enforce acceptance.** Large is selected for `vi`; English-only Small cannot be silently selected; no network request occurs while recording; an unavailable model prevents only transcription.

- [ ] **Step 4: Run regressions, security review, `detect_changes`, and a task-scoped commit.** Do not mark P28 `VERIFIED`; P28-T07/T08 and release signing/provenance remain separate binary gates.

### Task 9: Physical Vietnamese transcript qualification

**Files:**

- Use existing `apps/desktop/src/main/windows-physical-full-pipeline-runner.ts` and tests only after their contracts have been updated for raw health.
- Create artifacts only under a fresh `apps/desktop/test-results/` path and phase evidence only after direct verification.

- [ ] **Step 1: Build a fresh package from all green capture/model tasks.** Verify sidecar feature availability and model hash before launch.

- [ ] **Step 2: Run a 5-minute test using owner-approved Vietnamese audio or a consented Vietnamese fixture.** Do not use a live meeting unless the owner explicitly authorizes that run. Require raw source gaps/missing frames/overflows zero, clean finalization, source chunk integrity, verified multilingual model, nonempty source transcript, and valid timestamp ranges.

- [ ] **Step 3: On any failure, preserve the artifact and classify it.** Device/handoff faults return to Tasks 1–5; model/quality faults return to Tasks 6–8. Do not use an English fixture/model to turn the Vietnamese gate green.

- [ ] **Step 4: Commit only task-scoped runner/test/evidence changes after all stated 5-minute binary gates pass.**

### Task 10: One-hour headset stability run

**Files:**

- Create a new immutable run artifact and metrics under `apps/desktop/test-results/` and the appropriate phase evidence directory only after it actually runs.

- [ ] **Step 1: Require Task 9 pass evidence.** If absent, do not start this run.

- [ ] **Step 2: Run exactly one 1-hour selected profile.** Monitor process tree, raw source-loss/overflow health, diagnostics, finalization, and transcript state. Do not start all duration profiles and do not run alongside a real meeting without explicit consent.

- [ ] **Step 3: Accept only direct evidence.** Pass requires zero raw source gaps, zero missing source frames, zero overflow, valid chunks/manifests, clean finalization, no process crash, and a verified transcript model/result. Diagnostics are reported by source/reason and are not erased.

- [ ] **Step 4: Complete phase/run evidence truthfully and stop.** If any binary gate is unavailable or fails, keep the relevant phase `IMPLEMENTED`/`IN_PROGRESS`; do not claim release readiness.

## Plan self-review

- Capture acceptance criteria map to Tasks 1–5 and 9–10; model default/download/integrity criteria map to Tasks 6–8.
- No task permits the current P14 `IMPLEMENTED` state to be treated as verified.
- Every product-code task has an explicit red/green test cycle, a scoped verification command, and a separate commit boundary.
- Physical tests are explicitly isolated from active meetings and do not replace a real device/model gate with a simulator.

## Execution handoff

This plan is intentionally not implementation authorization by itself. Capture execution requires an accepted corrective capture packet and its preflight; model execution remains blocked until P14 and P28 gates pass. Once the appropriate gate is open, choose one execution mode:

1. **Subagent-driven (recommended):** one fresh Luna high implementer per independent task, then separate task review.
2. **Inline execution:** execute sequential tasks in this session with review checkpoints.
