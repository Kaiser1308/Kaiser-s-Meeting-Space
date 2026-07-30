# P13 Real Speech Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulated Windows local STT path with bounded real whisper.cpp inference and close every automatable P13 local/Deepgram/evaluation gate without entering P14 or P28.

**Architecture:** Rust embeds whisper.cpp through `whisper-rs`, validates allowlisted model and app-private WAV source identity, and performs one fixed-language window at a time in a bounded blocking worker. TypeScript/Rust IPC changes atomically; Deepgram remains an independent consented cloud-live adapter using a server-held key exchanged for short-lived credentials.

**Tech Stack:** Rust 1.97.1, Tokio, whisper-rs 0.16, whisper.cpp CPU backend, hound 3.5, rubato 0.15, TypeScript 5.9, Zod 3.25, Vitest 4.1, Fastify, Deepgram WebSocket/API, Windows 11 x64.

## Global Constraints

- Meeting language is exactly `vi | en`; no automatic or mixed-language detection.
- Vietnamese uses allowlisted `ggml-small-q5_1.bin`; English uses allowlisted `ggml-small.en-q5_1.bin`.
- Model and audio files must resolve below configured app-private roots and match declared SHA-256 before use.
- Local inference runs CPU-only, one window at a time, with bounded threads/memory/queue and cancel acknowledgement target at most two seconds.
- Local STT performs no network request and never creates automatic cloud work.
- Logs/telemetry/errors contain no audio, transcript text, provider payload, credential, or model contents.
- Real outputs use `isSimulated: false`; fake/stub output never counts as P13 acceptance evidence.
- Existing thresholds remain: clean WER ≤18%, noisy WER ≤30%, timestamp p95 ≤1.5 seconds, local RTF ≤1.0, cancel ≤2 seconds.
- Do not implement P14 orchestration/reconciliation/completeness or P28 model lifecycle/import/mobile/local-live scope.
- P13 remains `IMPLEMENTED` while its accepted dependency/provider/device gates remain unverified.

---

## File Structure

- `packages/native-contract/src/local-speech.ts`: command payload and result schemas for local file-STT.
- `packages/native-contract/src/speech-manifest.ts`: fixed model-manifest contract.
- `native/crates/kms-native/src/local_speech/audio.rs`: secure WAV range loading, downmix, and 16 kHz resampling.
- `native/crates/kms-native/src/local_speech/backend.rs`: backend trait plus real whisper-rs implementation.
- `native/crates/kms-native/src/local_speech/model.rs`: normalized real segment type only.
- `native/crates/kms-native/src/local_speech/engine.rs`: bounded queue, capture priority, cancellation, progress, and backend coordination.
- `native/crates/kms-native/src/local_speech/manifest.rs`: canonical model verification and resolution.
- `native/crates/kms-native/src/runtime.rs`: IPC validation/dispatch and safe response mapping.
- `packages/speech/src/core/evaluation.ts`: content-free metric calculations and report schemas.
- `packages/speech/test/fixtures/corpus/`: frozen synthetic/consented audio manifest and ignored/local audio assets.
- `apps/api/src/modules/speech/`: Deepgram grant route and policy/security checks.
- `docs/execution/evidence/P13/`: generated qualification reports and truthful phase handoff.

### Task 1: Versioned IPC and verified model manifest

**Files:**

- Create: `packages/native-contract/src/local-speech.ts`
- Create: `packages/native-contract/src/local-speech.test.ts`
- Modify: `packages/native-contract/src/speech-manifest.ts`
- Modify: `packages/native-contract/src/speech-manifest.test.ts`
- Modify: `packages/native-contract/src/index.ts`
- Modify: `packages/native-contract/src/fixtures/golden.ts`
- Modify: `packages/native-contract/src/__tests__/conformance.test.ts`
- Modify: `native/crates/kms-native/src/local_speech/manifest.rs`

**Interfaces:**

- Produces: `LocalSpeechTranscribeWindowPayloadSchema`, `LocalSpeechSegmentSchema`, `LocalSpeechTranscribeWindowResultSchema`.
- Produces: manifest fields `byteLength`, `source`, `runtimeVersion`, `architecture`, `estimatedMemoryMb`.
- Consumes: existing `ModelManifestSchema`, `NativeRequestV1Schema`, SHA-256/path safety conventions.

