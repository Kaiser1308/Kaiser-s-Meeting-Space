# P16 Transcript Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an owner-scoped, replayable transcript-review experience that preserves immutable source evidence while supporting provenance, comparisons, decisions, revisions, speaker mappings, search, bookmarks, and exact audio seeking.

**Architecture:** Keep source runs, segments, audio manifests, translation versions, decisions, revisions, and speaker mappings append-only. Build a pure domain projection/replay engine, persist its commands and snapshots through owner-scoped API services, then consume one stable projection/query contract from a desktop full-review feature and a mobile lightweight reviewer. Source-track resolution stays behind an evidence-player contract; PostgreSQL search remains behind a cursor-query contract.

**Tech Stack:** TypeScript, Zod, Vitest/fast-check, Drizzle/PostgreSQL/Testcontainers, Fastify, React/Electron, React Native/Expo, Playwright, Maestro, existing pnpm quality scripts.

## Global Constraints

- Execute P16 only after P14 and P15 are both `VERIFIED` and direct `EVIDENCE.md` files exist; as of 2026-07-30 P14 is `IN_PROGRESS` and P15 is `NOT_STARTED`, so this document is planning-only.
- Work strictly within P16: never mutate source audio, immutable run events, transcript source segments, raw provider payloads, or translation source lineage.
- Meeting language remains exactly `vi | en`; translation never replaces source text.
- Every mutation is authenticated, owner-scoped, optimistic-versioned where required, idempotent when retryable, and content-free in logs/telemetry.
- A cloud-check/local comparison never changes the current projection without an explicit versioned decision.
- Do not introduce an external search service; use measured PostgreSQL search first. Do not implement minutes, exports, collaboration, or P17 work.
- Use only synthetic/consented vi/en fixtures. Record exact command, exit code, test count, duration, and evidence path in the P16 run record.
- On this workstation `node --version` is `v24.18.0`; the root requires `pnpm@10.14.0`. PowerShell currently blocks `pnpm.ps1`, so run the resolved `pnpm.cmd` (or the approved bundled pnpm runtime) and record its exact path/version before every gate.

---

## Phase-zero: environment and plan lock

### Task 0: Establish a truthful P16 execution baseline

**Files:**

- Create: `docs/execution/evidence/P16/RUN-YYYYMMDD-HHMM.md`
- Modify after direct verification only: `docs/execution/PROGRESS.md`, `docs/execution/TRACEABILITY.md`, `docs/STATUS.md`, `docs/execution/evidence/P16/EVIDENCE.md`
- Read: `docs/execution/EXECUTION_PROTOCOL.md`, `docs/execution/phases/P16-transcript-review.md`, all P16 authoritative documents, and `docs/execution/evidence/P14/EVIDENCE.md`, `docs/execution/evidence/P15/EVIDENCE.md`

**Interfaces:**

- Consumes: P14 finalization/reconciliation outputs and P15 versioned translation lineage, both at `VERIFIED` lifecycle state.
- Produces: a locked runtime checklist for `P16-T01` through `P16-T07`; no product-code change.

- [ ] **Step 1: Prove dependency readiness before creating a run record.**

  Run `git status --short --branch`, `git diff --stat`, and `git log -5 --oneline`; inventory every existing dirty/untracked path separately from this run. Verify `PROGRESS.md` records P14 and P15 as `VERIFIED`, and inspect both evidence files for direct source-integrity, reconciliation, translation-lineage, authorization, regression, and external-gate evidence. Stop and hand off if either condition is false.

- [ ] **Step 2: Verify the execution toolchain rather than assuming the shell alias works.**

  Resolve and run `node --version`, `pnpm.cmd --version`, `docker --version`, the supported browser version, desktop Electron version, and Android/iOS test-device versions. Run `pnpm.cmd install --frozen-lockfile` only when the lockfile/node_modules state requires it; never use `pnpm.ps1` in the restricted PowerShell session. Record exact outputs and database/container availability in the run record.

- [ ] **Step 3: Create deterministic P16 fixture and benchmark inputs.**

  Add synthetic two-hour vi/en transcript, run/part, audio-range, gap, local/cloud disagreement, translation, and revision histories under the existing test-support convention. Include names, dates, numbers, currencies, decisions, action items, diacritics, pauses, missing/corrupt source ranges, and two owners. Store only safe fixture identifiers and hashes in diagnostic output.

