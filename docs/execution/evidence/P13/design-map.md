# P13 Design Map

**Phase:** P13 — Provider-neutral cloud-live and desktop local-file speech platform
**Run:** `RUN-20260727-0000`
**Author:** Architecture/design subagent (read-only)
**Status:** Design only — zero code changes. Inputs: phase packet, ADR-003/004, AI_AND_SPEECH_PROVIDERS, API_CONTRACTS §3/§6/§8, preflight RUN-20260727-0000, and inspection of P02/P03/P06/P11/P12 code.

---

## 1. Architecture change assessment

**No new ADR is required.** P13 relies on two **accepted** ADRs and is a faithful implementation of the existing target architecture — it adds capability surface, not a new architectural direction.

| Relied-on ADR                          | How P13 uses it                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-003 (provider-neutral AI adapters) | `packages/speech/src/deepgram/` is the sole permitted import site for the Deepgram SDK; `packages/domain` and `packages/native-contract` define provider-neutral capability/event/run contracts with **no** SDK types. Cross-provider fallback remains off; named provider is explicit per run. |
| ADR-004 (explicit meeting language)    | Every session/file request binds `language: 'vi' \| 'en'`; the local manifest is single-language per model; the broker rejects mixed-language sessions.                                                                                                                                         |

**Material change vs. P00–P12:** P13 introduces the first **AI-provider integration surface** (Deepgram cloud-live + Windows local file-STT boundary) and the first **immutable run/part lineage** tables. Both are already specified by the accepted target architecture (`AI_AND_SPEECH_PROVIDERS.md` §2/§8, `API_CONTRACTS.md` §8) and the ADRs above — so this is _implementation of an accepted architecture_, not a new direction. No architecture-change record is warranted; no new ADR is authorized for this phase.

**Protocol decision (documented here, not a new ADR):** `NativeEnvelopeV1` stays at `PROTOCOL_VERSION = 1` (envelope.ts:20, protocol.rs:13). P13 additions are **additive command/event allowlist entries only** — no envelope field, framing, or size-limit change. Existing golden fixtures (packages/native-contract/src/fixtures/golden.ts) continue to parse byte-for-byte.

---

## 2. Contract inventory (T01)

### 2.1 `packages/domain/src/transcript/runs.ts` (NEW)

| Schema / type                                                                                | Purpose                                          | Key refinements / invariants                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RunKindSchema` = `z.enum(['live','final','cloud_check'])`                                   | Why a run exists                                 | Maps 1:1 to policy paths (`live=cloud`, `final∈{local,cloud,local_cloud_check}`, `cloud_check` for `cloudCheckScope≠off`)                                    |
| `RunLocalitySchema` = `z.enum(['local','cloud'])`                                            | Where compute runs                               | Locality never changes mid-run (immutability)                                                                                                                |
| `RunProviderSchema` = `z.enum(['deepgram','local-whisper'])`                                 | Named provider                                   | No SDK types; bare string allowlist                                                                                                                          |
| `RunLifecycleStateSchema` = `z.enum(['pending','running','completed','failed','cancelled'])` | Run state                                        | Terminal = `completed`/`failed`/`cancelled`                                                                                                                  |
| `TranscriptRunSchema`                                                                        | One immutable attempt                            | `.strict()`; `ownerId` required; `policySnapshot: TranscriptionPolicyV1Schema`; `language∈vi\|en`; `safeError?` content-free; `startedAt≤completedAt` refine |
| `TranscriptRunPartSchema`                                                                    | One window or full batch within a run            | `.strict()`; FK `runId`; `endMs>startMs`; `overlapMs≥0`; `rawResultHash: Sha256Schema` (reuse meeting/schemas.ts:8-13); `index≥0`                            |
| `TranscriptRunSegmentSchema`                                                                 | Normalized final-segment projection under a part | `.strict()`; FK `partId`,`runId`; `sequenceInPart≥0`; `endMs>startMs`; `language∈vi\|en`                                                                     |
| `PlanHashSchema` = `Sha256Schema` (reuse)                                                    | `stt-window-v1` plan identity                    | 64-hex branded; identical plan ⇒ identical hash                                                                                                              |

### 2.2 `packages/domain/src/transcript/events.ts` (NEW)

Provider-agnostic normalized events. **Raw provider payload never appears here** — it stays inside adapters.

| Schema                                                                                                                | Persists?               | Purpose                                                                                                                | Invariants                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SpeechEventKindSchema` = `z.enum(['interim','final_segment','speaker_update','usage','session_state','safe_error'])` | —                       | Event discriminator                                                                                                    | interim is memory-only; all others persist                                                                                                                              |
| `InterimSegmentEventSchema`                                                                                           | **No (memory/UI only)** | Live partial hypothesis                                                                                                | text bounded; `endMs>startMs`; never written to DB                                                                                                                      |
| `FinalSegmentEventSchema`                                                                                             | Yes                     | Commit a segment                                                                                                       | content-bearing; dedupe key applies                                                                                                                                     |
| `SpeakerUpdateEventSchema`                                                                                            | Yes                     | Diarization label change                                                                                               | `speakerId`, `label`                                                                                                                                                    |
| `UsageEventSchema`                                                                                                    | Yes                     | Resource accounting                                                                                                    | **units/provider/model IDs only**; no text/audio (AI_AND_SPEECH_PROVIDERS.md §7 line 84)                                                                                |
| `SessionStateEventSchema`                                                                                             | Yes                     | `started\|active\|expired\|closed`                                                                                     | drives rollover/reconnect                                                                                                                                               |
| `SpeechSafeErrorSchema`                                                                                               | Yes                     | Content-free failure                                                                                                   | `code`≤64, `message`≤512, `category∈{protocol,validation,runtime,storage,timeout,cancelled,provider,quota,internal}`, `retryable:boolean`. **No key/body/content/path** |
| `SpeechEventSchema` (envelope)                                                                                        | conditional             | Wraps kind+payload + `runId`,`partId`,`provider`,`providerEventId`,`sequenceInPart`,`meetingId`,`ownerId`,`occurredAt` | owner-scoped; stale/cross-meeting rejected at persist (§6)                                                                                                              |