- [ ] **Step 1: Add failing TypeScript contract tests**

```ts
expect(() =>
  LocalSpeechTranscribeWindowPayloadSchema.parse({
    runId: 'run-1',
    partIndex: 0,
    planHash: 'a'.repeat(64),
    sourcePath: 'audio/meeting.wav',
    sourceSha256: 'b'.repeat(64),
    startMs: 0,
    endMs: 5_000,
  }),
).not.toThrow();
expect(() =>
  LocalSpeechTranscribeWindowPayloadSchema.parse({
    runId: 'run-1',
    partIndex: 0,
    planHash: 'a'.repeat(64),
    startMs: 0,
    endMs: 5_000,
  }),
).toThrow();
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @kms/native-contract exec vitest run src/local-speech.test.ts src/speech-manifest.test.ts`

Expected: FAIL because the new schemas/required manifest fields do not exist.

- [ ] **Step 3: Implement strict Zod schemas and matching Rust manifest fields**

```ts
export const LocalSpeechTranscribeWindowPayloadSchema = z
  .object({
    runId: z.string().min(1).max(128),
    partIndex: z.number().int().nonnegative(),
    planHash: Sha256Schema,
    sourcePath: SafeRelativePathSchema,
    sourceSha256: Sha256Schema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  })
  .strict()
  .refine((value) => value.startMs < value.endMs, 'startMs must be before endMs');
```

Update golden fixtures atomically and reject stale payloads without source identity.

- [ ] **Step 4: Run GREEN and Rust manifest tests**

Run: `pnpm --filter @kms/native-contract test:unit`

Run: `cargo test -p kms-native local_speech::manifest`

Expected: both exit 0 with non-zero test counts.

- [ ] **Step 5: Commit only Task 1 files**

```powershell
git add -- packages/native-contract/src native/crates/kms-native/src/local_speech/manifest.rs
git commit -m "feat(speech): bind local STT to verified source and model manifests"
```

### Task 2: Secure WAV window decoder and resampler

**Files:**

- Create: `native/crates/kms-native/src/local_speech/audio.rs`
- Modify: `native/crates/kms-native/src/local_speech/mod.rs`
- Modify: `native/crates/kms-native/Cargo.toml`
- Modify: `native/Cargo.lock`

**Interfaces:**

- Produces: `AudioWindowRequest { source_path, source_sha256, start_ms, end_ms }`.
- Produces: `load_audio_window(request, audio_root) -> Result<AudioWindow, AudioError>`.
- Produces: `AudioWindow { samples_16khz_mono: Vec<f32>, source_start_ms, source_end_ms }`.

- [ ] **Step 1: Add failing Rust tests using generated WAV fixtures**

```rust
#[test]
fn loads_exact_range_and_downmixes_to_16khz_mono() {
    let fixture = write_pcm_wav(48_000, 2, 3_000);
    let window = load_audio_window(request(&fixture, 500, 1_500), fixture.root()).unwrap();
    assert_eq!(window.samples_16khz_mono.len(), 16_000);
    assert_eq!(window.source_start_ms, 500);
    assert_eq!(window.source_end_ms, 1_500);
}
```

Add separate tests for traversal, checksum mismatch, truncation, unsupported encoding, misaligned data, and range past EOF.

- [ ] **Step 2: Run RED**

Run: `cargo test -p kms-native local_speech::audio`

Expected: FAIL because `audio` and `load_audio_window` do not exist.

- [ ] **Step 3: Implement minimal secure loader**

Use `hound = "3.5"` for validated WAV sample decoding, canonicalize root/source, hash before decode, downmix deterministically, slice by integer sample indices, and resample through the existing `rubato` dependency. Never include a source path in `Display` errors.

- [ ] **Step 4: Run GREEN plus security regression**

Run: `cargo test -p kms-native local_speech::audio`

Expected: all audio boundary tests pass.

Run: `cargo test -p kms-native storage::tests::path_traversal_denied`

Expected: existing storage boundary remains green.

- [ ] **Step 5: Commit**

