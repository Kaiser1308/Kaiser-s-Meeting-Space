---
phase: P16
title: Transcript provenance, comparison, revisions, and evidence review
packet_status: ACCEPTED
depends_on: [P14, P15]
requirements: [FR-3, FR-4, NFR-Accessibility, NFR-Performance]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Users can review a two-hour current transcript, separate translation and every immutable live/local/cloud/check run with execution provenance. They can compare compatible local/cloud alternatives, seek material disagreements to exact audio, confirm/reject alternatives or enter attributable conflict-safe revisions, while gaps and unresolved evidence remain visible. Replaying immutable runs, mappings, decisions and revisions reconstructs the same current projection.

# Authoritative context

Read PRD FR-3/FR-4, User Flows transcript review, Data Model transcript/evidence, API transcript routes, ADR-002, P14 finalization/reconciliation evidence, P15 translation lineage, and Test Strategy scenarios 10,20.

# Preconditions and external prerequisites

P14/P15 are `VERIFIED`; fixed large synthetic two-hour transcript/audio/translation fixtures and desktop/mobile playback adapters are available.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P14        | Verified outputs and invariants consumed by this packet. | `../evidence/P14/EVIDENCE.md` | VERIFIED          |
| P15        | Verified outputs and invariants consumed by this packet. | `../evidence/P15/EVIDENCE.md` | VERIFIED          |

## Deferred end-to-end qualification lane

For implementation only, P16 may consume P14/P15 contracts at `IMPLEMENTED`
under
[`../DEFERRED_END_TO_END_QUALIFICATION.md`](../DEFERRED_END_TO_END_QUALIFICATION.md).
Its run record must carry every inherited open row. P16 cannot claim `VERIFIED`
until its dependencies and the inherited qualification rows are closed.

# Scope firewall

**Allowed:** transcript run/provenance/comparison/projection-decision/revision/speaker/search/marker API/services, desktop full/mobile lightweight review UI, virtualization, evidence seek, accessibility/performance/conflict tests.

**Forbidden/out:** source audio/event mutation, minutes editing, exports, collaboration, replacing source with corrections, hidden gaps, and search service addition without measured need/ADR.

**Extension seams:** projection engine consumes append-only revisions/mappings and versioned algorithm; PostgreSQL search can later be replaced behind query contract.

# Contracts and invariants

- `TranscriptProjectionRef` pins source finalization/reconciliation version plus selected revision/speaker-mapping version.
- Run APIs expose locality, engine/provider/model, audio-manifest lineage, requested ranges, consent reference, state and safe errors without raw provider payloads.
- Comparisons require the same meeting and compatible audio-manifest lineage.
- Material names/numbers/dates/currencies/decisions/action disagreements remain visible until a versioned decision.
- Confirm local, confirm cloud or manual correction requires an optimistic base-projection version and preserves both raw alternatives.
- Revision command requires owner, segment, base revision/version, revised text and/or presentation speaker, actor, reason, idempotency.
- Speaker rename/merge changes mapping versions only, not provider/raw diarization.
- Evidence seek resolves same-meeting source track/time availability; missing/corrupt/gap is displayed, not approximated.
- Search result identifies source/current/revised state, speaker, timestamp, gap/confidence, and stable cursor.

# File and ownership map

| Path                                  | Responsibility                      | Owner                |
| ------------------------------------- | ----------------------------------- | -------------------- |
| domain transcript projection modules  | revisions/mappings/replay contracts | Revision model       |
| API transcript/speaker/search modules | owner/conflict/idempotency/query    | Revision model       |
| desktop/mobile transcript feature     | virtualized review, filters, edits  | Review UI            |
| shared evidence player contract       | source availability/seek            | Audio navigation     |
| transcript a11y/perf/E2E tests        | replay/conflict/two-hour/seek       | Independent reviewer |

# Ordered task packets

## P16-T01 - Run provenance, projection and replay contracts

Define run/part provenance, comparison, source event/final segment/reconciliation/current projection/decision/revision/speaker mapping refs and pure replay. Golden/property tests shuffle storage reads, rebuild caches, apply histories, and reject broken/cyclic/cross-meeting or incompatible-manifest lineage. Evidence: `evidence/P16/projection-replay.json`.

## P16-T02 - Owner-scoped run, comparison, and revision API

Implement owner-scoped run detail/list, compatible-run comparison, projection decision and idempotent revision history with base-version conflict, runtime validation, safe errors, outbox update and no source update path. Test two users, cross-meeting/run, concurrent decisions/edits, duplicate key, stale base, malicious text and replay. Evidence: `revision-api.json`.

## P16-T03 - Versioned speaker rename and merge

