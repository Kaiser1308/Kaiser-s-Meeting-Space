# Online-headset Full-pipeline Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Windows E2E profile for online meetings with headphones: capture loopback and microphone separately, transcribe verified system audio locally, reopen the meeting, and export it.

**Architecture:** Extend the physical full-pipeline harness with a source-aware variant. `online-headset-full` starts both physical tracks and uses system audio as the transcript source. The existing `physical-full` profile remains microphone-source behavior.

**Tech Stack:** TypeScript, Vitest, Electron/CDP, Windows WASAPI sidecar, local Whisper, Node evidence files.

## Global Constraints

- Select exactly one duration per run: `5m`, `1h`, `3h`, or `4h`.
- Require explicit real-audio opt-in, selected connected mic and system loopback endpoints, a packaged app/sidecar, verified local model, and synthetic fixture.
- No real meeting content, provider, network speech service, or simulated inference.
- Preserve independent immutable microphone and system-audio sources.
- Headset runs require system-audio signal, chunks, hashes, zero gaps/overflows, clean finalize, transcript quality, reopen, export, and cleanup. Microphone silence is allowed; device/capture failure is not.
- Evidence must omit raw audio, transcript text, endpoint identifiers, paths, and secrets.
- Before every edit run GitNexus impact; stop for HIGH/CRITICAL. Before every commit use `detect_changes(scope:"staged")`.
- Preserve all pre-existing user changes and generated outputs.

---

## File Structure

- `apps/desktop/src/main/windows-test-kit.ts`: profile type/parser.
- `scripts/windows/windows-test-cli.mjs`: explicit command-line profile allowlist.
- `apps/desktop/src/main/windows-audio-pipeline.test.ts`: one-profile dispatcher.
- `apps/desktop/src/transcription-workflow.ts`: source-specific immutable manifest validation.
- `apps/desktop/src/main.tsx`: transcript-source selector controlled by the app.
- `apps/desktop/src/main/windows-physical-recording-runner.ts`: dual-source capture policy and sanitized source metrics.
- `apps/desktop/src/main/windows-physical-full-pipeline-runner.ts`: online-headset source-aware full E2E runner.
- Associated `*.test.ts` files: unit/regression coverage.

### Task 1: Register and dispatch the explicit headset profile

**Files:**

- Modify: `apps/desktop/src/main/windows-test-kit.ts:20-42`
- Modify: `apps/desktop/src/main/windows-test-kit.test.ts`
- Modify: `scripts/windows/windows-test-cli.mjs:5-30`
- Test: `scripts/windows/windows-test-cli.test.mjs`

**Interfaces:**

- Produces `WindowsTestProfile = 'physical-recording' | 'simulator-full' | 'physical-full' | 'online-headset-full'`.
- Task 4 adds dispatcher integration after its runner exists; this task stays independently buildable.

- [ ] **Step 1: Write the failing parser and CLI tests**

```ts
expect(parseWindowsTestProfile('online-headset-full')).toBe('online-headset-full');
expect(() => parseWindowsTestProfile('online-headset')).toThrow('unsupported_windows_test_profile');
```

```js
assert.deepEqual(parseWindowsTestCliArgs([
  '--profile', 'online-headset-full', '--duration', '5m',
]), { profile: 'online-headset-full', duration: '5m' });
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @kms/desktop exec vitest run src/main/windows-test-kit.test.ts && node --test scripts/windows/windows-test-cli.test.mjs`

Expected: FAIL because `online-headset-full` is unsupported.

- [ ] **Step 3: Add profile parsing, CLI allowlisting, and selected dispatch**

```ts
export type WindowsTestProfile =
  | 'physical-recording' | 'simulator-full' | 'physical-full' | 'online-headset-full';
```

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `pnpm --filter @kms/desktop exec vitest run src/main/windows-test-kit.test.ts && pnpm exec vitest run scripts/windows/windows-test-cli.test.mjs`