- [ ] **Step 4: Establish measurable review targets before UI implementation.**

  Document the dataset size, machine/device profile, memory ceiling, initial-render/scroll/search/seek percentile targets, and test repetitions in `docs/execution/evidence/P16/performance-baseline.md`. The target values must be accepted in the run record before T06; do not tune thresholds after observing implementation results.

- [ ] **Step 5: Lock ownership and dispatch order.**

  Allocate: Revision/API (T01-T03), Evidence Player (T05), Search/UI (T04 then T06), and Independent QA (T07). Keep database migration files, shared domain exports, application route registration, and final evidence integration exclusively with the main agent. Dispatch Search/UI only after the T01-T03 public contracts are reviewed; dispatch T07 only after all package reviews pass.

## Target file map

Exact paths may be added only after T01 design review confirms the existing P14/P15 layout; preserve the responsibilities below.

| Area                | Planned paths                                                                                                                                                            | Responsibility                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Domain              | `packages/domain/src/transcript/projection.ts`, `projection.test.ts`, `decisions.ts`, `decisions.test.ts`, `speaker-mappings.ts`, `speaker-mappings.test.ts`, `index.ts` | Zod contracts, append-only history, pure replay and validation                |
| Database            | `packages/database/drizzle/0009_transcript_review.sql`, `src/schema/transcript-review.ts`, `src/repositories/transcript-review.ts`, integration tests                    | Additive append-only persistence and owner-scoped queries                     |
| API                 | `apps/api/src/modules/transcript/{dto,errors,service,routes,*.test}.ts`, route registration                                                                              | Authenticated revision/decision/run/search/bookmark endpoints and safe errors |
| Evidence navigation | `packages/domain/src/evidence/{contract,resolver,*.test}.ts`, desktop/mobile adapters                                                                                    | Source-track/range availability and exact seek semantics                      |
| Desktop             | `apps/desktop/src/features/transcript-review/*`                                                                                                                          | Full virtualized review, comparison, editing, accessibility                   |
| Mobile              | `apps/mobile/src/features/transcript-review/*`                                                                                                                           | Lightweight read/search/seek/revision review with accessible controls         |
| QA/evidence         | `tests/p16/*`, `docs/execution/evidence/P16/*`                                                                                                                           | Two-owner, replay, source mutation-negative, a11y and two-hour evidence       |

## Public contracts to lock in T01

```ts
type TranscriptProjectionRef = Readonly<{
  meetingId: string;
  finalizationVersion: string;
  reconciliationVersion: string;
  decisionVersion: string;
  revisionVersion: string;
  speakerMappingVersion: string;
  algorithmVersion: 'p16-v1';
}>;

type RevisionCommand = Readonly<{
  meetingId: string;
  segmentId: string;
  baseProjectionVersion: string;
  baseRevisionId: string | null;
  revisedText?: string;
  presentationSpeakerId?: string;
  actorId: string;
  reason: string;
  idempotencyKey: string;
}>;

type EvidenceSeekResult =
  | {
      state: 'available';
      track: 'mic' | 'system';
      startMs: number;
      endMs: number;
      playbackRef: string;
    }
  | { state: 'gap' | 'missing' | 'corrupt'; reason: string; startMs: number; endMs: number };
```

The T01 design review must define all omitted response DTOs, cursor shape, safe error codes, storage constraints, and exact version-increment rules before any consumer is implemented.

## Implementation tasks

### Task 1: P16-T01 — Run provenance, projection, and deterministic replay

**Files:** domain paths in the target map; additive database schema/repository paths only if P14/P15 schemas lack required persisted facts.

**Interfaces:**

- Consumes: `TranscriptRun`, `TranscriptRunPart`, `TranscriptRunSegment`, immutable source segments, P14 reconciliation, P15 translation version lineage.
- Produces: `TranscriptProjectionRef`, provenance/comparison DTOs, append-only decision/revision/mapping event schemas, `replayTranscriptProjection(history)`.

- [ ] Write failing Zod/unit/property tests for valid replay, shuffled storage reads, deterministic ordering, cache rebuild equality, incompatible manifests, cyclic revision/mapping histories, cross-meeting references, and raw-event mutation attempts.
- [ ] Run the focused domain test and record the expected missing-contract failure.
- [ ] Implement pure normalized ordering and replay only; reject invalid histories before constructing a projection. Preserve raw candidates, gaps, disagreements, run locality/provider/model, and audio-manifest lineage.
- [ ] Rerun focused tests plus existing `packages/domain/src/finalization/*.test.ts` and transcript tests; emit `docs/execution/evidence/P16/projection-replay.json` with fixture hashes and no text content.
- [ ] Obtain specification and quality review before exposing the new domain exports.

