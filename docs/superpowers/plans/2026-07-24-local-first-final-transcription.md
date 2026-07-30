# Local-First Final Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver desktop-first local final transcription as the default, retain explicit cloud live/final/check choices, and preserve immutable audio, transcript-run provenance, deterministic recovery, and phase-by-phase execution.

**Architecture:** Recording remains independent and local-first. A versioned meeting policy selects live and final behavior; every transcription attempt produces an immutable run and one or more immutable run parts. P13 supplies policy/run contracts, cloud live, desktop local file STT, deterministic window planning, and qualification. P14 owns durable final orchestration, cloud batch/window execution, reconciliation, and completeness. P16 owns comparison and human review. P28 adds advanced local capabilities without redefining the P13/P14 evidence model.

**Tech Stack:** TypeScript 5.9, Zod, Fastify, PostgreSQL/Drizzle, React Native/Expo, Electron/React, Rust desktop sidecar, Vitest, pnpm, whisper.cpp-compatible local engine, Deepgram cloud adapter.

## Global Constraints

- Execute the repository's current phase only. This plan changes future packets but does not authorize skipping from the current P05 work to P08 or P13.
- One Codex conversation executes one complete phase packet. The checkpoints below are internal review points, not extra conversations.
- Before each phase, follow `docs/execution/EXECUTION_PROTOCOL.md`, verify every dependency from `docs/execution/PROGRESS.md`, and create the required run record.
- Before editing an existing function, class, or method, run GitNexus upstream impact analysis for that symbol. Warn before HIGH or CRITICAL changes.
- Before any commit, run GitNexus `detect_changes({scope: "compare", base_ref: "main"})`.
- Audio and finalized source transcript events are immutable. Projections and user decisions are versioned derived artifacts.
- Recording cannot depend on network, speech providers, model availability, or generative AI.
- No cloud STT request may be created without the exact provider disclosure, consent record, and approved audio scope.
- Never implement automatic local-to-cloud fallback.
- Use synthetic or explicitly consented evaluation audio only. Do not commit meeting content, provider credentials, model binaries, or raw provider payloads.
- Do not claim physical-device, live-provider, minimum-hardware, offline, or two-hour gates passed without direct evidence.
- The initial deterministic window profile is `plannerVersion = "stt-window-v1"`, `windowMs = 300000`, and `overlapMs = 2000`. A provider may use a full-meeting batch only when its declared capability accepts the complete approved asset.
- Quality thresholds are fixed before tuning: clean/online WER `<= 0.18`, noisy-room WER `<= 0.30`, timestamp p95 `<= 1500 ms`, desktop local RTF `<= 1.0`, cancellation acknowledgement `<= 2000 ms`, and 100% expected-range accounting by canonical segment or explicit gap.
- The authoritative approved design is `docs/superpowers/specs/2026-07-24-local-first-final-transcription-design.md`.

---

## Work Package 0 — Migrate the Execution Control Plane

This package is a documentation/control-plane migration and may be executed before P08 only when explicitly authorized. It does not implement product code or mark a product phase verified.

### Task 0.1: Lock the new product and architecture contracts

**Files:**

- Modify: `docs/product/PRD.md`
- Modify: `docs/product/USER_FLOWS.md`
- Modify: `docs/architecture/API_CONTRACTS.md`
- Modify: `docs/architecture/DATA_MODEL.md`
- Modify: `docs/architecture/AI_AND_SPEECH_PROVIDERS.md`
- Modify: `docs/architecture/SYSTEM_ARCHITECTURE.md`
- Modify: `docs/security/SECURITY_AND_PRIVACY.md`
- Modify: `docs/engineering/TEST_STRATEGY.md`
- Reference: `docs/superpowers/specs/2026-07-24-local-first-final-transcription-design.md`

- [ ] Add the five reader-facing choices: record only, cloud live, local final, cloud final, and local plus approved cloud check.
- [ ] State that `TranscriptionPolicyV1` is authoritative and `speechMode` is compatibility-only.
- [ ] Add `TranscriptRun`, `TranscriptRunPart`, raw run events, projection lineage, consent scope, and `waiting_for_desktop` to the target data model.
- [ ] Document cloud full-meeting batch preference and deterministic overlapped-window fallback within the same consented scope.
- [ ] Document the distinction between local STT, local-only meetings, cloud-synchronized local STT, cloud STT, and cloud minutes AI.
- [ ] Add the fixed WER, timestamp, RTF, cancellation, coverage, resume, and no-cloud-contact gates.
- [ ] Run:

```powershell
pnpm exec prettier --check docs/product/PRD.md docs/product/USER_FLOWS.md docs/architecture/API_CONTRACTS.md docs/architecture/DATA_MODEL.md docs/architecture/AI_AND_SPEECH_PROVIDERS.md docs/architecture/SYSTEM_ARCHITECTURE.md docs/security/SECURITY_AND_PRIVACY.md docs/engineering/TEST_STRATEGY.md
```

Expected: exit 0 after formatting; no document says local final is a P28-only capability or that `api | local` fully describes policy.

