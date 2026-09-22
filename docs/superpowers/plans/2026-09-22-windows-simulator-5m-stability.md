# Windows Simulator 5-Minute Stability Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chạy một bài kiểm thử Windows desktop dùng simulator trong đúng 300 giây, có tải chunk tổng hợp đều đặn, có health/process telemetry và kết luận pass/fail trung thực về độ ổn định.

**Architecture:** Giữ nguyên ranh giới simulator/native hiện có. Tạo một harness kiểm thử riêng cho desktop: khởi động app với user-data directory tạm, chọn `Simulated (P11)`, phát một `chunk_ready` mỗi 5 giây trong 60 vòng, chụp state/health và process metrics, sau đó stop/reset và kiểm tra artifact. Harness không dùng microphone, provider/AI, nội dung cuộc họp thật hoặc fake thiết bị production.

**Tech Stack:** Windows PowerShell, pnpm, Electron, Playwright, Vitest, Rust `kms-native`, SQLite/manifest hiện có, Docker chỉ khi một gate phụ thuộc service cần nó.

## Global Constraints

- Chỉ dùng dữ liệu tổng hợp; không ghi transcript, audio nguồn, secret, token hoặc nội dung meeting thật vào log/artifact.
- Chạy trên Windows x64; mọi lệnh Electron/CDP phải chạy serial để tránh race với packaged smoke test hiện có.
- Không sửa acceptance gate P20, không claim P20 `VERIFIED`, và không bắt đầu phase kế tiếp.
- Simulator response phải giữ `isSimulated: true`; crash/fault event chỉ dùng trong nhánh fault-injection riêng, không coi là pass của stability baseline.
- Tổng thời gian capture baseline là đúng 300 giây wall-clock; virtual time tăng 5.000 ms mỗi vòng và phải đạt 300.000 ms.
- Giữ toàn bộ untracked/generated files có sẵn trong worktree; chỉ stage file thuộc task đang thực hiện.

---

## Task 1: Lock Windows preflight and tool availability

**Files:**
- Read: `AGENTS.md`
- Read: `docs/execution/EXECUTION_PROTOCOL.md`
- Read: `docs/execution/PROGRESS.md`
- Read: `docs/execution/phases/P20-branding-export-library.md`
- Read: `apps/desktop/package.json`
- Read: `apps/desktop/playwright.config.ts`
- Verify: `package.json`, `pnpm-lock.yaml`, `native/Cargo.toml`
- Create later: `docs/execution/evidence/P20/RUN-YYYYMMDD-HHMM-windows-simulator-5m.md`

**Interfaces:**
- Consumes: existing desktop scripts `typecheck`, `test:unit`, `test:smoke`, `test:e2e`; Rust simulator commands.
- Produces: a locked environment record and a unique temporary artifact directory.

- [ ] **Step 1: Record repository state and versions**

Run:

```powershell
git status --short --branch
git diff --stat
git log -5 --oneline
node --version
pnpm --version
rustc --version
cargo --version
docker version --format '{{.Server.Version}}'
```

Expected: commands that are installed return versions; missing commands are recorded as unavailable rather than hidden.

- [ ] **Step 2: Install only missing test tools**

If dependencies are missing, run `pnpm install --frozen-lockfile`. If Playwright reports a missing browser, run `pnpm exec playwright install chromium`. Do not download a production model/provider or use a real audio device. Docker is optional for this run and is only started if the chosen desktop boot path requires the local service.

- [ ] **Step 3: Run the narrow preflight gates**

Run:

```powershell
pnpm --filter @kms/desktop typecheck
pnpm --filter @kms/desktop test:unit -- --runInBand
cargo test --manifest-path native/Cargo.toml -p kms-native simulator
```

Expected: exit code 0. If a command fails, stop and use the systematic-debugging workflow before changing the harness or product code.

- [ ] **Step 4: Create the run record before the long test**

Copy `docs/execution/templates/RUN_TEMPLATE.md` to the dated P20 evidence path. Record OS/build/tool versions, commit SHA, unique temp user-data path, exact start time, and the fact that the run is synthetic. Do not record meeting title, transcript, audio bytes, or raw application logs.

- [ ] **Step 5: Commit the preflight/evidence-template task**

Run `git diff --check`, inspect `git diff --name-only`, run GitNexus `detect_changes({scope: "staged"})`, then stage only the new run record and commit:

```text
test(windows): lock simulator stability run preflight
```

## Task 2: Add a bounded five-minute simulator stability harness