> **Note on SafeError category enum:** `packages/native-contract/src/envelope.ts:49-67` defines the IPC-level `SafeErrorSchema` with categories `{protocol,validation,runtime,storage,device,timeout,cancelled,internal}`. P13 **does not modify that enum** (keeps P11 byte-frozen). The domain-level `SpeechSafeErrorSchema` is a _separate_ schema that adds `provider`/`quota` for normalized speech events; IPC errors reuse the existing enum.

### 2.3 `packages/domain/src/transcript/capability.ts` (NEW)

| Schema                                                              | Purpose                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SpeechProviderNameSchema` = `z.enum(['deepgram','local-whisper'])` | Same allowlist as `RunProviderSchema`                                                                                                                                                                                 |
| `SpeechCapabilitiesSchema`                                          | `{ languages: ['vi'\|'en'][], diarization: boolean, translationTarget?: 'vi'\|'en', supportsLive, supportsFile, maxStreamDurationMs? }`                                                                               |
| `ReadinessSchema`                                                   | `{ ready, degraded?: string[], missingModelId?: string }`                                                                                                                                                             |
| `SessionRequestSchema`                                              | Binds `meetingId, ownerId, language∈vi\|en, sourceId, diarization, capabilityVersion, expiryMs, budgetMs, allowedProvider∈{deepgram,local-whisper}` — the owner-bound session contract (API_CONTRACTS.md §8 line 119) |
| `FileRequestSchema`                                                 | `{ runId, partId, startMs, endMs, language, modelId, provider }` — exact planned window                                                                                                                               |
| `UsageReportSchema`, `HealthReportSchema`, `CancelSchema`           | supporting types                                                                                                                                                                                                      |
| `SpeechProviderContractSchema`                                      | zod-encoded **descriptor** of the §2 SpeechProvider interface (capabilities/startSession/transcribeFile/healthcheck) — **not** the SDK; consumers negotiate against this                                              |

### 2.4 `packages/domain/src/transcription/policy.ts` (EXTEND — none needed)

`TranscriptionPolicyV1` (policy.ts:4-11) and `TranscriptionPolicyV1Schema` (policy.ts:49-85) are **already sufficient** for P13. The three refinements (final/cloudCheckScope coupling, cloud requires `cloudConsent≠not_required`) already encode every invariant the packet requires. `policyFromLegacySpeechMode` (policy.ts:22-47) — **unchanged**; legacy `speechMode` cannot infer granted consent (API_CONTRACTS.md line 114). T01 only _consumes_ this schema in `SessionRequestSchema.policySnapshot`/`TranscriptRunSchema.policySnapshot`.

### 2.5 `packages/domain/src/index.ts` (EXTEND — barrel append)

Append three exports (after existing transcript line, index.ts:8):

```ts
export * from './transcript/runs.js';
export * from './transcript/events.js';
export * from './transcript/capability.js';
```

### 2.6 Persistence schema (EXTEND additive)

**Recommendation:** new file `packages/database/src/schema/speech-runs.ts` (schema/index.ts:1-17 is explicitly append-only; new file keeps ownership clean vs. extending `transcript.ts`). Tables model the existing `transcriptSegments` pattern (transcript.ts:34-92): `ownerId` column, `meetingId` FK to `meetings` cascade, CHECK constraints, owner-scoped indexes.

| Table                   | Immutability                                                | Key columns                                                                                                                                                                                                             | Constraints / indexes                                                                                                                      |
| ----------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `transcript_runs`       | **no UPDATE/DELETE** (trigger-enforced; see migration)      | `id` PK, `meeting_id` FK→meetings, `owner_id`, `kind`, `locality`, `provider`, `language`, `source_id`, `policy_snapshot jsonb`, `lifecycle_state`, `started_at`, `completed_at`, `safe_error jsonb`, `created_at`      | owner+meeting index; lifecycle index; CHECK `completed_at IS NULL OR completed_at >= started_at`                                           |
| `transcript_run_parts`  | **no UPDATE/DELETE**                                        | `id` PK, `run_id` FK→runs, `owner_id`, `index`, `start_ms`, `end_ms`, `overlap_ms`, `locality`, `provider`, `model_id`, `raw_result_hash char(64)`, `lifecycle_state`, `completed_at`, `safe_error jsonb`, `created_at` | unique(`run_id`,`index`); CHECK `end_ms > start_ms`; CHECK `raw_result_hash ~ '^[0-9a-fA-F]{64}$'`                                         |
| `transcript_raw_events` | **append-only** (INSERT only; trigger blocks UPDATE/DELETE) | `id` PK, `run_id`, `part_id`, `meeting_id`, `owner_id`, `provider`, `provider_event_id`, `event_type`, `sequence_in_part`, `content_hash char(64)`, `payload jsonb`, `occurred_at`, `ingested_at`                       | **Idempotency unique index** on `(run_id, part_id, provider, provider_event_id, event_type, sequence_in_part)`; owner index; meeting index |

### 2.7 `packages/database/drizzle/0007_speech_runs.sql` (NEW migration)

> ⚠️ **Correction:** the packet/preflight mention `0006`, but `0006_jobs_outbox_improvements.sql` already exists (confirmed). **P13 uses `0007_speech_runs.sql`.** Additive only — three `CREATE TABLE` + supporting indexes + immutability triggers. Must not touch 0000–0006. Follow the `statement-breakpoint` style of 0006.

Immutability enforcement (per table):

```sql
CREATE OR REPLACE FUNCTION block_run_update() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'transcript_runs is immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_runs_no_update BEFORE UPDATE ON transcript_runs
  FOR EACH ROW EXECUTE FUNCTION block_run_update();
