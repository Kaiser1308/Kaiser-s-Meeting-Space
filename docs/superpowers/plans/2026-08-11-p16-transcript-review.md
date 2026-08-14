# P16 Transcript Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver conflict-safe transcript provenance, revisions, speaker mapping, search, evidence seek, and accessible two-hour review without mutating source evidence.

**Architecture:** Build a pure replayable projection model over immutable P14 runs and P15 translation versions. Owner-scoped APIs append decisions/revisions/mappings; desktop and mobile clients query a paginated read model and resolve exact audio through a narrow evidence-player contract.

**Tech Stack:** TypeScript/Zod, Drizzle/PostgreSQL, Fastify, Vitest/fast-check, React/Electron, React Native, existing P10 playback hooks.

## Global Constraints

- Execute only P16 and stop before P17.
- P14/P15 may be consumed at `IMPLEMENTED` through the deferred ledger; open inherited rows cap P16 at `IMPLEMENTED`.
- Raw transcript runs/events and audio are immutable; edits append revisions or mapping/decision versions.
- Comparison requires same meeting and compatible audio-manifest lineage.
- Missing/corrupt/gap evidence remains visible and is never approximated.
- Do not add an external search service without measured PostgreSQL failure and an ADR.

## File Map

- Create `packages/domain/src/review/{projection,decisions,revisions,speakers,search,evidence}.ts` with tests and exports.
- Extend `packages/database/src/schema/transcript.ts`, `repositories/transcript.ts`, and add migration `0010_transcript_review.sql` plus integration tests.
- Create `apps/api/src/modules/transcript-review/{dto,service,routes,index}.ts` and tests.
- Create `apps/desktop/src/features/transcript-review/` for full review and `apps/mobile/src/features/transcript-review/` for lightweight review.
- Extend `apps/mobile/src/features/player/hooks/use-source-playback.ts`; add a desktop evidence-player adapter.
- Evidence destination: `docs/execution/evidence/P16/`.

### Task 1: P16-T01 — Projection, provenance, and replay

**Interfaces:** Produce `TranscriptProjectionRef`, `ProjectionHistory`, and `replayTranscriptProjection(history): TranscriptProjection`.

- [ ] Write failing golden/property tests for shuffled reads, cache rebuild, decision/revision history, broken/cyclic/cross-meeting lineage, incompatible manifests, and stable serialization.
- [ ] Run `pnpm --filter @kms/domain exec vitest run src/review/projection.test.ts` and confirm the missing model fails.
- [ ] Implement strict refs and pure replay that preserves raw alternatives and unresolved material disagreements.
- [ ] Rerun tests repeatedly with seeded shuffle plus domain typecheck.
- [ ] Record `projection-replay.json`; commit `feat(p16): add replayable transcript projection`.

### Task 2: P16-T02 — Owner-scoped run/comparison/revision API

**Interfaces:** Produce list/detail/compare/decision/revision operations with owner scope, `baseProjectionVersion`, idempotency, and typed `409` conflicts.

- [ ] Add failing API/repository tests for two users, cross-meeting/run, stale base, concurrent edits, duplicate keys, malicious text, and no source-update path.
- [ ] Run focused API and database tests; capture intended authorization/conflict failures.
- [ ] Add append-only tables/repositories and Fastify routes; transactionally select current projection and emit outbox events.
- [ ] Run migration, PostgreSQL, API contract, replay, and source-mutation-negative tests.
- [ ] Record `revision-api.json`; commit `feat(p16): add transcript review API`.

### Task 3: P16-T03 — Versioned speaker rename and merge

**Interfaces:** Produce `SpeakerMappingVersion` and commands `renameSpeaker`/`mergeSpeakers` with optimistic base version and cycle rejection.