**Files:**
- Create: `apps/desktop/e2e/windows-simulator-stability.spec.ts`
- Create: `apps/desktop/e2e/support/windows-simulator-run.ts`
- Modify only if required: `apps/desktop/playwright.config.ts`
- Test against: `apps/desktop/src/main.tsx`
- Test against: `native/crates/kms-native/src/simulator.rs`

**Interfaces:**
- `runWindowsSimulatorStability(page, options): Promise<SimulatorRunSummary>`
- `SimulatorRunSummary` contains only operational fields: `startedAt`, `endedAt`, `elapsedMs`, `iterations`, `virtualTimeMs`, `chunkCount`, `stateTransitions`, `healthFailures`, `rendererErrors`, `expectedEventErrors`, `memorySamples`, `artifactDir`.
- The helper uses the existing UI controls and simulator contract; it must not expose or persist real meeting data.

- [ ] **Step 1: Write the failing test contract**

Add one Playwright test with a bounded timeout above five minutes. It must assert before implementation that the run summary has `elapsedMs >= 300000`, `iterations === 60`, `virtualTimeMs === 300000`, `chunkCount === 60`, final simulator state `idle`, and no unexpected renderer/runtime errors.

- [ ] **Step 2: Run the new test to establish the current failure**

Run:

```powershell
pnpm --filter @kms/desktop exec playwright test e2e/windows-simulator-stability.spec.ts --project=chromium --workers=1
```

Expected: the test is not yet runnable or fails because no five-minute harness/summary exists. Preserve this output in the task notes; do not weaken assertions.

- [ ] **Step 3: Implement the minimum deterministic loop**

The helper must:

1. Navigate to the desktop app and select the exact `Simulated (P11)` control.
2. Fill a synthetic title such as `Windows simulator stability run` and click `Start meeting`.
3. For `i = 0..59`, click the existing `Ready Chunk` simulator control (or call the equivalent existing test-only bridge), assert the response remains simulated, poll `simulator_get_state`, and record only counts/state/virtual time.
4. Pace iterations against a monotonic deadline so the wall-clock capture duration is exactly 300 seconds; do not use an unbounded sleep loop.
5. Sample the desktop/native process every 10 seconds: alive state, private working set, CPU time, and exit code if available. Write newline-delimited JSON with operational fields only.
6. Click `End meeting`, poll until idle, call reset, and write `summary.json` plus `summary.md` into a unique `%TEMP%\kms-windows-sim-5m-*` directory.
7. On failure, collect a sanitized screenshot and DOM/runtime error summary; never dump page HTML, transcript text, raw IPC payloads, or audio bytes.

- [ ] **Step 4: Add explicit assertions for stability and cleanup**

Assert: no renderer crash/page error, no unexpected console error, no failed simulator command, monotonic `virtualTimeMs`, exactly 60 successful chunk events, no unexplained gap/overflow count in the baseline, state transitions `idle -> capturing -> idle`, and no leftover active session after reset.

- [ ] **Step 5: Run the focused test and debug root causes**

Run the focused Playwright command again. For every failure, classify it as harness, desktop renderer, native simulator, packaging/boot, or environment; inspect the first causal error, make the smallest scoped fix, and rerun the focused test. Do not turn a real failure into an expected failure.

- [ ] **Step 6: Commit the harness task**

Before commit run `git diff --check`, the focused test, and GitNexus `detect_changes({scope: "staged"})`. Stage only the harness/config files and commit:

```text
test(desktop): add five-minute Windows simulator stability harness
```

## Task 3: Execute the 300-second Windows baseline run

**Files:**
- Modify: the dated P20 run record from Task 1
- Create: `docs/execution/evidence/P20/windows-simulator-5m/<run-id>/summary.json`
- Create: `docs/execution/evidence/P20/windows-simulator-5m/<run-id>/metrics.ndjson`
- Create: `docs/execution/evidence/P20/windows-simulator-5m/<run-id>/events.ndjson`
- Create on failure only: `error-summary.md`, sanitized screenshot

**Interfaces:**
- Consumes: the harness summary contract from Task 2 and the locked preflight from Task 1.
- Produces: directly verifiable operational evidence, not a release/phase-status upgrade.

- [ ] **Step 1: Start from a clean temporary app state**

Set a unique `KMS_TEST_USER_DATA` under `%TEMP%`, ensure no previous simulator process owns it, and launch the Windows desktop test with one worker. Never point the run at a real user profile or production data directory.

- [ ] **Step 2: Run the baseline for exactly 300 seconds**

Run:

```powershell
pnpm --filter @kms/desktop exec playwright test e2e/windows-simulator-stability.spec.ts --project=chromium --workers=1 --reporter=line
```

