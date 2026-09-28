# Windows Audio and Full-Pipeline Harnesses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable Windows harnesses for real recording, simulated full-pipeline, and real full-pipeline runs at `5m`, `1h`, `3h`, or `4h`, while preserving the current simulator stability baseline.

**Architecture:** Extract packaged Electron/CDP launch, native IPC, timing, process monitoring, cleanup, and evidence writing into a shared Windows test kit. Keep scenario behavior in three profile runners and expose one CLI that selects exactly one profile and duration per invocation. Use a local scripted audio fixture with an immutable expected transcript; never use YouTube or a live meeting as baseline input.

**Tech Stack:** TypeScript, Vitest, packaged Electron 34, CDP WebSocket, Windows PowerShell/CIM, native `kms-native.exe`, WASAPI capture, local speech IPC, Markdown export, Node ESM CLI, and Windows SAPI only for one-time offline fixture generation.

## Global Constraints

- The existing simulated stability baseline remains a separate profile and is not replaced by the full-pipeline tests.
- Baseline audio input is a local, versioned scripted fixture with a matching expected transcript and no real meeting content.
- YouTube or other network media is exploratory/manual only and never a PASS/FAIL source.
- Real-audio profiles require explicit opt-in, isolated user-data, selected device identifiers, and a retention policy.
- Recording and baseline capture must not depend on network or AI availability; missing local speech prerequisites are `BLOCKED`, not PASS.
- Audio/source transcript fixtures are immutable after finalization; evidence stores hashes and aggregate metrics, not raw meeting-like content.
- Each invocation runs exactly one profile and one duration from `5m`, `1h`, `3h`, or `4h`.
- Evidence states are `PASS`, `FAIL`, or `BLOCKED`; shortened runs, crashes, missed samples, unknown cleanup, missing fixtures, or missing required models cannot be PASS.
- Do not promote P20 to `VERIFIED` from these harnesses alone and do not start P21.

---

### Task 1: Extract the shared packaged Windows test kit and profile/duration contracts

**Files:**

- Create: `apps/desktop/src/main/windows-test-kit.ts`
- Create: `apps/desktop/src/main/windows-test-kit.test.ts`
- Modify: `apps/desktop/src/main/windows-simulator-stability-runner.ts`
- Modify: `apps/desktop/src/main/windows-simulator-stability.test.ts`
- Create: `scripts/windows/windows-test-cli.mjs`
- Create: `scripts/windows/windows-test-cli.test.mjs`
- Create: `apps/desktop/src/main/windows-audio-pipeline.test.ts`
- Modify: `apps/desktop/package.json`

**Interfaces:**

- Produce `WindowsTestProfile = 'physical-recording' | 'simulator-full' | 'physical-full'`.
- Produce `WindowsTestDuration = '5m' | '1h' | '3h' | '4h'` and `parseWindowsTestDuration(value): { label: WindowsTestDuration; durationMs: number }` with exact values `300000`, `3600000`, `10800000`, and `14400000`.
- Produce `WindowsPipelineRunOptions` with `profile`, `durationMs`, `exePath`, `artifactDir`, `userDataDir`, optional fixture/device fields, and `allowRealAudio`.
- Produce a shared `PackagedElectronSession` exposing `evaluate`, `invokeNative`, `pollRenderer`, `sampleProcessTree`, `expectProcessExit`, `close`, and `writeEvidence`.
- Preserve the current `runWindowsSimulatorStability({ durationMs })` API and its existing summary assertions.

- [ ] **Step 1: Write failing contract tests**

  Add tests for duration parsing, rejection of unsupported durations/profiles, real-audio opt-in enforcement, and the shared session cleanup contract. Add a regression test proving the existing simulator runner still accepts the default five-minute duration and a configured three-hour duration without changing its simulator invariants.

- [ ] **Step 2: Run the narrow tests and record the expected failure**

  Run:

  ```powershell
  pnpm --filter @kms/desktop exec vitest run src/main/windows-test-kit.test.ts src/main/windows-simulator-stability.test.ts -t "duration|profile|cleanup|configured"
  pnpm exec vitest run scripts/windows/windows-test-cli.test.mjs
  ```

  Expected: the new module and parser tests fail because the shared interfaces and CLI do not exist yet; the existing simulator helper tests remain the reference behavior.

- [ ] **Step 3: Extract only reusable mechanics**

  Move CDP discovery, pending-command timeouts, renderer error collection, process-tree sampling, isolated directory creation, safe failure metadata, screenshot capture, and cleanup into `windows-test-kit.ts`. Parameterize duration and iteration count; do not move scenario-specific simulator assertions into the kit.