-- repeat for DELETE; repeat analogously for parts and raw_events (raw_events allows INSERT only)
```

---

## 3. Window planner design (T02) — `stt-window-v1`

**Location:** `packages/speech/src/core/window-planner.ts` (new package; `packages/speech/` does not yet exist).

### Algorithm

```
planWindowV1(durationMs, gaps?):
  WINDOW = 300_000; OVERLAP = 2_000
  assert durationMs > 0
  windows = []
  t = 0; index = 0
  while t < durationMs:
    end = min(t + WINDOW, durationMs)
    overlap = (end - t === WINDOW and end < durationMs) ? OVERLAP : 0   // overlap only between consecutive full windows
    // gap handling: if [t,end) intersects a gap range, shrink to gap start and emit backfill range
    windows.push({ index, startMs:t, endMs:end, overlapMs:overlap })
    t = end                              // monotonic timeline — never chunk-index based
    index += 1
  planHash = sha256(canonicalJSON({ version:'stt-window-v1', durationMs, gaps, windows }))
  return { version:'stt-window-v1', durationMs, windows, planHash }
```

- **Input:** `durationMs` (from verified audio manifest), optional `gaps: GapEntry[]` (reuse transcript/schemas.ts:130-141).
- **Output:** ordered `{ index, startMs, endMs, overlapMs }[]` + `planHash`.
- **Window/overlap:** 300_000ms / 2_000ms (AI_AND_SPEECH_PROVIDERS.md line 90).
- **Capture-chunk independence:** planner reads only the monotonic `durationMs`/timeline — **never** chunk IDs or chunk boundaries (preserves the §49 invariant).
- **Stable hash:** SHA-256 over canonical JSON (`JSON.stringify` with sorted keys; deterministic float formatting). Same `(durationMs, gaps)` ⇒ same hash ⇒ same `TranscriptRunPart.rawResultHash` lineage for P14 reconciliation.
- **Multi-source:** **unified plan over `derived_mix` monotonic timeline** (AudioSourceSchema option at meeting/schemas.ts:26). Per-source plans are out of scope; capture independence is preserved because the plan is a read-only input handed to the local engine.

### Edge cases

| Case                           | Behavior                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `durationMs < WINDOW`          | Single clipped window `{0, durationMs, 0}`                                                                          |
| `durationMs == N*WINDOW`       | Exactly N windows, last has `overlapMs=0` (no trailing overlap)                                                     |
| Two-hour meeting (7_200_000ms) | 24 full windows + clipped remainder; property test asserts coverage = [0, durationMs)                               |
| Source gap (GapEntry)          | Window does **not** span the gap; emits `{ kind:'backfill_required', startMs, endMs }` range in plan output for P14 |
| Empty/zero duration            | Reject (`validation`)                                                                                               |

### Property tests (golden + property, evidence `window-planner-report.json`)

1. `short` — duration < WINDOW → 1 clipped window, overlap 0.
2. `exact_multiple` — duration = N·WINDOW → N windows, last overlap 0, coverage exact.
3. `two_hour` — 7_200_000ms → windows cover [0, duration) with no gap/overlap contradiction (overlap is metadata only, not coverage duplication).
4. `pause_or_gap` — gap produces `backfill_required` range; no window crosses it.
5. `repeatability` — same input ⇒ identical plan (deep-equal).
6. `stable_hash` — same input ⇒ identical `planHash`; any byte change in input ⇒ different hash.
7. `monotonic_only` — planner ignores a fake chunk-index field if supplied (negative test).

---

## 4. Local speech IPC and engine design (T03)

### 4.1 Native command additions (additive allowlist)

Add to **both** `packages/native-contract/src/commands.ts` `NATIVE_COMMANDS` (lines 13-58) and `native/crates/kms-native/src/protocol.rs::ALLOWED_COMMANDS` (lines 16-57):

| Command                          | Purpose                                  | Payload (validated TS+Rust side)                                                 |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `local_speech_manifest_load`     | Load + verify allowlisted model manifest | `{ manifestPath }` → returns `{ models: ModelEntry[], isSimulated: true }`       |
| `local_speech_engine_init`       | Initialize bounded engine                | `{ modelId, language∈vi\|en, memoryBudgetMb?, queueCapacity?, threadPoolSize? }` |
| `local_speech_transcribe_window` | Transcribe one exact planned window      | `{ runId, partId, startMs, endMs, language, planHash }`                          |
| `local_speech_cancel`            | Cooperative cancel                       | `{ runId }`                                                                      |
| `local_speech_get_state`         | Safe state snapshot                      | `{}` → `{ active, queued, isSimulated }`                                         |

**Decision — protocol stays at v1.** Per envelope.ts:20/protocol.rs:13, `PROTOCOL_VERSION = 1` is unchanged. Additive allowlist entries do not break existing golden fixtures (conformance.test.ts). Add a `COMMAND_CATEGORIES.speech` group in commands.ts (mirroring lines 67-107). Document this in the ADR-003 reliance note (§1).

### 4.2 Event type addition

Add `'local_speech_event'` to `NATIVE_EVENT_TYPES` (events.ts:10-19) and Rust counterpart. Payload schema modeled on `CaptureEventPayloadSchema` (events.ts:84-109):

```ts
LocalSpeechEventPayloadSchema = z
  .object({
    runId: z.string().uuid(),
    eventKind: z.enum([
      'started',
      'window_progress',
      'window_complete',
      'window_failed',
      'cancelled',
      'stopped',
    ]),
    partIndex: z.number().int().nonnegative().optional(),
    progress: z.number().min(0).max(100).optional(),
    isSimulated: z.boolean(),
    safeError: SpeechSafeErrorSchema.optional(),
    details: z.string().max(256).optional(),
  })
  .strict();