The test must remain attached for the full 300-second wall-clock interval, generate 60 synthetic chunks, then stop and reset cleanly. Record actual monotonic elapsed time, not only the test runner's nominal timeout.

- [ ] **Step 3: Evaluate binary baseline criteria**

Pass only if all are true: desktop/native process stays alive for 300 seconds; 60/60 chunk iterations succeed; virtual time is exactly 300.000 seconds; state transitions are valid; no unhandled renderer/native error occurs; no baseline gaps/overflows occur; memory samples do not show unbounded growth; stop/finalize/reset completes; temporary user-data and child processes are cleaned up; all evidence files exist and contain no meeting content or secrets.

Fail if any criterion is false, if the run is shortened, if the simulator is not actually selected, or if evidence cannot prove the criterion. A timeout, crash, missing sample, or unknown cleanup state is `FAIL/INCONCLUSIVE`, never pass.

- [ ] **Step 4: Record the result and preserve artifacts**

Append command, versions, timestamps, counts, resource min/max, exit codes, failure classification, and artifact paths to the run record. Keep raw logs in the temp artifact directory only after sanitization; link the evidence, not the raw meeting-like content.

- [ ] **Step 5: Commit the run evidence separately**

Run `git diff --check`, inspect only the run evidence diff, run GitNexus `detect_changes({scope: "staged"})`, then commit:

```text
test(evidence): record Windows simulator five-minute stability run
```

## Task 4: Run a short controlled fault-injection follow-up

**Files:**
- Modify: the same run record
- Create: `docs/execution/evidence/P20/windows-simulator-5m/<run-id>/fault-injection.json`

**Interfaces:**
- Consumes: simulator events `pause`, `resume`, `hot_plug`, `sleep_wake`, `gap_detected`, and `overflow` already implemented in `native/crates/kms-native/src/simulator.rs`.
- Produces: a separate diagnostic result; it must not contaminate the baseline pass/fail count.

- [ ] **Step 1: Run deterministic recovery scenarios**

In a fresh temporary user-data directory, start simulated capture, inject `pause -> resume`, `hot_plug -> hot_plug`, and `sleep_wake` with `advanceMs: 5000`, then stop. Record response success, final state, and expected event counts only.

- [ ] **Step 2: Run the negative crash scenario separately**

In another fresh directory, start capture, inject `crash`, assert the simulator reports `Error` and the UI shows the unavailable/error state, then reset. This is a recovery/containment check and is not a stability pass.

- [ ] **Step 3: Verify and commit the follow-up**

Run the focused fault test, `git diff --check`, and staged GitNexus `detect_changes()`. Commit only the follow-up artifact:

```text
test(evidence): record Windows simulator fault recovery checks
```

## Task 5: Complete phase-gated verification and handoff

**Files:**
- Modify after direct verification only: `docs/execution/evidence/P20/EVIDENCE.md`
- Modify after direct verification only: `docs/execution/TRACEABILITY.md`
- Modify after direct verification only: `docs/execution/PROGRESS.md`
- Modify after direct verification only: `STATUS.md`
- Modify after direct verification only: the P20 Windows test report

**Interfaces:**
- Consumes: Tasks 1-4 evidence and existing P20 open qualification rows.
- Produces: an honest handoff; it may leave P20 `IMPLEMENTED`/`IN_PROGRESS` and must not promote it to `VERIFIED` solely from simulator evidence.

- [ ] **Step 1: Run the complete applicable Windows gate serially**

Run:

```powershell
pnpm --filter @kms/desktop typecheck
pnpm --filter @kms/desktop test:unit
pnpm --filter @kms/desktop test:smoke
pnpm --filter @kms/desktop test:e2e -- --workers=1
cargo test --manifest-path native/Cargo.toml -p kms-native
```

Expected: each exit code and test count is recorded. Do not run concurrent Electron/CDP suites.

- [ ] **Step 2: Re-run the failing gate using systematic debugging**

For every failure, preserve the first causal stack/error, inspect the owning boundary, apply only an in-scope fix, rerun the narrow test, then rerun the complete gate. Missing real device/provider/manual reader evidence remains explicitly unavailable.

- [ ] **Step 3: Update evidence and traceability**

Only after direct verification, add the run ID, exact commands, pass/fail result, open limitations, and artifact links to P20 evidence/traceability/progress/status. Do not include raw logs or meeting content in tracked docs.

- [ ] **Step 4: Perform final verification before claiming completion**

Run:

```powershell
git diff --check
git status --short
pnpm execution:check
```

Run GitNexus `detect_changes({scope: "staged"})` before each evidence commit. Report the actual result and stop at the P20 handoff; do not start P21.