- [ ] Commit:

```powershell
git add docs/product/PRD.md docs/product/USER_FLOWS.md docs/architecture/API_CONTRACTS.md docs/architecture/DATA_MODEL.md docs/architecture/AI_AND_SPEECH_PROVIDERS.md docs/architecture/SYSTEM_ARCHITECTURE.md docs/security/SECURITY_AND_PRIVACY.md docs/engineering/TEST_STRATEGY.md
git commit -m "docs: adopt local-first final transcription architecture"
```

### Task 0.2: Rewrite the five affected phase packets without renumbering

**Files:**

- Modify: `docs/execution/phases/P08-mobile-start-flow.md`
- Modify: `docs/execution/phases/P13-speech-deepgram.md`
- Modify: `docs/execution/phases/P14-finalization-backfill.md`
- Modify: `docs/execution/phases/P16-transcript-review.md`
- Modify: `docs/execution/phases/P28-local-ai-import-extension.md`
- Modify: `docs/execution/MASTER_PLAN.md`
- Modify: `docs/execution/TRACEABILITY.md`

- [ ] Preserve all existing `Pxx-Tnn`, `Pxx-Ann`, dependency IDs, and phase numbers unless a validator-backed packet migration explicitly adds acceptance rows.
- [ ] Rename P13's title/outcome from Deepgram realtime-only to provider-neutral cloud-live and desktop-local-file speech platform.
- [ ] Replace P13's prohibition on local Whisper with a boundary that permits one verified desktop file-STT model but keeps local live, mobile local, import, and advanced model lifecycle in P28.
- [ ] Extend P08 readiness and consent tasks with independent `live` and `final` policy choices.
- [ ] Extend P14 with mutually exclusive final-run orchestration, run parts, cloud-check sequencing, deterministic windows, and `waiting_for_desktop`.
- [ ] Extend P16 with provenance, run comparison, disagreement review, and exact evidence seek.
- [ ] Reduce P28 duplication: it must reuse P13/P14 contracts and retain mobile local, local live, advanced model lifecycle, and import.
- [ ] Update traceability so FR-1 covers policy/consent, FR-3 covers immutable runs/projections, and FR-4 covers final modes/completeness.
- [ ] Do not change `docs/execution/PROGRESS.md`; no phase execution occurred.
- [ ] Run the failing check before regenerating prompts:

```powershell
pnpm execution:generate:check
```

Expected: non-zero because generated prompt text no longer matches the modified packets.

### Task 0.3: Regenerate prompts and verify the phase graph

**Files:**

- Modify: `docs/execution/PHASE_PROMPTS.md`
- Verify: `scripts/execution/generate-phase-prompts.mjs`
- Verify: `scripts/execution/validate-execution-plan.mjs`

- [ ] Generate prompts from the packets:

```powershell
pnpm execution:generate
```

- [ ] Confirm the P13 prompt permits desktop local final STT and forbids automatic cloud fallback.
- [ ] Confirm the P14 prompt owns final orchestration and P16 owns review decisions.
- [ ] Confirm P28 remains optional and no P00-P27 phase depends on it.
- [ ] Run:

```powershell
pnpm execution:generate:check
pnpm execution:check
node --test scripts/execution/plan-model.test.mjs scripts/execution/generate-phase-prompts.test.mjs scripts/execution/validate-execution-plan.test.mjs
```

Expected: all commands exit 0 and all P00-P28 packets remain present.

- [ ] Commit:

```powershell
git add docs/execution/phases/P08-mobile-start-flow.md docs/execution/phases/P13-speech-deepgram.md docs/execution/phases/P14-finalization-backfill.md docs/execution/phases/P16-transcript-review.md docs/execution/phases/P28-local-ai-import-extension.md docs/execution/MASTER_PLAN.md docs/execution/TRACEABILITY.md docs/execution/PHASE_PROMPTS.md
git commit -m "docs: align speech phases with local-first final policy"
```

---

## Work Package P08 — Meeting Setup Policy and Consent

Execute this entire package only in the P08 conversation after P04 and P07 are VERIFIED.

### Task P08.1: Add the versioned policy to the shared meeting contract

**Files:**

- Modify: `packages/domain/src/meeting/schemas.ts`
- Modify: `packages/domain/src/meeting/schemas.test.ts`
- Modify: `packages/domain/src/index.test.ts`
- Modify: `packages/database/src/schema/meeting.ts`
- Add: `packages/database/drizzle/0006_transcription_policy.sql`
- Modify: `packages/database/src/repositories/meetings.ts`
- Modify: `packages/database/test/t01-core-schema.test.ts`
- Modify: `packages/database/test/t05-repositories.test.ts`

Canonical public schemas:

```ts
const LiveTranscriptionModeSchema = z.enum(['off', 'cloud']);
const FinalTranscriptionModeSchema = z.enum(['none', 'local', 'cloud', 'local_cloud_check']);
const CloudCheckScopeSchema = z.enum(['off', 'uncertain_ranges', 'full']);
const CloudConsentStateSchema = z.enum(['not_required', 'required', 'granted']);

const TranscriptionPolicyV1Schema = z.object({
  version: z.literal(1),
  language: MeetingLanguageSchema,
  live: LiveTranscriptionModeSchema,
  final: FinalTranscriptionModeSchema,
  cloudCheckScope: CloudCheckScopeSchema,
  cloudConsent: CloudConsentStateSchema,
});
```

- [ ] Write failing table tests for all valid and invalid mode/scope/consent combinations.
- [ ] Add `transcriptionPolicy` to `MeetingSettingsSchema`, defaulting new drafts to `live: off`, `final: local`, and `cloudCheckScope: off`.
- [ ] Implement `fromLegacySpeechMode('local' | 'api')`; it must never produce `cloudConsent: granted`.
- [ ] Add additive JSONB `transcription_policy` storage while preserving legacy `speech_mode` reads.
- [ ] Make repository writes persist both fields during the compatibility window and reads prefer valid policy JSON.
- [ ] Run:

```powershell
pnpm --filter @kms/domain test -- src/meeting/schemas.test.ts src/index.test.ts
pnpm --filter @kms/database test -- test/t01-core-schema.test.ts test/t05-repositories.test.ts
pnpm --filter @kms/domain typecheck
pnpm --filter @kms/database typecheck
```

Expected red: missing schemas/persistence. Expected green: all selected tests pass and legacy rows map without granting consent.

### Task P08.2: Implement the independent setup choices

**Files:**

- Add: `apps/mobile/src/features/meeting-setup/transcription-policy.ts`
- Add: `apps/mobile/src/features/meeting-setup/transcription-policy.test.ts`
- Add: `apps/mobile/src/features/meeting-setup/readiness.ts`
- Add: `apps/mobile/src/features/meeting-setup/readiness.test.ts`
- Modify or create under packet ownership: `apps/mobile/src/features/meeting-setup/`
- Modify: `apps/mobile/src/i18n/vi.ts`
- Modify: `apps/mobile/src/i18n/en.ts`

- [ ] Write reducer tests proving live and final choices are independent.
- [ ] Show local final as the default and cloud live as off.
- [ ] Treat missing desktop/model as non-blocking for recording; emit `waiting_for_desktop` or `waiting_for_model` processing readiness.
- [ ] Block any cloud option until named-provider disclosure and versioned consent are current.
- [ ] Ensure local final copy does not promise local-only storage.
- [ ] Ensure meeting translation remains a separate choice and creates no translation request in meeting-only mode.
- [ ] Run:

```powershell
pnpm --filter @kms/mobile test -- src/features/meeting-setup/transcription-policy.test.ts src/features/meeting-setup/readiness.test.ts
pnpm --filter @kms/mobile typecheck
```

Expected: reducer matrices pass for record-only, cloud-live/local-final, cloud-final, and local-cloud-check.

### Task P08.3: Finish P08 branch, accessibility, consent, and evidence gates

**Files:**

- Modify: `apps/mobile/e2e/`
- Modify: `docs/execution/evidence/P08/EVIDENCE.md`
- Modify only after direct verification: `docs/STATUS.md`
- Modify only after direct verification: `docs/execution/TRACEABILITY.md`
- Modify only after direct verification: `docs/execution/PROGRESS.md`

- [ ] Add E2E branches for every policy combination and provider/model/offline readiness state.
- [ ] Verify Vietnamese and English copy, large text, focus order, screen-reader labels, and consent disclosure.
- [ ] Prove provider/model failure does not call the fake capture stopper.
- [ ] Run the complete P08 gate from its updated packet, including `pnpm verify` and required physical-device cases.
- [ ] Record unavailable external gates as blockers; do not mark VERIFIED without binary evidence.
- [ ] Commit P08 only after the phase gate:

```powershell
git add packages/domain packages/database apps/mobile docs/execution/evidence/P08 docs/STATUS.md docs/execution/TRACEABILITY.md docs/execution/PROGRESS.md
git commit -m "feat: add explicit meeting transcription policy"
```

---

## Work Package P13 — Speech Platform, Local Engine, and Qualification

Execute this entire package in one P13 conversation after P06, P09, and P12 are VERIFIED. Use two internal checkpoints: contracts/model boundary, then adapters/evaluation.

### Task P13.1: Define immutable transcript-run and provider contracts

**Files:**

- Add: `packages/domain/src/transcript/runs.ts`
- Add: `packages/domain/src/transcript/runs.test.ts`
- Modify: `packages/domain/src/transcript/schemas.ts`
- Modify: `packages/domain/src/transcript/schemas.test.ts`
- Modify: `packages/domain/src/transcript/index.ts`
- Modify: `packages/domain/src/index.ts`
- Add: `packages/speech/package.json`
- Add: `packages/speech/tsconfig.json`
- Add: `packages/speech/vitest.config.ts`
- Add: `packages/speech/src/core/contracts.ts`
- Add: `packages/speech/src/core/contracts.test.ts`
- Add: `packages/speech/src/index.ts`