- [ ] **Step 4: Implement the selector CLI and dispatcher**

  Make `scripts/windows/windows-test-cli.mjs` parse `--profile` and `--duration`, set `KMS_WINDOWS_TEST_PROFILE` and `KMS_WINDOWS_TEST_DURATION`, and spawn the desktop Vitest command with `pnpm.cmd` on Windows. Reject missing or extra values before launching Electron. Add `test:windows` to `apps/desktop/package.json` as `node ../../scripts/windows/windows-test-cli.mjs`; the CLI must target `src/main/windows-audio-pipeline.test.ts`, whose dispatcher invokes exactly the selected profile runner.

- [ ] **Step 5: Run the narrow tests and typecheck**

  Run:

  ```powershell
  pnpm --filter @kms/desktop typecheck
  pnpm --filter @kms/desktop exec vitest run src/main/windows-test-kit.test.ts src/main/windows-simulator-stability.test.ts -t "duration|profile|cleanup|configured"
  pnpm exec vitest run scripts/windows/windows-test-cli.test.mjs
  git diff --check
  ```

  Expected: all new contracts pass and the existing five-minute simulator helper suite remains green.

- [ ] **Step 6: Commit the shared kit task**

  ```powershell
  git add apps/desktop/src/main/windows-test-kit.ts apps/desktop/src/main/windows-test-kit.test.ts apps/desktop/src/main/windows-simulator-stability-runner.ts apps/desktop/src/main/windows-simulator-stability.test.ts apps/desktop/src/main/windows-audio-pipeline.test.ts scripts/windows/windows-test-cli.mjs scripts/windows/windows-test-cli.test.mjs apps/desktop/package.json
  git commit -m "test(desktop): add selectable Windows pipeline test kit"
  ```

### Task 2: Add the local scripted audio fixture and quality comparator

**Files:**

- Create: `scripts/windows/generate-synthetic-meeting-fixture.ps1`
- Create: `apps/desktop/test-fixtures/synthetic-meeting/expected-transcript.json`
- Create: `apps/desktop/test-fixtures/synthetic-meeting/README.md`
- Create: `apps/desktop/src/main/windows-audio-fixture.ts`
- Create: `apps/desktop/src/main/windows-audio-fixture.test.ts`
- Create: `apps/desktop/src/main/windows-transcript-quality.ts`
- Create: `apps/desktop/src/main/windows-transcript-quality.test.ts`

**Interfaces:**

- Produce `AudioFixtureManifest` with `fixtureId`, `language`, `wavPath`, `wavSha256`, `durationMs`, `expectedTranscriptPath`, `expectedTranscriptSha256`, and `maxWer`/`minPhraseCoverage` thresholds.
- Produce `loadAudioFixture(root): AudioFixtureManifest`, `validateAudioFixture(manifest): void`, and `buildRepeatedTranscript(manifest, durationMs): ExpectedTranscript`.
- Produce `compareTranscript(actual, expected): { wer; cer; phraseCoverage; timestampCoverage; emptySegmentCount; pass; failureCodes }`.

- [ ] **Step 1: Write failing fixture and comparator tests**

  Test that the manifest rejects a changed WAV hash, changed transcript hash, wrong language, missing duration, and unsupported duration. Test comparator output for exact match, missing phrase, duplicate phrase, out-of-bounds timestamp, and empty transcript.

- [ ] **Step 2: Run the narrow tests**

  ```powershell
  pnpm --filter @kms/desktop exec vitest run src/main/windows-audio-fixture.test.ts src/main/windows-transcript-quality.test.ts
  ```

  Expected: FAIL because the fixture manifest and comparison functions are not implemented.

- [ ] **Step 3: Generate and freeze the offline fixture**

  Implement the PowerShell generator using local Windows SAPI only. It must write a WAV and JSON transcript from the fixed synthetic dialogue, print the voice name and SHA-256, and refuse network URLs. Commit the resulting fixture only after its hash and transcript are recorded in `README.md`; do not include personal or copyrighted audio.

- [ ] **Step 4: Implement the manifest and comparator**

  Validate the fixture before any real-audio launch. Compare normalized words for WER/CER, require every required phrase, require segment timestamps inside the recorded duration, and return safe failure codes without retaining transcript text in evidence. Use explicit fixture thresholds rather than a caller-controlled threshold.