Expected: PASS; profile selection remains explicit at the CLI boundary.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- apps/desktop/src/main/windows-test-kit.ts apps/desktop/src/main/windows-test-kit.test.ts scripts/windows/windows-test-cli.mjs scripts/windows/windows-test-cli.test.mjs
git commit -m "feat(harness): register online headset profile"
```

### Task 2: Select an immutable transcript source through the app

**Files:**

- Modify: `apps/desktop/src/transcription-workflow.ts:25-190`
- Modify: `apps/desktop/src/transcription-workflow.test.ts`
- Modify: `apps/desktop/src/main.tsx:430-470,970-1045`
- Modify: `apps/desktop/src/main.test.ts`

**Interfaces:**

- Produces `type TranscriptSource = 'microphone' | 'system_audio'`.
- Extends `TranscriptionMeetingInput` with `source?: TranscriptSource`; omission means `microphone`.
- `TranscriptionWorkflowResult` returns `source: TranscriptSource`.
- App exposes `[data-testid="transcript-source-select"]`.

- [ ] **Step 1: Write failing source-validation tests**

```ts
await expect(transcribeMeeting(deps, {
  meetingId, language: 'en', source: 'system_audio',
})).resolves.toMatchObject({ source: 'system_audio', chunksTranscribed: 2 });

await expect(transcribeMeeting(depsWithOnlyMicChunks, {
  meetingId, language: 'en', source: 'system_audio',
})).rejects.toMatchObject({ code: 'TRANSCRIBE_FAILED' });

await expect(transcribeMeeting(depsWithMicChunks, { meetingId, language: 'en' }))
  .resolves.toMatchObject({ source: 'microphone' });
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter @kms/desktop exec vitest run src/transcription-workflow.test.ts`

Expected: FAIL because input has no source and code reads only microphone chunks.

- [ ] **Step 3: Implement source-specific manifest validation and app selector**

```ts
function readSourceEntries(value: unknown, meetingId: string, source: TranscriptSource) {
  const selected = validatedEntries(value).filter((entry) => entry.source === source).sort(byChunkIndex);
  if (selected.length === 0) throw new Error(`Capture manifest has no ${source} chunks`);
  // Validate contiguous indexes, positive byte length, SHA-256, and
  // chunks/${meetingId}_${source}_${NNN}.webm.
  return selected;
}
```

```tsx
<select data-testid="transcript-source-select" value={transcriptSource}
  onChange={(event) => setTranscriptSource(event.target.value as TranscriptSource)}>
  <option value="microphone">Microphone</option>
  <option value="system_audio">System audio</option>
</select>
```

Pass `transcriptSource` to the existing `transcribeMeeting` call. Keep the
default microphone source for normal UI behavior.

- [ ] **Step 4: Run tests and typecheck to verify GREEN**

Run: `pnpm --filter @kms/desktop exec vitest run src/transcription-workflow.test.ts src/main.test.ts && pnpm --filter @kms/desktop typecheck`

Expected: PASS; system audio is selected intentionally and default remains microphone.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- apps/desktop/src/transcription-workflow.ts apps/desktop/src/transcription-workflow.test.ts apps/desktop/src/main.tsx apps/desktop/src/main.test.ts
git commit -m "feat(transcription): select immutable source track"
```

### Task 3: Enforce the headset dual-source capture policy

**Files:**

- Modify: `apps/desktop/src/main/windows-physical-recording-runner.ts:24-760`
- Modify: `apps/desktop/src/main/windows-physical-recording.test.ts`

**Interfaces:**

- Extends `PhysicalRecordingOptions` with `requiredSources?: readonly ('microphone' | 'system_audio')[]` and `requireMicrophoneSignal?: boolean`.
- Produces per-source peak, gap, chunk, and integrity evidence.
- Existing physical recordings default to microphone-required and microphone-signal-required behavior.

- [ ] **Step 1: Write failing capture-policy tests**