Canonical types:

```ts
type TranscriptRunKind = 'live' | 'final' | 'cloud_check';
type ExecutionLocality = 'local' | 'cloud';
type TranscriptRunState =
  | 'queued'
  | 'waiting_for_desktop'
  | 'waiting_for_model'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

type TranscriptRunPartKind = 'window' | 'full_batch';
```

`TranscriptRun` must bind owner, meeting, audio manifest/version, kind, locality, provider/engine/model/config version, language, requested ranges, consent/disclosure IDs when cloud is used, state, attempts, timestamps, and safe error.

`TranscriptRunPart` must bind run, ordinal, part kind, exact source ranges, overlap-before/after, planner version, attempt, native/provider job ID, and immutable raw-result SHA-256.

- [ ] Write failing parse tests for invalid locality/kind combinations, cloud run without consent, local run with provider disclosure, invalid ranges, and unsafe error content.
- [ ] Extend `TranscriptSegment` additively with `runId`, `runPartId`, source range identity, raw speaker label, and lineage fields.
- [ ] Define provider-neutral streaming and file interfaces without Deepgram or whisper.cpp SDK types.
- [ ] Run:

```powershell
pnpm --filter @kms/domain test -- src/transcript/runs.test.ts src/transcript/schemas.test.ts
pnpm --filter @kms/speech test -- src/core/contracts.test.ts
pnpm --filter @kms/domain typecheck
pnpm --filter @kms/speech typecheck
```

Expected: exact contract tests pass; public declarations contain no provider SDK imports.

### Task P13.2: Persist runs, parts, and raw events additively

**Files:**

- Add: `packages/database/drizzle/0007_transcript_runs.sql`
- Add: `packages/database/src/schema/transcript-runs.ts`
- Modify: `packages/database/src/schema/transcript.ts`
- Modify: `packages/database/src/schema/index.ts`
- Add: `packages/database/src/repositories/transcript-runs.ts`
- Modify: `packages/database/src/repositories/index.ts`
- Add: `packages/database/test/t08-transcript-runs.test.ts`

- [ ] Write failing integration tests for owner isolation, immutable completed rows, dedupe, stable ordinal, conflicting raw hash, and projection lineage.
- [ ] Create `transcript_runs`, `transcript_run_parts`, and `transcript_raw_events`.
- [ ] Use unique keys for `(run_id, ordinal, attempt)` and provider/native event identity.
- [ ] Do not replace the current transcript tables; add nullable lineage columns and backfill compatibility only.
- [ ] Make raw text/content unavailable to operational logs and job error payloads.
- [ ] Run:

```powershell
pnpm --filter @kms/database test -- test/t08-transcript-runs.test.ts test/t02-transcript-schema.test.ts test/t06-integrity.test.ts
pnpm --filter @kms/database typecheck
```

Expected: completed run parts reject mutation, replay is idempotent, and cross-owner reads return no data.

### Task P13.3: Implement deterministic window planning

**Files:**

- Add: `packages/speech/src/core/window-planner.ts`
- Add: `packages/speech/src/core/window-planner.test.ts`
- Add: `packages/speech/src/core/fixtures/window-manifests.ts`

Public function:

```ts
planTranscriptionWindows(input: {
  manifestVersion: string;
  sourceRanges: readonly SourceAudioRange[];
  engineProfile: string;
  plannerVersion: 'stt-window-v1';
  windowMs?: 300000;
  overlapMs?: 2000;
}): readonly PlannedTranscriptionWindow[]
```

- [ ] First write golden and property tests for zero duration, exact boundary, short meeting, pause/gap, multi-source, two-hour meeting, and repeatability.
- [ ] Ensure capture chunk boundaries never define STT windows.
- [ ] Ensure each expected range is covered, overlaps are explicit, and no non-overlap range is duplicated.
- [ ] Serialize a stable plan hash from canonical inputs.
- [ ] Run:

```powershell
pnpm --filter @kms/speech test -- src/core/window-planner.test.ts
```

Expected: identical input produces byte-identical windows and plan hash.

### Task P13.4: Add the minimal verified desktop model boundary

**Files:**

- Add: `packages/native-contract/src/local-speech.ts`
- Add: `packages/native-contract/src/local-speech.test.ts`
- Modify: `packages/native-contract/src/index.ts`
- Add: `native/kms-native/src/local_speech/mod.rs`
- Add: `native/kms-native/src/local_speech/manifest.rs`
- Add: `native/kms-native/src/local_speech/engine.rs`
- Add: `native/kms-native/src/local_speech/worker.rs`
- Add: `native/kms-native/tests/local_speech_contract.rs`
- Add: `config/speech-models/v1.json`
- Add: `docs/compliance/local-speech-model-register.md`

- [ ] Define allowlisted model metadata: language, engine/runtime compatibility, license, source, byte length, SHA-256, and minimum resource profile.
- [ ] Write TS/Rust golden-fixture tests before implementing IPC commands and events.
- [ ] Reject missing, corrupt, executable, path-escaping, wrong-language, incompatible-runtime, and unreviewed models.
- [ ] Implement bounded threads/memory/queue, progress, cancellation, and capture-priority yielding.
- [ ] Keep advanced resumable catalog, arbitrary switching, mobile models, and local live out of P13.
- [ ] Run:

```powershell
pnpm --filter @kms/native-contract test
pnpm --filter @kms/native-contract typecheck
cargo fmt --manifest-path native/kms-native/Cargo.toml --check
cargo clippy --manifest-path native/kms-native/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path native/kms-native/Cargo.toml local_speech
```

Expected: corrupt/incompatible models never activate and cancellation acknowledges within the fixture clock's 2-second boundary.

**Internal checkpoint:** review contracts, migrations, model licensing/provenance, native IPC blast radius, and capture-resource isolation before adapters are connected.

### Task P13.5: Implement Deepgram cloud live and its broker

**Files:**

- Add: `packages/speech/src/deepgram/realtime.ts`
- Add: `packages/speech/src/deepgram/realtime.test.ts`
- Add: `packages/speech/src/deepgram/normalization.ts`
- Add: `apps/api/src/modules/speech/routes.ts`
- Add: `apps/api/src/modules/speech/routes.test.ts`
- Add: `apps/api/src/modules/speech/session-service.ts`
- Modify: `apps/api/src/app.ts`
- Add under packet ownership: mobile and desktop derived-feed speech features

- [ ] Reuse the existing P13 broker requirements: owner, meeting state, language, source/mix ID, capability, expiry, budget, rate, allowlist, and region.
- [ ] Require `policy.live === 'cloud'` and a matching granted consent record.
- [ ] Keep interim events ephemeral; persist normalized final events under a `kind: live`, `locality: cloud` run.
- [ ] Prove disconnect, backpressure, quota, and provider outage do not stop or corrupt capture.
- [ ] Run:

```powershell
pnpm --filter @kms/speech test -- src/deepgram/realtime.test.ts
pnpm --filter @kms/api test -- src/modules/speech/routes.test.ts
pnpm --filter @kms/api typecheck
```

Expected: unauthorized/unconsented sessions are rejected before provider access; client bundles contain no master credential.

### Task P13.6: Connect the desktop local file adapter

**Files:**

- Add: `packages/speech/src/local/desktop-file.ts`
- Add: `packages/speech/src/local/desktop-file.test.ts`
- Modify: `packages/native-contract/src/local-speech.ts`
- Modify: `native/kms-native/src/local_speech/engine.rs`
- Add: `tests/contract/speech/local-file-conformance.test.ts`

- [ ] Write conformance tests using deterministic synthetic vi/en audio and a fake native transport.
- [ ] Submit one planned window at a time with exact manifest/range/overlap/model metadata.
- [ ] Persist immutable raw results and content-free operational results.
- [ ] Resume from the first incomplete run part and never rerun a completed part unless a new run is explicitly created.
- [ ] Prove no network call occurs in local fixtures.
- [ ] Run:

```powershell
pnpm --filter @kms/speech test -- src/local/desktop-file.test.ts
pnpm test:contract
cargo test --manifest-path native/kms-native/Cargo.toml local_speech
```

Expected: local file conformance passes, replay preserves completed part hashes, and network spies see zero calls.

### Task P13.7: Freeze and run bilingual quality/resource qualification

**Files:**

- Add: `tests/fixtures/speech/corpus-v1/manifest.json`
- Add: `tests/performance/speech/evaluate-transcript.ts`
- Add: `tests/performance/speech/evaluate-transcript.test.ts`
- Add: `docs/execution/evidence/P13/local-speech-evaluation.json`
- Modify after complete phase verification: `docs/execution/evidence/P13/EVIDENCE.md`

- [ ] Freeze corpus metadata and expected normalized words before adapter tuning.
- [ ] Cover vi/en clean online, noisy room, accents, silence, overlap, names, dates, numbers, currencies, boundary speech, and two-hour timing.
- [ ] Measure WER, timestamp p95, RTF, memory, CPU, cancellation, range coverage, and duplicate/out-of-order output.
- [ ] Run authorized Deepgram live synthetic tests separately; fixture tests cannot replace live evidence.
- [ ] Run the complete updated P13 gate, including `pnpm verify`, Rust gates, secret/content scans, and minimum-Windows-profile qualification.
- [ ] If any external gate is unavailable, leave P13 blocked with exact evidence; do not lower thresholds.
- [ ] Commit P13 only after direct verification:

```powershell
git add packages/domain packages/database packages/speech packages/native-contract native/kms-native apps/api apps/mobile apps/desktop config/speech-models docs/compliance tests docs/execution/evidence/P13 docs/STATUS.md docs/execution/TRACEABILITY.md docs/execution/PROGRESS.md
git commit -m "feat: add cloud-live and desktop local speech platform"
```

---

## Work Package P14 — Durable Final Runs and Reconciliation

Execute this entire package in one P14 conversation after P06, P10, and P13 are VERIFIED.

### Task P14.1: Route exactly one primary final mode