Implement mapping operations with stable participant/speaker IDs, merge confirmation, conflict/version history, reversible projection rebuild, and propagation to transcript views without rewriting raw events. Test chains/cycles/concurrency/unknown speaker. Evidence: `speaker-mapping.json`.

## P16-T04 - Search, flags, bookmarks, and completeness filters

Implement owner-scoped PostgreSQL search/pagination over transcript/translation current projection, speaker, time, confidence/gap/source/revised/run-locality/disagreement flags and bookmarks. Test vi/en Unicode/diacritics, ordering/cursor, decision/revision refresh, deleted meeting, two users and large dataset. Evidence: `transcript-search.json`.

## P16-T05 - Source evidence resolution and seek

Resolve each canonical segment and local/cloud alternative to independent source tracks and exact ranges; implement seek/play/highlight with pauses/gaps/missing/corrupt state. Test both disagreement alternatives, URL expiry, absent track, revised text, overlap boundaries and no content logging. Evidence: `evidence-seek.json`.

## P16-T06 - Accessible virtualized two-hour review UI

Build windowed list/timeline with stable keys/heights, run-provenance panel, local/cloud comparison and material-disagreement cards, follow-live/new-items behavior, search navigation, source/current/translation distinctions, confirm/reject/correct and speaker dialogs, keyboard/screen-reader/focus, and responsive exact seek. Evidence: `transcript-ui-performance.json`.

## P16-T07 - Integrated authorization/conflict/replay/a11y/performance gate

Run run/projection replay, local/cloud comparison and decision conflict, two-user/cross-meeting isolation, corrupted cache, large transcript scroll/search/exact seek, keyboard/TalkBack/Windows screen reader, vi/en, gap/unresolved-disagreement visibility, and memory/latency benchmarks. Evidence: `evidence/P16/EVIDENCE.md`.

# Subagent work packages

| Package         | Tasks   | Exclusive paths        | Depends on | Review gate                     |
| --------------- | ------- | ---------------------- | ---------- | ------------------------------- |
| Revision/API    | T01-T03 | domain/API transcript  | P14,P15    | immutability/conflict review    |
| Search/UI       | T04,T06 | search + transcript UI | T01-T03    | performance/a11y review         |
| Evidence player | T05     | player/contracts       | P14        | range/source review             |
| Independent QA  | T07     | tests/evidence         | all        | replay/two-user/two-hour review |

# Failure and debugging matrix

| Failure                  | Classification | Expected behavior                                | Recovery/regression |
| ------------------------ | -------------- | ------------------------------------------------ | ------------------- |
| Concurrent correction    | concurrency    | Explicit conflict/reapply; no last-write loss    | race test           |
| Missing source range     | persistence    | Transcript visible with unavailable/gap marker   | seek fault test     |
| Projection cache corrupt | state          | Rebuild same result from immutable history       | replay test         |
| Long transcript stalls   | performance    | Profile/fix; bounded memory and response target  | two-hour benchmark  |
| Speaker merge cycle      | contract       | Reject without mapping mutation                  | graph property test |
| Incompatible run compare | contract       | Reject without projection mutation               | lineage test        |
| Local/cloud disagreement | review         | Preserve both, require explicit versioned choice | decision replay     |

# Integrated verification

Run projection property/replay, API authorization/conflict, DB search integration, player/URL tests, desktop/mobile component/E2E, two-hour performance/memory, accessibility/localization, source mutation negatives, and `pnpm verify`.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P16/EVIDENCE.md` |

# Acceptance gate

- [ ] P16-A01 - Review actions cannot overwrite/delete raw transcript/audio evidence.
- [ ] P16-A02 - All text/speaker corrections are attributable, conflict-safe, and replayable to same projection.
- [ ] P16-A03 - Run provenance/comparison/search/filter/bookmark and speaker mapping stay consistent across vi/en/source/current/translation views.
- [ ] P16-A04 - Two-hour review meets documented memory/scroll/search/seek responsiveness targets.
- [ ] P16-A05 - Every gap/missing/corrupt/unresolved material disagreement remains visible, accessible and seekable to exact audio.
- [ ] P16-A06 - Owner isolation and keyboard/screen-reader critical paths pass.

# Migration, rollout, and rollback

Internal review feature; projection algorithm/schema versions remain replayable. Rollback selects prior renderer/algorithm without deleting newer revisions.

# Required documentation updates

Data Model/API projection/revision/search, User Flows interaction, Test Strategy measured UI targets, Status/Traceability/Progress, and P16 evidence.

# Conversation boundary

Do not mutate source audio/run events, silently choose a local/cloud alternative, implement minutes/export, add collaboration, hide gaps/disagreements, or add a search service without evidence and ADR. Stop before P17.

# Handoff record

Unblock P17 when P06/P14 are also verified; stop.