### Task 2: P16-T02 — Owner-scoped provenance, comparison, decision, and revision API

**Files:** database/API paths in target map; tests beside each module.

**Interfaces:**

- Consumes: T01 replay command and existing authenticated owner context.
- Produces: owner-scoped `GET /v1/meetings/:meetingId/transcript-runs`, comparison/read-projection endpoints, and idempotent decision/revision commands returning the new projection reference or `409 TRANSCRIPT_REVISION_CONFLICT`.

- [ ] Write failing API/integration tests for two owners, cross-meeting/run access, incompatible lineage, stale optimistic base, concurrent edits/decisions, duplicate idempotency key, malicious text, outbox publication, replay-after-write, and negative source UPDATE/DELETE paths.
- [ ] Run only the new route/service tests against Testcontainers and confirm failures identify the missing behavior rather than environment setup.
- [ ] Add append-only tables/indexes/triggers and owner-scoped repository methods. Apply decisions/revisions transactionally with the base projection version checked in the same transaction; publish a content-free outbox invalidation after commit.
- [ ] Validate all request/response DTOs at runtime and map only safe errors. Do not return raw provider payloads, storage URLs, or transcript text in logs.
- [ ] Rerun the focused suite, database integrity/repository suites, and source-mutation-negative test; write `revision-api.json`; request independent immutability/conflict review.

### Task 3: P16-T03 — Versioned speaker rename and merge

**Files:** T01 domain mapping module, T02 repository/API module, matching tests.

**Interfaces:**

- Consumes: immutable raw speaker IDs, T01 projection/mapping version.
- Produces: append-only rename/merge command and `resolvePresentationSpeaker(rawSpeakerId, mappingVersion)`.

- [ ] Write failing tests for rename, merge confirmation, chains, self-reference/cycles, unknown speaker, concurrent base-version conflict, history replay, reversal via a new version, and unchanged raw diarization.
- [ ] Implement validated mapping graph construction and versioned projection rebuild; reject cycle/unknown/cross-meeting inputs before persistence.
- [ ] Expose owner-scoped endpoints and update run/projection/read DTOs without rewriting provider/raw speaker columns.
- [ ] Rerun domain, API, and DB integrity tests; emit `speaker-mapping.json`; pass a separate conflict/immutability review.

### Task 4: P16-T05 — Source evidence resolution and exact seek

**Files:** evidence navigation paths, existing audio manifest/object-store adapters, focused tests.

**Interfaces:**

- Consumes: canonical/candidate segment provenance and P14 verified source-manifest/range lineage.
- Produces: `EvidenceSeekResult` and a playback adapter that accepts only same-meeting track/range references.

- [ ] Write failing tests for mic/system alternatives, material disagreement candidates, revised presentation text, overlap boundaries, pause/gap, absent/corrupt source, expired URL refresh, cross-meeting rejection, and no-content logging.
- [ ] Implement a resolver that returns a visible unavailable state rather than approximating an audio range. Reauthorize and refresh a playback reference only after owner/meeting/track/range validation.
- [ ] Connect the resolver to desktop/mobile playback seams without passing arbitrary object URLs to renderers.
- [ ] Run focused resolver/player tests and existing manifest tests; emit `evidence-seek.json`; receive range/source review.

### Task 5: P16-T04 — Search, filters, flags, and bookmarks

**Files:** transcript-review database/API modules and tests.

**Interfaces:**

- Consumes: current projection rows, source/translation state, speaker mappings, ownership context.
- Produces: stable cursor query `{ items, nextCursor }` and idempotent owner-scoped bookmarks.

- [ ] Write failing integration tests for vi/en Unicode and diacritics, deterministic time/relevance ordering, stable cursor under ties, speaker/time/confidence/gap/source/revised/locality/disagreement filters, decision/revision refresh, deleted meeting, two users, and the synthetic two-hour dataset.
- [ ] Measure PostgreSQL query plan with the locked fixture. Add only required indexes and a bounded query shape; do not introduce a search service.
- [ ] Implement cursor encoding with the complete sort key, owner/meeting predicates in every query, and bookmarks tied to a stable segment/projection reference.
- [ ] Rerun integration/performance tests and record query plan/timing in `transcript-search.json`; pass query/privacy review.