**Files:**

- Add: `apps/api/src/modules/transcription/final-run-service.ts`
- Add: `apps/api/src/modules/transcription/final-run-service.test.ts`
- Add: `apps/api/src/modules/transcription/routes.ts`
- Add: `apps/api/src/modules/transcription/routes.test.ts`
- Add: `packages/domain/src/transcript/finalization.ts`
- Add: `packages/domain/src/transcript/finalization.test.ts`
- Modify: `packages/domain/src/jobs/schemas.ts`

Public decision:

```ts
planFinalRun(policy, readiness):
  | { action: 'none' }
  | { action: 'queue_local' }
  | { action: 'queue_cloud' }
  | { action: 'waiting_for_desktop' }
  | { action: 'waiting_for_model' }
```

- [ ] Write tests proving local and cloud primary final runs are mutually exclusive.
- [ ] Create no cloud job without current consent and approved range.
- [ ] Never change a local failure into cloud work.
- [ ] Keep record-only valid with `final: none`.
- [ ] Gate translation/minutes until an authoritative projection is ready.
- [ ] Run:

```powershell
pnpm --filter @kms/domain test -- src/transcript/finalization.test.ts
pnpm --filter @kms/api test -- src/modules/transcription/final-run-service.test.ts src/modules/transcription/routes.test.ts
```

Expected: all policy/readiness combinations produce one explicit action.

### Task P14.2: Implement per-part durable execution and resume

**Files:**

- Add: `apps/worker/src/transcription/run-worker.ts`
- Add: `apps/worker/src/transcription/run-worker.test.ts`
- Add: `apps/worker/src/transcription/run-part-checkpoint.ts`
- Modify: `packages/database/src/repositories/transcript-runs.ts`
- Modify: `packages/database/src/repositories/jobs.ts`

- [ ] Write crash/retry tests at claim, audio assembly, engine/provider submit, raw persistence, checkpoint, and completion boundaries.
- [ ] Local final executes the deterministic P13 window plan per part.
- [ ] Cloud final first attempts `full_batch` only when declared limits accept the approved asset.
- [ ] Cloud batch fallback creates deterministic window parts using the same provider, consent, and audio scope.
- [ ] Completed part hashes are immutable; retry resumes only incomplete parts.
- [ ] Cancellation is durable and recoverable.
- [ ] Run:

```powershell
pnpm --filter @kms/worker test -- src/transcription/run-worker.test.ts
pnpm --filter @kms/database test -- test/t08-transcript-runs.test.ts
pnpm test:integration
```

Expected: fault injection never publishes a partial run as completed and never expands cloud scope.

### Task P14.3: Reconcile overlap boundaries into a versioned projection

**Files:**

- Add: `packages/speech/src/core/reconcile-overlap.ts`
- Add: `packages/speech/src/core/reconcile-overlap.test.ts`
- Add: `packages/speech/src/core/reconcile-run.ts`
- Add: `packages/speech/src/core/reconcile-run.test.ts`
- Add: `tests/fixtures/speech/reconciliation-v1/`

Public functions:

```ts
reconcileOverlap(left, right, {
  algorithmVersion: 'stt-reconcile-v1',
  overlapMs: 2000,
}): ReconciledBoundary

buildTranscriptProjection(run, parts, boundaries): TranscriptProjection
```

- [ ] Write golden cases for exact duplicate, punctuation difference, timestamp drift, missing word, extra word, homophone, speaker-label conflict, silence, and irreconcilable overlap.
- [ ] Use source-range identity, timestamps, and normalized token similarity; do not use generative rewriting.
- [ ] Retain ambiguous candidates for review instead of discarding them.
- [ ] Guarantee canonical ordering and exactly-once expected-range accounting.
- [ ] Never equate numeric speaker labels across separate windows without a versioned mapping.
- [ ] Run:

```powershell
pnpm --filter @kms/speech test -- src/core/reconcile-overlap.test.ts src/core/reconcile-run.test.ts
```

Expected: boundary corpus has neither lost speech nor duplicate canonical speech; ambiguous cases remain linked to both raw alternatives.

### Task P14.4: Add sequential cloud-check orchestration

**Files:**

- Add: `apps/api/src/modules/transcription/cloud-check-service.ts`
- Add: `apps/api/src/modules/transcription/cloud-check-service.test.ts`
- Add: `packages/speech/src/core/uncertain-ranges.ts`
- Add: `packages/speech/src/core/uncertain-ranges.test.ts`

- [ ] Require a completed local final run before cloud check.
- [ ] Detect suggestions from explicit gaps, missing/low confidence, overlap, low signal, and names/numbers/dates/currencies; confidence alone cannot decide correctness.
- [ ] Present suggestions before creating cloud work.
- [ ] Require user-approved `uncertain_ranges` or `full` scope plus provider disclosure and usage estimate.
- [ ] Persist cloud check as a separate `kind: cloud_check` run.
- [ ] Do not change the current projection automatically.
- [ ] Run:

```powershell
pnpm --filter @kms/speech test -- src/core/uncertain-ranges.test.ts
pnpm --filter @kms/api test -- src/modules/transcription/cloud-check-service.test.ts
```

Expected: unapproved or broader-than-approved ranges create zero provider jobs.

### Task P14.5: Publish truthful completeness and finish the phase

**Files:**

- Modify: `packages/domain/src/transcript/schemas.ts`
- Modify: `packages/database/src/schema/completeness.ts`
- Modify: `packages/database/src/repositories/transcript.ts`
- Add: `apps/api/src/modules/transcription/completeness-service.ts`
- Add: `apps/api/src/modules/transcription/completeness-service.test.ts`
- Modify after direct verification: `docs/execution/evidence/P14/EVIDENCE.md`
- Modify after direct verification: `docs/STATUS.md`
- Modify after direct verification: `docs/execution/TRACEABILITY.md`
- Modify after direct verification: `docs/execution/PROGRESS.md`

- [ ] Represent `waiting_for_desktop`, `waiting_for_model`, `processing`, `partial_ready`, `final_ready`, and explicit gaps.
- [ ] Count each expected timeline range once in the canonical projection or as an explicit gap.
- [ ] Preserve live, local final, cloud final, and cloud-check lineages separately.
- [ ] Run the complete P14 packet gate, fault matrix, replay tests, two-hour accounting, `pnpm verify`, and all directly required external cases.
- [ ] Commit only after the phase's binary gates:

```powershell
git add packages/domain packages/database packages/speech apps/api apps/worker tests docs/execution/evidence/P14 docs/STATUS.md docs/execution/TRACEABILITY.md docs/execution/PROGRESS.md
git commit -m "feat: orchestrate durable final transcription runs"
```

---

## Work Package P16 — Provenance, Comparison, and Human Decisions

Execute this entire package in one P16 conversation after P14 and P15 are VERIFIED.

### Task P16.1: Expose runs and comparison through owner-scoped APIs

**Files:**

- Add: `apps/api/src/modules/transcript/run-routes.ts`
- Add: `apps/api/src/modules/transcript/run-routes.test.ts`
- Add: `apps/api/src/modules/transcript/comparison-service.ts`
- Add: `apps/api/src/modules/transcript/comparison-service.test.ts`
- Modify: `docs/architecture/API_CONTRACTS.md`

Endpoints:

```text
GET  /v1/meetings/{id}/transcript-runs
GET  /v1/meetings/{id}/transcript-runs/{runId}
POST /v1/meetings/{id}/transcript-comparisons
POST /v1/meetings/{id}/transcript-decisions
```

- [ ] Write two-owner tests before route implementation.
- [ ] Return locality, engine/provider/model, requested ranges, consent reference, state, completeness, and safe errors without raw provider payloads.
- [ ] Compare only runs from the same meeting and compatible audio manifest lineage.
- [ ] Require optimistic base-projection version on every decision.
- [ ] Run:

```powershell
pnpm --filter @kms/api test -- src/modules/transcript/run-routes.test.ts src/modules/transcript/comparison-service.test.ts
pnpm --filter @kms/api typecheck
```

Expected: cross-owner and cross-meeting comparisons are rejected and stale decisions return conflict.

### Task P16.2: Build provenance and disagreement review UI

**Files:**

- Add: `apps/desktop/src/features/transcript-review/RunProvenance.tsx`
- Add: `apps/desktop/src/features/transcript-review/RunProvenance.test.tsx`
- Add: `apps/desktop/src/features/transcript-review/TranscriptComparison.tsx`
- Add: `apps/desktop/src/features/transcript-review/TranscriptComparison.test.tsx`
- Add: `apps/desktop/src/features/transcript-review/EvidenceSeek.tsx`
- Add: `apps/desktop/src/features/transcript-review/decision-reducer.ts`
- Add: `apps/desktop/src/features/transcript-review/decision-reducer.test.ts`

- [ ] Show current projection, raw-run provenance, local/cloud locality, model/provider, and completeness without implying cloud is more authoritative than audio.
- [ ] Highlight agreements and disagreements, especially names, numbers, dates, currency, decisions, and action items.
- [ ] Seek both alternatives to the exact source audio range.
- [ ] Confirm local, confirm cloud, or enter a correction as a versioned transcript revision.
- [ ] Preserve all raw alternatives after a decision.
- [ ] Cover keyboard, screen reader, large text, vi/en, and two-hour virtualization.
- [ ] Run:

```powershell
pnpm --filter @kms/desktop test -- src/features/transcript-review
pnpm --filter @kms/desktop typecheck
```

Expected: every material disagreement is keyboard-reachable and decision replay produces the same projection.

### Task P16.3: Complete review qualification

**Files:**

- Modify after verification: `docs/execution/evidence/P16/EVIDENCE.md`
- Modify after verification: `docs/STATUS.md`
- Modify after verification: `docs/execution/TRACEABILITY.md`
- Modify after verification: `docs/execution/PROGRESS.md`