```powershell
git add -- native/crates/kms-native/Cargo.toml native/Cargo.lock native/crates/kms-native/src/local_speech/audio.rs native/crates/kms-native/src/local_speech/mod.rs
git commit -m "feat(speech): load verified WAV windows for local inference"
```

### Task 3: Real whisper.cpp backend

**Files:**

- Create: `native/crates/kms-native/src/local_speech/backend.rs`
- Modify: `native/crates/kms-native/src/local_speech/model.rs`
- Modify: `native/crates/kms-native/src/local_speech/mod.rs`
- Modify: `native/crates/kms-native/Cargo.toml`
- Modify: `native/Cargo.lock`

**Interfaces:**

- Produces: trait `SpeechBackend::transcribe(&mut self, request: BackendRequest) -> Result<Vec<SpeechSegment>, BackendError>`.
- Produces: `WhisperBackend::load(model_path, language, thread_count, stop_signal)`.
- Produces: `SpeechSegment { text, start_ms, end_ms, sequence_in_part, is_simulated }`.
- Consumes: `AudioWindow.samples_16khz_mono` from Task 2.

- [ ] **Step 1: Add failing backend contract tests**

```rust
#[test]
fn backend_request_fixes_language_and_offsets_timestamps() {
    let backend = RecordingBackend::default();
    let result = backend.transcribe(request("vi", 5_000)).unwrap();
    assert_eq!(backend.last_language(), "vi");
    assert_eq!(result[0].start_ms, 5_000);
    assert!(!result[0].is_simulated);
}
```

Add tests proving empty text is filtered, sequence is stable, and backend errors contain no transcript/model path.

- [ ] **Step 2: Run RED**

Run: `cargo test -p kms-native local_speech::backend`

Expected: FAIL because the backend trait and real segment type do not exist.

- [ ] **Step 3: Implement backend and remove production stub**

Add `whisper-rs = { version = "0.16", default-features = false }`. Load with
`WhisperContext::new_with_params`, create one state per request, use fixed
language and bounded threads, run `state.full`, then convert centisecond engine
timestamps into source milliseconds. Keep a test-only recording backend behind
`#[cfg(test)]`; production code must not call `transcribe_window_stub`.

- [ ] **Step 4: Build and run GREEN**

Run: `cargo test -p kms-native local_speech::backend`

Run: `cargo check -p kms-native`

Expected: both exit 0; native build links whisper.cpp on Windows.

- [ ] **Step 5: Commit**

```powershell
git add -- native/crates/kms-native/Cargo.toml native/Cargo.lock native/crates/kms-native/src/local_speech
git commit -m "feat(speech): embed whisper.cpp local transcription backend"
```

### Task 4: Bounded engine, cancellation, capture priority, and runtime IPC

**Files:**

- Modify: `native/crates/kms-native/src/local_speech/engine.rs`
- Modify: `native/crates/kms-native/src/runtime.rs`
- Modify: `native/crates/kms-native/src/protocol.rs`
- Modify: `packages/native-contract/src/events.ts`
- Modify: `packages/native-contract/src/__tests__/conformance.test.ts`

**Interfaces:**

- Consumes: Task 1 payload/result; Task 2 audio loader; Task 3 `SpeechBackend`.
- Produces: real `local_speech_event` lifecycle and response with `isSimulated: false`.
- Produces: engine state with queue/resource/capture-priority counters only.

- [ ] **Step 1: Add failing runtime/engine tests**

```rust
#[tokio::test]
async fn real_window_requires_source_identity_and_releases_permit_after_failure() {
    let first = runtime.dispatch(transcribe_without_source()).await;
    assert!(!first.success);
    let second = runtime.dispatch(valid_transcribe()).await;
    assert!(second.success);
}
```

Add tests for queue full, cancel before/during decode/backend, backend panic isolation, capture-active rejection, fixed language, and no path/text in errors.

- [ ] **Step 2: Run RED**

Run: `cargo test -p kms-native local_speech runtime::tests::dispatch_local_speech`

Expected: new tests fail against the simulated engine/current IPC.

- [ ] **Step 3: Implement bounded orchestration**

Inject backend factory and app-private roots into engine initialization; use a
single permit and `spawn_blocking`; check cancellation at queue/decode/backend
boundaries; pass the same atomic stop flag to Whisper's abort callback; convert
panics to safe errors; emit real progress/complete state only after result
validation.