### Task 6: P16-T06 — Accessible virtualized desktop and mobile review

**Files:** desktop/mobile transcript-review feature paths and component/E2E tests.

**Interfaces:**

- Consumes: read-projection, comparison, search/bookmark, revision/mapping, and evidence-seek contracts from T01-T05.
- Produces: desktop full review and mobile lightweight review that retain stable segment identity and exact seek behavior.

- [ ] Write failing component/E2E tests for a windowed two-hour list/timeline, stable keys/heights, manual-scroll disables follow-live, new-items affordance, search-result focus, exact seek, source/current/translation distinction, provenance panel, disagreement card, confirm/reject/correct dialogs, speaker rename/merge confirmation, gaps/unavailable evidence, and vi/en copy parity.
- [ ] Build the data adapter and virtualization layer before visual controls. Keep raw alternative, chosen projection, correction, gap, and unavailable states semantically distinct in DOM/accessibility labels.
- [ ] Add keyboard escape/enter/arrow navigation, visible focus, focus restoration after dialogs and seek, scalable text/AA tokens, screen-reader live announcements without content-bearing telemetry, and responsive layouts.
- [ ] Run desktop Playwright and mobile Maestro/component tests on the locked two-hour fixture; capture memory/latency traces and VoiceOver/TalkBack/Windows screen-reader observations in `transcript-ui-performance.json`.
- [ ] Request dedicated performance/accessibility review; fix and rerun every Critical/Important finding before integration.

### Task 7: P16-T07 — Integrated authorization, replay, accessibility, and performance gate

**Files:** `tests/p16/*`, `docs/execution/evidence/P16/*`, then control-plane documents only after direct verification.

**Interfaces:** consumes all reviewed T01-T06 contracts; produces acceptance evidence for P16-A01 through P16-A06.

- [ ] Assemble an end-to-end synthetic meeting with immutable local/cloud runs, translation versions, material disagreements, decisions, revisions, speaker mappings, bookmarks, mic/system source ranges, gaps, and corrupt/missing alternatives.
- [ ] Execute replay/cache-corruption, two-user/cross-meeting authorization, concurrent decision/revision, source mutation-negative, search cursor, exact seek, keyboard/screen-reader, vi/en, and two-hour scroll/search/seek/memory tests. Fail the gate for any hidden gap/unresolved disagreement or zero-test command.
- [ ] Run, in protocol order: format/generated consistency, lint/typecheck, unit, integration, contract, desktop/mobile E2E, security/privacy/integrity, resilience, performance, manual device/screen-reader matrix, then `pnpm.cmd verify`. Record exit code, intended/executed count, duration, environment, and artifact for each command.
- [ ] Complete `EVIDENCE.md` mapping every P16 acceptance ID to direct evidence. Update traceability, status, and append-only progress only if the evidence supports the stated lifecycle. Mark `VERIFIED` only when every external/manual binary gate passes; otherwise truthfully mark `IMPLEMENTED` or `BLOCKED`.
- [ ] Have a separate whole-phase reviewer inspect the actual diff and evidence, resolve findings, rerun affected tests, and stop at the P16 handoff before P17.

## Acceptance-to-evidence mapping

| Acceptance | Required direct evidence                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| P16-A01    | DB append-only/source mutation-negative API tests; immutable raw run/segment lineage report                     |
| P16-A02    | Replay/property, duplicate/stale/concurrent revision and speaker mapping tests                                  |
| P16-A03    | Owner-scoped run comparison/search/bookmark/mapping integration suite in vi/en/source/current/translation views |
| P16-A04    | Locked two-hour benchmark: memory, scroll position, search and exact seek traces                                |
| P16-A05    | Gap/missing/corrupt/disagreement UI and evidence-seek tests plus screen-reader output                           |
| P16-A06    | Two-owner authorization suite and desktop/mobile keyboard + screen-reader device matrix                         |

## Handoff conditions

- Do not start this plan until the P14/P15 dependency gate passes.
- Do not start P17 during or after P16 execution. P16's packet only permits the handoff record to name the phase newly unblocked.
- Preserve the existing dirty worktree. Commit only files created/changed by the executing P16 run after `detect_changes`/phase review verifies expected scope.