- [ ] **Step 5: Run fixture tests and commit**

  ```powershell
  pnpm --filter @kms/desktop exec vitest run src/main/windows-audio-fixture.test.ts src/main/windows-transcript-quality.test.ts
  pnpm --filter @kms/desktop typecheck
  git diff --check
  git add scripts/windows/generate-synthetic-meeting-fixture.ps1 apps/desktop/test-fixtures/synthetic-meeting apps/desktop/src/main/windows-audio-fixture.ts apps/desktop/src/main/windows-audio-fixture.test.ts apps/desktop/src/main/windows-transcript-quality.ts apps/desktop/src/main/windows-transcript-quality.test.ts
  git commit -m "test(desktop): add deterministic Windows audio fixture"
  ```

### Task 3: Implement the real physical-recording profile

**Files:**

- Create: `apps/desktop/src/main/windows-physical-recording-runner.ts`
- Create: `apps/desktop/src/main/windows-physical-recording.test.ts`
- Create: `scripts/windows/play-audio-fixture.ps1`
- Modify: `apps/desktop/src/main/windows-test-kit.ts`

**Interfaces:**

- Consume `PackagedElectronSession`, `AudioFixtureManifest`, and the native commands `device_enumerate`, `storage_init`, `capture_start`, `capture_get_state`, and `capture_stop`.
- Produce `PhysicalRecordingSummary` with profile, duration, route, stable device labels, mic/system chunk counts, gap/overflow/drift totals, audio file hashes/byte counts, cleanup state, and `PASS|FAIL|BLOCKED`.

- [x] **Step 1: Write failing validation tests**

  Test that the runner returns `BLOCKED` unless `KMS_ALLOW_REAL_AUDIO=1`, `KMS_MIC_DEVICE_ID` is set, the selected device is present in `device_enumerate`, and the fixture validates. Test safe rejection of a missing playback executable and safe cleanup when capture start/stop fails.

- [x] **Step 2: Run the validation tests**

  ```powershell
  pnpm --filter @kms/desktop exec vitest run src/main/windows-physical-recording.test.ts -t "BLOCKED|device|fixture|cleanup"
  ```

  Expected: FAIL because the runner and playback helper do not exist.

- [x] **Step 3: Implement guarded fixture playback and capture control**

  Use PowerShell local WAV playback for the fixture and expose `speaker-to-mic` as the default physical route. Require explicit `KMS_MIC_DEVICE_ID` and optional `KMS_SYSTEM_DEVICE_ID`; never select the default device implicitly. Drive the packaged UI through CDP to choose Physical Capture, fill a synthetic title, and click Start/End meeting. Poll `capture_get_state` at 200 ms and sample process tree/health at 10 seconds.

- [x] **Step 4: Verify durable capture outputs**

  After stop, read only isolated user-data paths, verify the native canonical WebM/Opus EBML signature, non-zero bytes, manifest rows, SHA-256, byte lengths, contiguous chunk indices, clean finalization, and no orphaned files. Query the finalized SQLite `capture_gaps` rows for exact gap/overflow totals; never infer zero overflow from a clean stop. Physical source chunks are WebM/Opus, not WAV; Task 5 decodes only verified source chunks into temporary derived WAV windows for the existing local speech reader. Store hashes and counts in evidence, not audio bytes.

- [ ] **Step 5: Run the five-minute physical smoke only when explicitly enabled**

  ```powershell
  $env:KMS_ALLOW_REAL_AUDIO='1'
  $env:KMS_WINDOWS_TEST_PROFILE='physical-recording'
  $env:KMS_WINDOWS_TEST_DURATION='5m'
  $env:KMS_MIC_DEVICE_ID='<approved-device-id>'
  pnpm --filter @kms/desktop test:windows
  ```

  Expected: PASS only with an approved device and actual captured bytes; otherwise BLOCKED. Do not claim `1h`, `3h`, or `4h` until each is deliberately selected.

- [x] **Step 6: Commit the physical-recording task**

  ```powershell
  git add apps/desktop/src/main/windows-physical-recording-runner.ts apps/desktop/src/main/windows-physical-recording.test.ts docs/superpowers/plans/2026-09-22-windows-audio-pipeline-harnesses.md
  git commit -m "test(desktop): add guarded physical recording profile"
  ```

### Task 4: Implement the simulated full-pipeline profile

**Files:**

- Create: `apps/desktop/src/main/windows-simulator-full-pipeline-runner.ts`
- Create: `apps/desktop/src/main/windows-simulator-full-pipeline.test.ts`
- Modify: `apps/desktop/src/main/windows-test-kit.ts`
- Modify: `apps/desktop/src/main/windows-transcript-quality.ts`