```ts
expect(resolvePhysicalCapturePolicy({
  requiredSources: ['microphone', 'system_audio'], requireMicrophoneSignal: false,
})).toEqual({
  requiredSources: ['microphone', 'system_audio'],
  requireMicrophoneSignal: false, requiredSystemSignal: true,
});

expect(classifySourceHealth({ source: 'system_audio', peak: 0, gapCount: 0, required: true }))
  .toBe('system_audio_signal_missing');
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter @kms/desktop exec vitest run src/main/windows-physical-recording.test.ts`

Expected: FAIL because no capture policy or system-signal rule exists.

- [ ] **Step 3: Implement the policy without weakening current gates**

```ts
const policy = resolvePhysicalCapturePolicy(options);
// Require selected endpoints for policy.requiredSources.
// Sample peak/gap per source every interval.
// Reject any required-source gap or overflow.
// Reject system peak 0 whenever system_audio is required.
// Reject mic peak below threshold only when requireMicrophoneSignal is true.
```

Verify manifest filename, SHA-256, byte length, contiguous index, and clean
finalization for every required source. Preserve sanitized samples in
`recording/metrics.ndjson` on both pass and failure.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `pnpm --filter @kms/desktop exec vitest run src/main/windows-physical-recording.test.ts`

Expected: PASS; silent mic is accepted only for headset policy and never substitutes for system audio.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- apps/desktop/src/main/windows-physical-recording-runner.ts apps/desktop/src/main/windows-physical-recording.test.ts
git commit -m "feat(harness): enforce headset dual-source capture policy"
```

### Task 4: Add the online-headset full pipeline runner

**Files:**

- Modify: `apps/desktop/src/main/windows-physical-full-pipeline-runner.ts:1-760`
- Modify: `apps/desktop/src/main/windows-physical-full-pipeline.test.ts`
- Modify: `apps/desktop/src/main/windows-audio-pipeline.test.ts:1-38`

**Interfaces:**

- Produces `runOnlineHeadsetFullPipeline(options: PhysicalFullPipelineOptions): Promise<PhysicalFullPipelineSummary>`.
- Internal runner takes `{ profile, transcriptSource, capturePolicy }`.
- Headset settings are `profile: 'online-headset-full'`, `transcriptSource: 'system_audio'`, `requiredSources: ['microphone', 'system_audio']`, `requireMicrophoneSignal: false`.

- [ ] **Step 1: Write failing full-pipeline tests**

```ts
expect(() => sourceEntries({ meetingId, entries: [] }, 'system_audio')).toThrow(
  'capture_system_audio_chunks_missing',
);

expect(readTranscriptSourceSelectionExpression()).toContain('transcript-source-select');

expect(classifyOnlineHeadsetResult({
  recordingPassed: true, systemIntegrityVerified: true, systemSignalVerified: false,
  transcriptPassed: true, reopenVerified: true, exportVerified: true, cleanupVerified: true,
})).toBe('FAIL');
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter @kms/desktop exec vitest run src/main/windows-physical-full-pipeline.test.ts`

Expected: FAIL because headset helper/runner does not exist.

- [ ] **Step 3: Implement a parameterized physical full runner and headset wrapper**

```ts
export async function runOnlineHeadsetFullPipeline(options: PhysicalFullPipelineOptions) {
  return runPhysicalFullPipelineForSource(options, {
    profile: 'online-headset-full', transcriptSource: 'system_audio',
    capturePolicy: { requiredSources: ['microphone', 'system_audio'], requireMicrophoneSignal: false },
  });
}
```

Use CDP to select `system_audio` from `[data-testid="transcript-source-select"]`
and assert its selected value before clicking Transcribe. Compare transcript
quality only against verified system-audio chunks. Keep the public
`runPhysicalFullPipeline` as its existing microphone-source wrapper.

- [ ] **Step 4: Run full focused verification to verify GREEN**

Run: `pnpm --filter @kms/desktop exec vitest run src/main/windows-physical-full-pipeline.test.ts src/main/windows-audio-pipeline.test.ts && pnpm --filter @kms/desktop typecheck`

Expected: PASS; missing system chunks/signal, gaps, simulation, bad quality, reopen/export, or cleanup cannot pass.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- apps/desktop/src/main/windows-physical-full-pipeline-runner.ts apps/desktop/src/main/windows-physical-full-pipeline.test.ts apps/desktop/src/main/windows-audio-pipeline.test.ts
git commit -m "feat(harness): add online headset full pipeline"
```