- [ ] Run the updated P16 API, desktop E2E, owner-isolation, projection/revision, evidence-seek, accessibility, and two-hour performance gates.
- [ ] Prove gaps and unresolved disagreements cannot be hidden by filters or selection.
- [ ] Run `pnpm verify` and packet-specific manual/device gates.
- [ ] Commit only after direct verification:

```powershell
git add apps/api apps/desktop docs/architecture/API_CONTRACTS.md docs/execution/evidence/P16 docs/STATUS.md docs/execution/TRACEABILITY.md docs/execution/PROGRESS.md
git commit -m "feat: add transcript provenance and comparison review"
```

---

## Work Package P28 — Advanced Local Extension

Execute this optional package only in the P28 conversation. It must not block or weaken P27.

### Task P28.1: Extend, do not replace, the P13/P14 contracts

**Files:**

- Modify: `packages/domain/src/transcript/runs.ts`
- Modify: `packages/native-contract/src/local-speech.ts`
- Modify: `native/kms-native/src/local_speech/`
- Modify: `docs/execution/phases/P28-local-ai-import-extension.md`

- [ ] Add capability flags for mobile local file STT and benchmark-qualified local live STT.
- [ ] Keep `TranscriptRun`, `TranscriptRunPart`, planner, reconciliation, consent, and projection contracts backward compatible.
- [ ] Add advanced model lifecycle states without changing the meaning of a verified model.
- [ ] Add contract tests proving P13/P14 fixtures still parse and replay identically.

### Task P28.2: Implement advanced model lifecycle, mobile local, local live, and import

**Files:**

- Follow the exact ownership map and task IDs in the updated P28 packet.
- Reuse: `native/kms-native/src/local_speech/`
- Add under packet ownership: mobile local adapter, model manager, immutable import/normalization, desktop/mobile UI, evaluation/security fixtures.

- [ ] Implement resumable allowlisted model download, verification, atomic activation, rollback, and safe removal.
- [ ] Enable mobile local final only on qualified device/resource profiles.
- [ ] Enable local live only if its independent latency/quality/resource benchmark passes; otherwise expose it as unavailable.
- [ ] Import original audio as a new immutable source asset and keep normalization as a versioned derivative.
- [ ] Never introduce silent cloud fallback or arbitrary executable model loading.
- [ ] Run P13/P14 regression gates plus the complete P28 optional release matrix.

### Task P28.3: Record the optional release decision

**Files:**

- Modify after verification: `docs/execution/evidence/P28/EVIDENCE.md`
- Modify after verification: `docs/STATUS.md`
- Modify after verification: `docs/execution/TRACEABILITY.md`
- Modify after verification: `docs/execution/PROGRESS.md`

- [ ] Record model licenses/provenance, supported devices, measured quality/resource limits, privacy behavior, crash recovery, and import immutability.
- [ ] Keep P27 release state unchanged.
- [ ] If any optional gate fails, retain the core desktop local final product and report P28 as blocked/not released.
- [ ] Commit only the verified optional extension.

---

## Cross-Phase Verification Matrix

| Product promise                                                      | Owning phase | Required proof                                          |
| -------------------------------------------------------------------- | ------------ | ------------------------------------------------------- |
| New meetings default to local final, cloud live off                  | P08          | contract, migration, reducer, and start-command tests   |
| Recording continues without model/network/provider                   | P08/P13      | readiness and capture-independence fault tests          |
| Desktop local final is real, bounded, offline, and cancellable       | P13          | native conformance plus minimum-Windows qualification   |
| Cloud live is independent from final processing                      | P13          | broker, client, persistence, and outage tests           |
| Exactly one primary final mode runs                                  | P14          | policy decision table and job integration tests         |
| Cloud final prefers full batch and falls back within consented scope | P14          | provider-limit and batch-failure tests                  |
| Failed windows resume independently                                  | P14          | checkpoint crash/retry matrix                           |
| No lost or duplicated boundary speech                                | P14          | golden/property reconciliation corpus                   |
| Cloud check is sequential and cannot silently replace local          | P14/P16      | consent, job, comparison, and projection-version tests  |
| Every range is canonical text or an explicit gap                     | P14          | two-hour completeness accounting                        |
| Users can inspect provenance and decide disagreements                | P16          | API, desktop, evidence-seek, a11y, and replay tests     |
| Mobile local/live/import reuse core evidence rules                   | P28          | backward-compatibility and optional qualification gates |

## Final Integrated Gate

- [ ] For each phase conversation, run its narrow tests immediately after each task, then the complete updated phase gate.
- [ ] Before claiming a phase complete, run:

```powershell
pnpm execution:generate:check
pnpm execution:check
pnpm verify
```

- [ ] Run Rust, physical-device, live-provider, minimum-hardware, offline, two-hour, security, resilience, and accessibility commands exactly where the owning packet requires them.
- [ ] Run GitNexus change detection against `main` and confirm only intended symbols and execution flows changed.
- [ ] Update evidence and progress ledgers only after the corresponding result exists.
- [ ] Stop at the phase handoff. Never start the next phase in the same conversation.