```

### 4.3 Allowlisted model manifest schema

`packages/native-contract/src/speech-manifest.ts` (new) + Rust mirror in `local_speech/manifest.rs`:

```ts
ModelManifestEntrySchema = z
  .object({
    modelId: z.string().min(1),
    language: z.enum(['vi', 'en']),
    engineType: z.literal('whisper_cpp_compat'),
    path: z
      .string()
      .regex(/^[A-Za-z0-9_./-]+$/)
      .refine((p) => !p.includes('..') && !p.startsWith('/') && !p.includes(':')),
    sha256: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]{64}$/),
    maxConcurrentStreams: z.number().int().positive(),
    licenseProvenance: z
      .object({ license: z.string(), reviewedBy: z.string(), reviewedAt: z.string().datetime() })
      .strict(),
  })
  .strict();
```

**Rejections (each its own test):**

| Failure                                          | Rejection                                        |
| ------------------------------------------------ | ------------------------------------------------ |
| Corrupt — `sha256` mismatch on file              | `MODEL_CORRUPT` (validation)                     |
| Incompatible — `engineType ≠ whisper_cpp_compat` | `MODEL_INCOMPATIBLE` (validation)                |
| Unreviewed — `licenseProvenance` missing         | `MODEL_UNREVIEWED` (validation)                  |
| Path-escaping — `..`, absolute, or `:`           | `MODEL_PATH_INVALID` (validation) — regex refine |

### 4.4 Bounded engine

**Rust module layout:** `native/crates/kms-native/src/local_speech/{mod,model,engine,manifest}.rs`. Wire dispatch in `runtime.rs` alongside the existing prefix arms (runtime.rs:272-290):

```rust
cmd if cmd.starts_with("local_speech_") => self.handle_local_speech_command(request).await
```

Add a runtime field mirroring `capture_manager` (runtime.rs:58):

```rust
local_speech: Arc<Mutex<Option<LocalSpeechEngine>>>,
```

and register `mod local_speech;` in main.rs (after line 14).

**Bounds (config via env, defaults below):**

| Resource         | Default                                                                                     | Mechanism                                                |
| ---------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Thread pool      | `min(2, num_cpus)`                                                                          | tokio blocking pool / rayon — cooperative                |
| Memory budget    | `KMS_LOCAL_SPEECH_MEM_BUDGET_MB=512`                                                        | checked before accepting a window                        |
| Queue capacity   | mpsc cap `8`                                                                                | backpressure returns `ENGINE_BUSY` (retryable)           |
| Progress         | `window_progress` event every ~1s or 10%                                                    | via `local_speech_event`                                 |
| Cancellation     | `Arc<AtomicBool>` stop_signal (mirrors capture/manager.rs:31)                               | checked at every cooperative yield point; cancel ack ≤2s |
| Capture priority | `tokio::task::yield_now()` between windows; **never** holds a lock the capture writer needs | capture continues across local engine failure (T07 test) |

**No-network enforcement:** Cargo.toml currently has **no** HTTP/WS crates (confirmed — lines 11-35). P13 must not add `reqwest`/`ureq`/`hyper`/`tungstenite`/`isahc`. Add a static CI test that greps `Cargo.toml` and `local_speech/**/*.rs` for those crate names and fails on any hit.

### 4.5 Whisper.cpp-compatible adapter (P13 ships the boundary, not the model)

No license/provenance-reviewed vi/en model binary is available in this environment (preflight line 15). P13 implements a **deterministic stub adapter** in `local_speech/model.rs` that:

- Produces synthetic segments from audio metadata (duration, sample rate) — **never** real transcription.
- Tags every output and event with `isSimulated: true`.
- Honors the exact planned window, language, manifest, bounds, cancel, and yield contract — so a real `whisper.cpp` FFI implementation slots in without changing the IPC, manifest, or engine boundary.

Real whisper.cpp FFI integration is a **P28** concern (packet line 36). P13 ships the boundary + manifest + bounded engine; A03 real-STT quality gates stay BLOCKED (§9).

---

## 5. Deepgram cloud-live design (T04)

### 5.1 SDK isolation layer

`packages/speech/src/deepgram/` is the **only** directory permitted to import `@deepgram/sdk` (or whatever the chosen SDK is). Enforced by:

- ESLint `no-restricted-imports` rule failing on any `@deepgram` import outside `packages/speech/src/deepgram/**`.
- Conformance test that greps `packages/domain/**`, `packages/native-contract/**`, `apps/desktop/src/main/**`, `apps/mobile/src/**` for `@deepgram` and fails on any hit.

### 5.2 Realtime adapter interface

`packages/speech/src/deepgram/realtime-adapter.ts`:

```ts
interface DeepgramRealtimeAdapter {
  connect(
    auth: BrokeredCredential,
    config: { language: 'vi' | 'en'; diarization: boolean; model: string },
  ): Promise<void>;
  sendAudio(chunk: Uint8Array): void; // derived feed only
  onEvent(cb: (e: SpeechEvent) => void): () => void;
  keepalive(): void;
  close(): Promise<void>;
}
```

**Event mapping** (Deepgram → normalized SpeechEvent from §2.2):

| Deepgram SDK event         | Normalized event                      |
| -------------------------- | ------------------------------------- |
| `Results` (is_final=false) | `interim` (memory-only)               |
| `Results` (is_final=true)  | `final_segment`                       |
| `SpeakerLabels`            | `speaker_update`                      |
| `Metadata`                 | `usage` (IDs/units only)              |
| `Error`                    | `safe_error` (content-free; see §5.4) |

### 5.3 Owner-bound session broker

**Location:** `apps/api/src/modules/speech/` (new). Register as a Fastify plugin in `app.ts` the same way `jobRoutes` is registered (app.ts:60-68, under `bearerAuth`):

```
POST /v1/meetings/:id/speech-sessions
```

**Validations (each its own test):**

1. Authenticated owner (reuse `request.authenticatedOwnerContext` — jobs/routes.ts:22).
2. Meeting exists and `meeting.ownerId === ownerCtx.ownerId` (owner-scoped — API_CONTRACTS.md §7 line 93).
3. `policy.live === 'cloud'` (policy.ts:8).
4. `policy.cloudConsent === 'granted'` (policy.ts:10) — **legacy speechMode cannot grant this** (policy.ts:35).
5. `policy.language ∈ {vi, en}` and matches meeting (ADR-004).
6. Named-provider disclosure on file for the owner (provider disclosure record).
7. Request within approved audio range / budget.

**Response:** short-lived credential (opaque token, TTL ≤ `policy.expiryMs`) bound to `{ownerId, meetingId, sourceId, expiry, allowedProvider:'deepgram'}`. **Master `DEEPGRAM_API_KEY`** lives only in server secret storage (process.env); it is **never** present in the response body, the token, logs, or the client bundle (AI_AND_SPEECH_PROVIDERS.md §7 lines 79-84; packet A06).

### 5.4 Safe error mapping

`packages/speech/src/deepgram/error-mapper.ts`:

```ts
function toSafeError(dgError: unknown): SpeechSafeError;
```

- `code` ≤64 chars, `message` ≤512 chars (truncate + genericize), `category∈{provider,quota,timeout,internal}`, `retryable` derived from Deepgram error kind.
- **Never** includes: API key, request body, audio bytes, transcript text, response body, headers. Conformance test asserts the redacted fields are absent across a corpus of Deepgram error shapes.

### 5.5 Derived-feed client streaming

| Client  | Path                                                                           | Behavior                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop | `apps/desktop/src/main/speech/` (new; sits alongside supervisor.ts/preload.ts) | consumes brokered credential; sends **derived mix** feed only (AudioSourceSchema `'derived_mix'`, meeting/schemas.ts:26); loss → `session_state=delayed/backfill_required` (never blocks capture writer) |
| Mobile  | `apps/mobile/src/features/speech/` (new; sits alongside `features/recording/`) | same contract; mobile local STT is **out of scope** (forbidden)                                                                                                                                          |

### 5.6 Conformance tests with Mock Deepgram

`packages/speech/src/deepgram/__tests__/` — fake WebSocket / SDK stub:

- Two-owner isolation (owner B cannot use owner A's session).
- Replay/expiry (expired token rejected with `session_state=expired`).
- Quota / rate-limit → safe error, no key/body leak.
- Unsupported capability (e.g. diarization on a model that lacks it) → rejected **before** provider contact.
- Every normalized event kind emitted at least once.
- Authorized live synthetic vi **and** en sessions complete end-to-end against the mock.
- **Real Deepgram is BLOCKED** when `DEEPGRAM_API_KEY` absent — adapter short-circuits with `safe_error{category:'provider', code:'PROVIDER_NOT_CONFIGURED'}`.

---

## 6. Persistence design (T05)

### 6.1 What persists vs. memory-only

| Event kind       | Persisted? | Notes                                                                            |
| ---------------- | ---------- | -------------------------------------------------------------------------------- |
| `interim`        | **No**     | memory/UI only — never written to `transcript_raw_events` (asserted in T05 test) |
| `final_segment`  | Yes        | under `(runId, partId)` lineage                                                  |
| `speaker_update` | Yes        |                                                                                  |
| `usage`          | Yes        | IDs/units only, no content                                                       |
| `session_state`  | Yes        |                                                                                  |
| `safe_error`     | Yes        | content-free                                                                     |

### 6.2 Idempotency

**Dedupe key** (unique index on `transcript_raw_events`, §2.6):

```
(runId, partId, provider, providerEventId, eventType, sequenceInPart)
```

- **Replay** (same key, same `content_hash`) → no-op / 200, original row preserved.
- **Out-of-order** → accepted (inserted); ordered on read by `sequenceInPart`.
- **Conflicting duplicate** (same key, **different** `content_hash`) → `409 SPEECH_EVENT_CONFLICT`; **original preserved**, duplicate rejected (packet line 109).

### 6.3 Stale / cross-meeting rejection

- `event.meetingId !== run.meetingId` → `409 SPEECH_RUN_MEETING_MISMATCH`.
- `event.runId` owner ≠ `run.ownerId` → `409 SPEECH_RUN_OWNER_MISMATCH`.
- Event `language` ≠ run `language` → `409 SPEECH_RUN_LANGUAGE_MISMATCH` (ADR-004).

### 6.4 Per-window resume input (P14 owns reconciliation)

A failed/cancelled run's completed `TranscriptRunPart` lineage is preserved (immutability, §2.6). P14 submits a new `TranscriptRun` referencing the prior run's completed parts via `policySnapshot`/explicit `priorRunId` (P14 concern). **P13 only preserves the inputs** — it does not implement reconciliation, completeness, or canonical projection (forbidden, packet line 36).

### 6.5 Failure handling

Provider/network/model failure persists a `safe_error` event + transitions the part/run to `failed`; **capture continues** because speech is decoupled from the source writer (packet line 49). No automatic cloud work is created from a local failure (A06, packet line 131).

---

## 7. Evaluation corpus and harness (T06)

### 7.1 Frozen synthetic bilingual corpus

**Path:** `packages/speech/test/fixtures/corpus/` (new; `packages/speech/` does not yet exist).

- 5–10 short samples per language (vi, en), clean + noisy variants.
- Reference transcripts alongside (TSV or JSONL).
- **Frozen before tuning** — `corpus.manifest.json` stamped with SHA-256 of the corpus directory; any mutation changes the hash and fails the harness.

### 7.2 Harness

`packages/speech/test/evaluation/harness.ts` computes:

- WER (clean), WER (noisy) — per language.
- Timestamp p95 error (ms).
- Local RTF (real-time factor).
- Memory / CPU peak.
- Cancellation acknowledgement latency.
- Deterministic-plan coverage (plan windows vs. audio duration).
- Ordering invariants (`sequenceInPart` monotonic on read).
- **No-network local behavior** assertion (local engine makes zero socket/HTTP calls — instrumented).
- **Cloud-contact absence** assertion (when running the local-only path, no outbound to Deepgram).

### 7.3 Safe metrics

Only operational IDs/counts/timing — **never** audio bytes, transcript text, meeting titles, owner PII (AI_AND_SPEECH_PROVIDERS.md §7 line 84). The harness output schema is itself zod-validated to reject content-bearing fields.

### 7.4 Threshold gates (packet line 92)

| Gate                                   | Threshold | Status in this env                       |
| -------------------------------------- | --------- | ---------------------------------------- |
| Clean WER                              | ≤18%      | **BLOCKED_ON_MODEL** (no whisper binary) |
| Noisy WER                              | ≤30%      | **BLOCKED_ON_MODEL**                     |
| Timestamp p95                          | ≤1.5s     | **BLOCKED_ON_MODEL**                     |
| Local RTF                              | ≤1.0      | **BLOCKED_ON_MODEL**                     |
| Cancel ack                             | ≤2s       | Verifiable (stub honors cancel contract) |
| Plan determinism / coverage / ordering | —         | Verifiable                               |

Harness emits a report marking each unmeasured gate `BLOCKED_ON_MODEL` with reason — not a silent pass.

---

## 8. Fault qualification (T07)

### 8.1 Synthetic live tests

- **Fake Deepgram** (§5.6) + **deterministic local stub** (§4.5).
- Mobile/desktop cloud-live reconnect and credential rollover on expiry.
- Network / rate-limit / quota / provider outage → safe errors, no leak, capture continues.
- Persistence replay (§6.2) — duplicate, out-of-order, conflicting duplicate, stale/cross-meeting.

### 8.2 Offline / no-network local behavior

- Assert local engine makes **zero** network calls (instrument sockets or run with network sandbox).
- Capture continues across local engine failure / crash / resource-limit (capture-priority yield, §4.4).

### 8.3 Bundle / log / secret inspection

Grep scan of all P13 source + built bundles + sample logs for:

- `DEEPGRAM_API_KEY` value (must be absent — only env reference permitted server-side).
- Audio bytes / base64 payloads.
- Transcript text content.
- Meeting titles / owner PII.

Assert clean; failing hit blocks the gate.

### 8.4 Real provider / hardware gates (BLOCKED)

- Real Deepgram key — **missing** (preflight line 14).
- Real whisper.cpp-compatible vi/en model binary — **missing** (preflight line 15).
- Physical Android/iOS devices for mobile matrix — out of scope (mobile local STT forbidden).

These gates are explicitly marked BLOCKED in `evidence/P13/EVIDENCE.md`; fixtures cannot substitute (packet line 92).

---

## 9. Sequencing and risk

### 9.1 Serial order (confirmed, matches RUN-20260727-0000 line 106)

```
T01 → T02 → (T03 ‖ T04) → T05 → T06 → T07
```

T03 and T04 are independent (local vs. cloud) and own non-overlapping paths (native contract/runtime vs. Deepgram/API/clients) per the subagent allocation table (packet lines 96-101).

### 9.2 Top 5 risks

| #   | Risk                                                                 | Catching test / gate                                                                 |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Provider SDK types leak into `domain` / `native-contract` / clients  | ESLint `no-restricted-imports` + grep conformance test (§5.1); A01                   |
| 2   | Capture coupling — speech blocks/reads source writer                 | T07 offline test: capture continues across engine failure (§8.2); A03/A06            |
| 3   | Idempotency collision — duplicate finals double-counted or overwrite | Unique index + `409` conflict test on conflicting `content_hash` (§6.2); A01         |
| 4   | Model path escape — `..` / absolute / drive-letter traversal         | Manifest regex refine + unit test per rejection class (§4.3); A03                    |
| 5   | Secret in token / log / bundle / telemetry                           | Grep scan for `DEEPGRAM_API_KEY` value + response-schema assertion (§8.3, §5.3); A06 |

### 9.3 Expected terminal state

| Gate                                                                           | Terminal state                                                                                                | Rationale                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P13-A01 (contracts versioned/owner-scoped/immutable/idempotent/no SDK leakage) | **VERIFIED** (CI grade)                                                                                       | Pure contract + DB schema + conformance tests; no external dependency |
| P13-A02 (`stt-window-v1` deterministic, capture-chunk-independent)             | **VERIFIED** (CI grade)                                                                                       | Property tests + stable hash (§3)                                     |
| P13-A03 (Windows local file STT bounded/cancellable/network-independent)       | **PARTIAL** — adapter/IPC/manifest/engine boundary verifiable; real STT quality **BLOCKED** on whisper binary | Preflight line 15                                                     |
| P13-A04 (real Deepgram cloud-live vi/en matrix)                                | **BLOCKED**                                                                                                   | Preflight line 14 — no `DEEPGRAM_API_KEY`                             |
| P13-A05 (frozen bilingual thresholds on min Windows)                           | **BLOCKED**                                                                                                   | Needs real model (WER/RTF) **and** real key (cloud gates)             |
| P13-A06 (no local→cloud work; secrets absent; two-owner controls)              | **VERIFIED at contract level** (grep scans, two-owner mock tests); real-provider portion **BLOCKED**          | Partial CI-grade pass; live portion blocked                           |

Phase terminal state: **IMPLEMENTED** with A01/A02 fully verified, A03 partially verified, A04/A05 blocked on external prerequisites, A06 verified at contract level — consistent with the preflight's orthogonal-gates disposition.

---

## 10. Non-goals re-statement (conversation boundary)

Explicitly **out of scope** for P13 (packet lines 36, 143):

- Final-run scheduling / reconciliation / completeness / cloud-check **execution** (P14).
- Translation (P14+).
- Minutes generation (separate phase).
- **Mobile local STT** (forbidden).
- **Local live STT** (forbidden — local engine is file-only).
- Immutable import (separate phase).
- Advanced resumable model catalog / switching / hot-swap (P28).
- Provider SDK types in `domain` / `client` / `native-contract` (ADR-003 — forbidden).
- Master key / client-side credentials (master key server-side only).
- Source capture changes (P09 owns capture; P13 only consumes derived feed).
- Automatic provider/locality fallback (ADR-003 — off by default).
- Real whisper.cpp FFI integration (P28 — P13 ships the boundary only).