- [ ] **Step 4: Run GREEN and native contract suite**

Run: `cargo test -p kms-native`

Run: `pnpm --filter @kms/native-contract test:unit`

Expected: all intended tests pass, no simulated production output remains.

- [ ] **Step 5: Commit**

```powershell
git add -- native/crates/kms-native/src packages/native-contract/src
git commit -m "feat(speech): run bounded cancellable local STT windows"
```

### Task 5: Frozen bilingual audio corpus and real evaluation runner

**Files:**

- Modify: `packages/speech/test/fixtures/corpus/corpus.manifest.json`
- Create: `packages/speech/src/core/local-evaluation-runner.ts`
- Create: `packages/speech/src/core/local-evaluation-runner.test.ts`
- Modify: `packages/speech/src/core/evaluation.ts`
- Modify: `packages/speech/src/core/evaluation.test.ts`
- Modify: `packages/speech/src/core/index.ts`
- Create: `scripts/p13-local-evaluation.mjs`
- Modify: `.gitignore`

**Interfaces:**

- Produces: corpus entries with `audioPath`, `audioSha256`, `provenance`, and optional timestamp anchors.
- Produces: `evaluateLocalCorpus(runtime, corpus) -> LocalEvaluationReport`.
- Consumes: real native responses from Task 4 and existing WER/report helpers.

- [ ] **Step 1: Add failing corpus/report tests**

```ts
expect(() =>
  FrozenCorpusEntrySchema.parse({
    id: 'clean-vi-01',
    language: 'vi',
    condition: 'clean',
    audioPath: 'audio/clean-vi-01.wav',
    audioSha256: 'a'.repeat(64),
    provenance: 'synthetic',
    referenceTranscript: 'Xin chào mọi người',
    audioDurationMs: 5_000,
  }),
).not.toThrow();
```

Test that missing audio/hash/provenance fails and that a simulated native result
cannot produce a passing evaluation report.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @kms/speech exec vitest run src/core/local-evaluation-runner.test.ts src/core/evaluation.test.ts`

Expected: FAIL because audio-bound corpus/runner does not exist.

- [ ] **Step 3: Implement runner and immutable local asset convention**

Add strict schemas and a script that checks every local audio file/hash, invokes
the sidecar for each entry, rejects `isSimulated`, calculates metrics, and writes
only content-free aggregate evidence. Ignore local WAV assets while committing
their manifest hashes/provenance.

- [ ] **Step 4: Run GREEN and real host evaluation when assets exist**

Run: `pnpm --filter @kms/speech test:unit`

Expected: schema/runner control tests pass.

Run: `node scripts/p13-local-evaluation.mjs`

Expected when complete assets are available: exit 0 and all fixed thresholds
pass. Otherwise: non-zero with explicit `missing_audio_asset`, recorded as an
external evidence blocker.

- [ ] **Step 5: Commit**

```powershell
git add -- .gitignore packages/speech scripts/p13-local-evaluation.mjs
git commit -m "test(speech): evaluate real bilingual local STT audio"
```

### Task 6: Deepgram live credential and provider qualification

**Files:**

- Modify: `apps/api/src/modules/speech/deepgram-grant.ts`
- Modify: `apps/api/src/modules/speech/deepgram-grant.test.ts`
- Modify: `apps/api/src/modules/speech/routes.ts`
- Modify: `apps/api/src/modules/speech/routes.test.ts`
- Modify: `packages/speech/src/deepgram/realtime-adapter.ts`
- Modify: `packages/speech/src/deepgram/realtime-adapter.test.ts`
- Create: `scripts/p13-deepgram-live.mjs`

**Interfaces:**

- Produces: short-lived grant bound server-side to authenticated owner/meeting/language/source policy.
- Consumes: rotated `DEEPGRAM_API_KEY` from process environment only.
- Produces: authorized vi/en live qualification report without content or credentials.

- [ ] **Step 1: Add failing policy/security tests**

```ts
it('never returns or logs the master key when the grant endpoint fails', async () => {
  const key = 'dg-test-master-secret';
  const response = await requestGrantWithProviderFailure(key);
  expect(JSON.stringify(response)).not.toContain(key);
  expect(capturedLogs()).not.toContain(key);
});
```

Add expiry/replay, owner mismatch, language mismatch, quota/rate-limit, provider
body redaction, recording-independence, and vi/en configuration tests.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @kms/api exec vitest run src/modules/speech`