**Interfaces:**

- Consume the simulator stability flow, the local fixture manifest, and the native storage/manifest/local-speech commands.
- Produce `FullPipelineSummary` with simulated capture counts, storage/manifest/finalization/reopen/export results, transcript metrics, `isSimulated` markers for simulator responses, and `PASS|FAIL|BLOCKED`.

- [ ] **Step 1: Write failing scenario tests**

  Test the required order `storage_init → simulator_configure → simulator_start_capture → repeated simulator_inject_event → simulator_stop_capture`, fixture materialization into isolated storage, local speech prerequisite handling, manifest/hash verification, reopen, and Markdown export verification.

- [ ] **Step 2: Run the focused scenario tests**

  ```powershell
  pnpm --filter @kms/desktop exec vitest run src/main/windows-simulator-full-pipeline.test.ts -t "order|manifest|reopen|export|BLOCKED"
  ```

  Expected: FAIL because the scenario runner does not exist.

- [ ] **Step 3: Implement the deterministic simulated pipeline**

  Drive the packaged app's simulated UI and native preload bridge. Keep simulator responses marked `isSimulated:true`; materialize only the approved fixture bytes into the isolated test storage for the transcription window, with a manifest entry and exact hash. Invoke the real local speech IPC when its model is available; if not, return BLOCKED rather than substituting a provider mock.

- [ ] **Step 4: Verify finalize/reopen/export and cleanup**

  Stop/reset the simulator, verify no active session, reopen the meeting record, run the existing Markdown exporter, validate output metadata, compare the transcript fixture, and assert no renderer/native errors or orphan files.

- [ ] **Step 5: Run the five-minute simulated full-pipeline smoke and commit**

  ```powershell
  $env:KMS_WINDOWS_TEST_PROFILE='simulator-full'
  $env:KMS_WINDOWS_TEST_DURATION='5m'
  pnpm --filter @kms/desktop test:windows
  git add apps/desktop/src/main/windows-simulator-full-pipeline-runner.ts apps/desktop/src/main/windows-simulator-full-pipeline.test.ts apps/desktop/src/main/windows-test-kit.ts apps/desktop/src/main/windows-transcript-quality.ts
  git commit -m "test(desktop): add simulated full-pipeline profile"
  ```

### Task 5: Implement the real full-pipeline profile

**Files:**

- Create: `apps/desktop/src/main/windows-physical-full-pipeline-runner.ts`
- Create: `apps/desktop/src/main/windows-physical-full-pipeline.test.ts`
- Modify: `apps/desktop/src/main/windows-physical-recording-runner.ts`
- Modify: `apps/desktop/src/main/windows-test-kit.ts`

**Interfaces:**

- Consume `PhysicalRecordingSummary`, `AudioFixtureManifest`, `compareTranscript`, and the existing end-meeting/transcription/export workflows.
- Produce `PhysicalFullPipelineSummary` with capture integrity, finalization, local speech initialization/transcription, WER/CER/phrase/timestamp metrics, reopen/export results, and `PASS|FAIL|BLOCKED`.

- [ ] **Step 1: Write failing full-pipeline tests**

  Test that the runner refuses to proceed when physical recording is not opted in, local model hashes do not match, or the captured source manifest is incomplete. Test that a complete fixture run requires finalized state before transcription and export.

- [ ] **Step 2: Run the focused tests**

  ```powershell
  pnpm --filter @kms/desktop exec vitest run src/main/windows-physical-full-pipeline.test.ts -t "BLOCKED|finalized|transcript|export"
  ```

  Expected: FAIL because the runner is not implemented.

- [ ] **Step 3: Implement the real pipeline sequence**

  Reuse the guarded physical runner, then initialize the declared local speech model through `local_speech_engine_init`, transcribe only verified source chunks with `local_speech_transcribe_window`, compare against the immutable expected transcript, reopen the finalized meeting, and invoke the existing Markdown export path. Do not contact cloud providers from this baseline.

- [ ] **Step 4: Implement strict result classification**

  Return BLOCKED for missing model, missing reader, unavailable device, or missing fixture. Return FAIL for captured-byte/hash/manifest mismatch, quality threshold failure, finalize failure, export mismatch, process crash, missed health sample, or cleanup uncertainty. Return PASS only when every binary criterion is directly evidenced.