- [ ] Write failing graph/property tests for rename, merge chains, cycles, unknown IDs, concurrency, reversibility, and raw-label immutability.
- [ ] Run the focused speaker suite and confirm missing mapping behavior.
- [ ] Implement mapping operations and projection rebuild; retain provider/session/window labels unchanged.
- [ ] Run speaker tests plus API authorization/replay regressions.
- [ ] Record `speaker-mapping.json`; commit `feat(p16): version speaker mappings`.

### Task 4: P16-T04 — PostgreSQL search, flags, bookmarks, filters

**Interfaces:** Produce owner-scoped cursor query over source/current/revised/translation text, speaker, time, run locality, disagreement, gap, confidence, and bookmark state.

- [ ] Add failing repository/API tests for vi/en Unicode/diacritics, deterministic cursor order, revision refresh, deleted meetings, two owners, and large pages.
- [ ] Run PostgreSQL integration and capture missing search/index/query behavior.
- [ ] Add additive indexes/read model/bookmark persistence and cursor validation; keep PostgreSQL as the only search backend.
- [ ] Run integration tests and record query plans/latency with synthetic large fixtures.
- [ ] Record `transcript-search.json`; commit `feat(p16): add transcript search and bookmarks`.

### Task 5: P16-T05 — Exact source evidence resolution

**Interfaces:** Produce `EvidenceTarget` resolution for canonical and alternative segments and a player port `seek(target): Promise<EvidenceAvailability>`.

- [ ] Write failing tests for both disagreement alternatives, expired URL refresh, absent/corrupt track, revised text, overlap boundaries, wrong owner/meeting, and content-free logs.
- [ ] Run API/player tests and verify missing range/source handling fails.
- [ ] Implement owner-scoped resolution through P05/P10 playback, exact source/time validation, visible availability states, and focus-return metadata.
- [ ] Run mobile/desktop adapters, API signed-URL, and source-integrity regressions.
- [ ] Record `evidence-seek.json`; commit `feat(p16): resolve transcript evidence audio`.

### Task 6: P16-T06 — Accessible virtualized two-hour UI

**Interfaces:** Desktop full review and mobile lightweight review consume paginated `TranscriptReviewPage`; stable item keys are segment/projection IDs, never array indexes.

- [ ] Write failing component/E2E cases for virtualization, manual-scroll auto-follow disablement, search navigation, provenance, comparisons, correction/speaker dialogs, exact seek, focus restoration, 200% text, keyboard and screen reader.
- [ ] Run focused UI tests and baseline a synthetic two-hour fixture for memory/scroll/search/seek.
- [ ] Implement windowed rendering without introducing a new framework unless approved; separate source/current/translation and keep gap/disagreement cards persistent.
- [ ] Rerun component/E2E/performance tests on desktop and supported Android UI where available.
- [ ] Record `transcript-ui-performance.json`; commit `feat(p16): build accessible transcript review`.

### Task 7: P16-T07 — Integrated qualification and handoff

**Interfaces:** Produce complete P16 evidence, preserving deferred lifecycle ceiling.

- [ ] Run projection replay/property, API authorization/conflict, PostgreSQL search, player/URL, desktop/mobile component/E2E, source mutation negatives, and localization suites.
- [ ] Run two-hour virtualization benchmarks and manual keyboard/screen-reader paths in the required environments; record unavailable paths without pass claims.
- [ ] Run `pnpm verify` and capture exact exit codes/counts, warnings, skips, and artifacts.
- [ ] Map P16-A01 through P16-A06; keep A04/A06 open if required performance/device/manual evidence is incomplete.
- [ ] Update evidence/status/traceability/progress, run GitNexus change detection, and stop before P17.

## Final Review Checklist

- [ ] Replay from immutable history produces the same projection.
- [ ] Concurrent edits return explicit conflicts and never last-write-win.
- [ ] Every visible correction retains actor/reason/base lineage.
- [ ] Gaps, corruption, and unresolved disagreements remain visible and seekable.
- [ ] Two-owner and accessibility critical paths have direct evidence or remain open.