Run: `pnpm --filter @kms/speech exec vitest run src/deepgram`

Expected: at least one new binding/redaction/live-qualification assertion fails.

- [ ] **Step 3: Implement minimal closure**

Keep the master key server-only, validate every binding before grant exchange,
return only the temporary token/expiry/config, normalize provider errors, and
add a live script that refuses the exposed historical key fingerprint and
requires a newly rotated environment secret.

- [ ] **Step 4: Run GREEN and authorized live matrix**

Run: `pnpm --filter @kms/api exec vitest run src/modules/speech`

Run: `pnpm --filter @kms/speech exec vitest run src/deepgram`

Run with rotated secret: `node scripts/p13-deepgram-live.mjs`

Expected: unit/contract tests pass; live script passes vi/en sessions or exits
non-zero with `rotated_deepgram_key_required`.

- [ ] **Step 5: Commit**

```powershell
git add -- apps/api/src/modules/speech packages/speech/src/deepgram scripts/p13-deepgram-live.mjs
git commit -m "feat(speech): qualify owner-bound Deepgram live sessions"
```

### Task 7: Integrated P13 qualification, evidence, and truthful handoff

**Files:**

- Create: `docs/execution/evidence/P13/RUN-20260728-P13-CLOSURE.md`
- Modify: `docs/execution/evidence/P13/EVIDENCE.md`
- Modify: `docs/execution/evidence/P13/local-speech-conformance.json`
- Modify: `docs/execution/evidence/P13/local-speech-evaluation.json`
- Modify: `docs/execution/evidence/P13/deepgram-conformance.json`
- Modify: `docs/execution/TRACEABILITY.md`
- Modify: `docs/execution/PROGRESS.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/architecture/AI_AND_SPEECH_PROVIDERS.md`
- Modify: `docs/operations/DEPLOYMENT_AND_RUNBOOK.md`

**Interfaces:**

- Consumes: reviewed outputs and exact commands from Tasks 1–6.
- Produces: acceptance-by-acceptance P13 evidence with no overstated gate.

- [ ] **Step 1: Run focused complete gates**

Run:

```powershell
pnpm --filter @kms/native-contract test:unit
pnpm --filter @kms/speech test:unit
pnpm --filter @kms/api exec vitest run src/modules/speech
cargo test -p kms-native
cargo clippy -p kms-native --all-targets -- -D warnings
```

Record exact exit codes, test counts, warnings, durations, and environment.

- [ ] **Step 2: Run real external gates**

Run:

```powershell
node scripts/p13-local-evaluation.mjs
node scripts/p13-deepgram-live.mjs
```

Record PASS only for real non-simulated execution. Record missing audio/key or
threshold failures as blocked/failed; do not substitute fixture results.

- [ ] **Step 3: Run security and change-scope checks**

Run secret/content scans defined in P13 evidence, inspect the built client
bundle, run GitNexus `detect_changes({scope:"compare", base_ref:"main"})`, and
verify only expected P13 symbols/flows changed.

- [ ] **Step 4: Run repository phase gate**

Run: `pnpm verify`

Expected: exit 0 with non-zero intended tests. If unrelated existing failures
remain, record their exact signatures and rerun every P13-focused command after
root-cause classification.

- [ ] **Step 5: Update evidence only from direct results**

Map P13-A01 through P13-A06 to exact artifacts. Keep P13 `IMPLEMENTED` unless
all dependency, real model/hardware/corpus, and Deepgram provider gates pass.
Remove the inaccurate claim that P28 owns the first real local engine.

- [ ] **Step 6: Commit evidence and handoff**

```powershell
git add -- docs/architecture/AI_AND_SPEECH_PROVIDERS.md docs/operations/DEPLOYMENT_AND_RUNBOOK.md docs/STATUS.md docs/execution/TRACEABILITY.md docs/execution/PROGRESS.md docs/execution/evidence/P13
git commit -m "docs(speech): record P13 real speech closure evidence"
```