### Task 5: Package and run the selected real headset gate

**Files:**

- Modify evidence/status files only after complete direct PASS evidence and only if the governing phase packet permits it.
- Never stage generated packages, models, target directories, test results, worktrees, or unrelated user changes.

**Interfaces:**

- Consumes the profile from Task 4 and explicitly supplied `KMS_MIC_DEVICE_ID`, `KMS_SYSTEM_DEVICE_ID`, and verified local-model variables.
- Produces `apps/desktop/test-results/online-headset-full-5m-<timestamp>/` evidence.

- [ ] **Step 1: Build release artifacts**

Run: `cargo +stable-x86_64-pc-windows-msvc build --manifest-path native/Cargo.toml --release --target-dir native/target -p kms-native --features local-speech && pnpm --filter @kms/desktop build:electron`

Expected: both exit 0. If an output is locked, identify the owning app process and package to a new named output; do not delete old results.

- [ ] **Step 2: Verify endpoint and model prerequisites**

Use packaged native `device_enumerate`, select connected mic and loopback endpoints, and verify configured model SHA-256. Do not silently substitute defaults.

- [ ] **Step 3: Run exactly one 5-minute profile with headphones**

```powershell
$env:KMS_ALLOW_REAL_AUDIO = '1'
$env:KMS_MIC_DEVICE_ID = '<selected-connected-mic-id>'
$env:KMS_SYSTEM_DEVICE_ID = '<selected-connected-loopback-id>'
$env:KMS_LOCAL_SPEECH_MODEL_PATH = '<verified-model-path>'
$env:KMS_LOCAL_SPEECH_MODEL_SHA256 = '<verified-model-sha256>'
$env:KMS_LOCAL_SPEECH_MODEL_ID = 'whisper-small-en-q5_1'
$env:KMS_PACKAGED_EXE = '<packaged-exe-path>'
$env:KMS_WINDOWS_FIXTURE_ROOT = (Resolve-Path 'apps/desktop/test-fixtures/synthetic-meeting').Path
$env:KMS_WINDOWS_ARTIFACT_DIR = Join-Path (Get-Location) ('apps/desktop/test-results/online-headset-full-5m-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
node scripts/windows/windows-test-cli.mjs --profile online-headset-full --duration 5m
```

Expected: PASS only with verified system loopback, real local inference, quality, reopen, export, and cleanup. A FAIL is retained as gate evidence; do not relax acceptance or report it as pass.

- [ ] **Step 4: Run complete automated verification**

Run: `pnpm --filter @kms/desktop exec vitest run --exclude src/main/packaged-app.smoke.test.ts && pnpm --filter @kms/desktop typecheck && cargo +stable-x86_64-pc-windows-msvc test --manifest-path native/Cargo.toml --target-dir native/target -p kms-native --features local-speech --quiet`

Expected: all commands PASS. Inspect top-level summary plus `recording/summary.json`, `recording/metrics.ndjson`, and `recording/events.ndjson` for the sanitized evidence contract.

- [ ] **Step 5: Commit verified source changes only**

Run GitNexus `detect_changes(scope:"staged")`, review all affected flows, then stage only source/test files owned by Tasks 1-4 and commit:

```powershell
git commit -m "test(harness): verify online headset full pipeline"
```

## Plan Self-Review

- Spec coverage: Tasks 1-4 cover explicit profile selection, immutable two-track capture, silent-mic policy, system-source UI transcription, transcript quality, reopen/export, and sanitized evidence; Task 5 is the real headset E2E gate.
- Placeholder scan: no deferred code or acceptance behavior is left unspecified; physical endpoint/model strings are runtime inputs because fabricating them would invalidate the evidence.
- Type consistency: Task 1 dispatches Task 4's public runner; Task 2 defines the source used by Task 4; Task 3 defines the policy consumed by Task 4.
