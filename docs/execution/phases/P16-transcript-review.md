---
phase: P16
title: Transcript review, revisions, speakers, search, and evidence navigation
status: NOT_STARTED
depends_on: [P14, P15]
requirements: [FR-3, FR-4, NFR-Accessibility, NFR-Performance]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Users can review a two-hour source/current transcript and separate translation, create attributable conflict-safe text/speaker revisions, search/filter/bookmark, and seek exact source audio while gaps/unavailable evidence remain visible. Replaying immutable events/revisions reconstructs the same current projection.

# Authoritative context

Read PRD FR-3/FR-4, User Flows transcript review, Data Model transcript/evidence, API transcript routes, ADR-002, P14 finalization/reconciliation evidence, P15 translation lineage, and Test Strategy scenarios 10,20.

# Preconditions and external prerequisites

P14/P15 are `VERIFIED`; fixed large synthetic two-hour transcript/audio/translation fixtures and desktop/mobile playback adapters are available.

# Scope firewall

**Allowed:** transcript projection/revision/speaker/search/marker API/services, desktop full/mobile lightweight review UI, virtualization, evidence seek, accessibility/performance/conflict tests.

**Forbidden/out:** source audio/event mutation, minutes editing, exports, collaboration, replacing source with corrections, hidden gaps, and search service addition without measured need/ADR.

**Extension seams:** projection engine consumes append-only revisions/mappings and versioned algorithm; PostgreSQL search can later be replaced behind query contract.

# Contracts and invariants

- `TranscriptProjectionRef` pins source finalization/reconciliation version plus selected revision/speaker-mapping version.
- Revision command requires owner, segment, base revision/version, revised text and/or presentation speaker, actor, reason, idempotency.
- Speaker rename/merge changes mapping versions only, not provider/raw diarization.
- Evidence seek resolves same-meeting source track/time availability; missing/corrupt/gap is displayed, not approximated.
- Search result identifies source/current/revised state, speaker, timestamp, gap/confidence, and stable cursor.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| domain transcript projection modules | revisions/mappings/replay contracts | Revision model |
| API transcript/speaker/search modules | owner/conflict/idempotency/query | Revision model |
| desktop/mobile transcript feature | virtualized review, filters, edits | Review UI |
| shared evidence player contract | source availability/seek | Audio navigation |
| transcript a11y/perf/E2E tests | replay/conflict/two-hour/seek | Independent reviewer |

# Ordered task packets

## P16-T01 - Source/current projection and replay contracts

Define source event/final segment/reconciliation/current projection/revision/speaker mapping refs and pure replay. Golden/property tests shuffle storage reads, rebuild caches, apply histories, and reject broken/cyclic/cross-meeting lineage. Evidence: `evidence/P16/projection-replay.json`.

## P16-T02 - Optimistic revision API

Implement owner-authorized idempotent revision create/read/history with base version conflict, runtime validation, safe errors, outbox update, and no source update path. Test two users, concurrent edits, duplicate key, stale base, empty/oversized/malicious text, and replay. Evidence: `revision-api.json`.

## P16-T03 - Versioned speaker rename and merge

Implement mapping operations with stable participant/speaker IDs, merge confirmation, conflict/version history, reversible projection rebuild, and propagation to transcript views without rewriting raw events. Test chains/cycles/concurrency/unknown speaker. Evidence: `speaker-mapping.json`.

## P16-T04 - Search, flags, bookmarks, and completeness filters

Implement owner-scoped PostgreSQL search/pagination over title-independent transcript/translation current projection, speaker, time, confidence/gap/source/revised flags and bookmarks. Test vi/en Unicode/diacritics, ordering/cursor, revision refresh, deleted meeting, two users, large dataset. Evidence: `transcript-search.json`.

## P16-T05 - Source evidence resolution and seek

Resolve each segment/evidence range to independent source tracks/local/cloud availability and implement seek/play/highlight with pauses/gaps/missing/corrupt state. Test URL expiry, absent track, revised text, boundary ranges, and no content logging. Evidence: `evidence-seek.json`.

## P16-T06 - Accessible virtualized two-hour review UI

Build windowed list/timeline with stable keys/heights, follow-live toggle/new-items indicator, manual-scroll disable, search navigation, source/current/translation distinctions, edit/speaker dialogs, keyboard/screen-reader/focus, and responsive seek. Evidence: `transcript-ui-performance.json`.

## P16-T07 - Integrated authorization/conflict/replay/a11y/performance gate

Run projection rebuild, multi-editor conflict, two-user, corrupted cache, large transcript scroll/search/seek, keyboard/VoiceOver/TalkBack/Windows screen reader, vi/en, gap visibility, and memory/latency benchmarks. Evidence: `evidence/P16/EVIDENCE.md`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Revision/API | T01-T03 | domain/API transcript | P14,P15 | immutability/conflict review |
| Search/UI | T04,T06 | search + transcript UI | T01-T03 | performance/a11y review |
| Evidence player | T05 | player/contracts | P14 | range/source review |
| Independent QA | T07 | tests/evidence | all | replay/two-user/two-hour review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Concurrent correction | concurrency | Explicit conflict/reapply; no last-write loss | race test |
| Missing source range | persistence | Transcript visible with unavailable/gap marker | seek fault test |
| Projection cache corrupt | state | Rebuild same result from immutable history | replay test |
| Long transcript stalls | performance | Profile/fix; bounded memory and response target | two-hour benchmark |
| Speaker merge cycle | contract | Reject without mapping mutation | graph property test |

# Integrated verification

Run projection property/replay, API authorization/conflict, DB search integration, player/URL tests, desktop/mobile component/E2E, two-hour performance/memory, accessibility/localization, source mutation negatives, and `pnpm verify`.

# Acceptance gate

- [ ] P16-A01 - Review actions cannot overwrite/delete raw transcript/audio evidence.
- [ ] P16-A02 - All text/speaker corrections are attributable, conflict-safe, and replayable to same projection.
- [ ] P16-A03 - Search/filter/bookmark and speaker mapping stay consistent across vi/en/source/current/translation views.
- [ ] P16-A04 - Two-hour review meets documented memory/scroll/search/seek responsiveness targets.
- [ ] P16-A05 - Every gap/missing/corrupt evidence state remains visible and accessible.
- [ ] P16-A06 - Owner isolation and keyboard/screen-reader critical paths pass.

# Migration, rollout, and rollback

Internal review feature; projection algorithm/schema versions remain replayable. Rollback selects prior renderer/algorithm without deleting newer revisions.

# Required documentation updates

Data Model/API projection/revision/search, User Flows interaction, Test Strategy measured UI targets, Status/Traceability/Progress, and P16 evidence.

# Handoff record

Unblock P17 when P06/P14 are also verified; stop.