- [ ] **Step 5: Run the five-minute real full-pipeline smoke only with explicit prerequisites and commit**

  ```powershell
  $env:KMS_ALLOW_REAL_AUDIO='1'
  $env:KMS_WINDOWS_TEST_PROFILE='physical-full'
  $env:KMS_WINDOWS_TEST_DURATION='5m'
  $env:KMS_MIC_DEVICE_ID='<approved-device-id>'
  pnpm --filter @kms/desktop test:windows
  git add apps/desktop/src/main/windows-physical-full-pipeline-runner.ts apps/desktop/src/main/windows-physical-full-pipeline.test.ts apps/desktop/src/main/windows-physical-recording-runner.ts apps/desktop/src/main/windows-test-kit.ts
  git commit -m "test(desktop): add physical full-pipeline profile"
  ```

### Task 6: Add selectable duration matrix tests and safe evidence output

**Files:**

- Modify: `scripts/windows/windows-test-cli.mjs`
- Modify: `apps/desktop/src/main/windows-*-pipeline.test.ts`
- Create: `apps/desktop/src/main/windows-pipeline-evidence.ts`
- Create: `apps/desktop/src/main/windows-pipeline-evidence.test.ts`
- Modify: `docs/execution/evidence/P20/RUN-20260922-windows-desktop.md`
- Modify: `docs/execution/PROGRESS.md`
- Modify: `docs/execution/TRACEABILITY.md`

**Interfaces:**

- Produce one sanitized evidence directory per run under `%TEMP%\kms-windows-pipeline-<profile>-<duration>-*`.
- Produce `summary.json`, `metrics.ndjson`, `events.ndjson`, and `error-summary.json` only with operational fields, hashes, aggregate transcript metrics, and safe error codes.
- Produce a matrix validator that recognizes exactly the four duration labels and never expands one invocation into multiple runs.

- [ ] **Step 1: Write evidence redaction tests**

  Assert that paths, transcript text, audio bytes, raw IPC payloads, device serials, and secrets are absent; assert that profile/duration/status/fixture hash/chunk counts/quality metrics/cleanup are retained.

- [ ] **Step 2: Run evidence tests**

  ```powershell
  pnpm --filter @kms/desktop exec vitest run src/main/windows-pipeline-evidence.test.ts
  ```

  Expected: FAIL until the result writer and redaction checks are implemented.

- [ ] **Step 3: Implement evidence and CLI selection**

  Make the CLI pass one profile and one duration into Vitest, make each profile write the common evidence contract, and preserve raw audio only in the explicitly isolated temporary run directory. Add no automatic matrix loop.

- [ ] **Step 4: Run the complete focused gate**

  ```powershell
  pnpm --filter @kms/desktop typecheck
  pnpm --filter @kms/desktop exec vitest run src/main/windows-test-kit.test.ts src/main/windows-audio-fixture.test.ts src/main/windows-transcript-quality.test.ts src/main/windows-simulator-stability.test.ts src/main/windows-physical-recording.test.ts src/main/windows-simulator-full-pipeline.test.ts src/main/windows-physical-full-pipeline.test.ts src/main/windows-pipeline-evidence.test.ts
  pnpm exec vitest run scripts/windows/windows-test-cli.test.mjs
  git diff --check
  ```

  Expected: all deterministic tests pass; hardware/model-dependent profiles are not claimed PASS unless their explicit runtime prerequisites exist.

- [ ] **Step 5: Record the capability without claiming unrun durations**

  Append the implementation status and exact invocation examples to the P20 run record, `PROGRESS.md`, and `TRACEABILITY.md`. Record each physical duration only after a direct run produces evidence; preserve `BLOCKED` outcomes with the missing prerequisite code.

- [ ] **Step 6: Commit the matrix/evidence task**

  ```powershell
  git add scripts/windows/windows-test-cli.mjs apps/desktop/src/main/windows-audio-pipeline.test.ts apps/desktop/src/main/windows-*-pipeline.test.ts apps/desktop/src/main/windows-pipeline-evidence.ts apps/desktop/src/main/windows-pipeline-evidence.test.ts docs/execution/evidence/P20/RUN-20260922-windows-desktop.md docs/execution/PROGRESS.md docs/execution/TRACEABILITY.md
  git commit -m "test(evidence): add selectable Windows audio pipeline matrix"
  ```

## Verification and handoff

After implementation, run one selected profile at a time. For each selected
duration, verify the process remains attached for the full monotonic duration,
inspect evidence directly, check for leftover Electron/native children, and
run GitNexus `detect_changes({scope: "staged"})` before each task commit. Stop
after handing off the selected run result; do not start the next phase.
