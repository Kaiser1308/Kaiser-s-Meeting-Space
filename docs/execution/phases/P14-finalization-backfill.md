---
phase: P14
title: Meeting finalization, file backfill, reconciliation, and completeness
status: NOT_STARTED
depends_on: [P06, P10, P13]
requirements: [FR-3, FR-4, NFR-Reliability, NFR-Performance]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Ending a mobile or desktop meeting produces an immutable expected-source manifest, verifies every uploaded range, transcribes missing realtime ranges from durable audio, reconciles events/speakers deterministically, and publishes a truthful completeness state before downstream translation/AI can run.

# Authoritative context

Read PRD FR-2-FR-5/release rules, User Flows End/processing/failure, Data Model transcript/evidence, AI/Speech provider file contract, P05/P06/P07/P10/P13 evidence, ADR-001/002/003, and Test Strategy scenarios 5,8,9.

# Preconditions and external prerequisites

P06/P10/P13 are `VERIFIED`; real storage/jobs/Deepgram file transcription test capability and fixed synthetic two-hour manifests/audio are available. Provider outage is an expected partial state but a successful real backfill gate requires authorized provider access.

# Scope firewall

**Allowed:** finalize/close contracts/routes/services/jobs, immutable source manifest, storage verification, file backfill, realtime/backfill reconciliation, speaker mapping input, completeness model/API/client status, fault/E2E tests.

**Forbidden/out:** translation, transcript edits, minutes, source deletion/mutation, invented audio/transcript ranges, and hiding/waiving gaps without explicit approved user/policy action.

**Extension seams:** file transcription uses P13 provider interface; reconciliation algorithms/config are versioned and replayable.

# Contracts and invariants

- `FinalizationManifestV1` pins meeting/version, sources, intervals, expected chunk IDs/order/ranges/hashes/formats, pauses/gaps, client close time, and local manifest hash.
- End is idempotent and moves through finalizing/processing/partial_ready/ready/recovery-required only through P02 transition rules.
- Storage verification classifies every range as verified, missing, corrupt, overlapping, pending, paused, gap, or explicitly waived with actor/reason.
- Realtime and backfill source events remain immutable; current final projection records versioned reconciliation lineage.
- Completeness includes coverage by source/time, pending/known gaps/diarization/translation readiness; unknown never maps to complete.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| domain finalization/completeness modules | manifests/states/reconciliation contracts | Manifest |
| API meeting finalization module | End/verify/status commands | Manifest |
| worker finalization/backfill modules | storage verification/file transcription/retry | Backfill |
| transcript reconciliation module | event dedupe/range/speaker projection | Reconciler |
| mobile/desktop processing/recovery UI | truthful status/actions | Client |
| finalization fault/golden tests | crash/provider/storage/two-hour | Independent reviewer |

# Ordered task packets

## P14-T01 - Immutable close/finalization contract and state machine

Define manifest/completeness/range/waiver/reconciliation schemas and state transitions. Test invalid source/order/hash/range/version, missing source, repeated End, illegal downstream start, and immutability. Evidence: `evidence/P14/finalization-contract.json`.

## P14-T02 - Local-first idempotent End command

On client close active chunks and atomically commit local manifest before authenticated server End; server transaction records expected manifest/job/outbox once. Crash/retry at local close/request/DB/outbox boundaries. Evidence: `end-fault-matrix.json`.

## P14-T03 - Uploaded source verification and range accounting

HEAD/check all expected objects/metadata/hash/length/order/range/source and compute missing/corrupt/overlap/pending/unconfirmed sets deterministically. Test late uploads, duplicates, object mutation, multi-source drift/gaps, and repeated verification. Evidence: `source-verification.json`.

## P14-T04 - Provider-neutral file backfill jobs

Register file-transcription job for missing realtime/approved low-confidence ranges with exact audio slice/source/language/provider/config, bounded retries/cancel/budget, and immutable raw results. Test outage/rate/timeout/malformed/partial/cancel/restart. Evidence: `backfill-job-report.json`.

## P14-T05 - Realtime/backfill deterministic reconciliation

Version algorithm that dedupes by event identity/range/text provenance, handles overlaps/disagreement/late events, preserves all raw events, and creates stable ordered source projection without duplicate speech. Golden/property/replay tests cover boundary tolerances and algorithm upgrade. Evidence: `reconciliation-report.json`.

## P14-T06 - Stable meeting speaker reconciliation

Map provider/session speaker labels to stable meeting speakers using versioned evidence/confidence while retaining raw labels. Unknown/ambiguous stays explicit; no identity inference. Test session rollover, conflicting labels, missing diarization, and deterministic replay. Evidence: `speaker-reconcile.json`.

## P14-T07 - Completeness calculation and downstream gate

Compute range coverage/source states/pending/gaps/waivers/diarization into `needs_recovery | processing | partial_ready | final_ready`; expose API/UI and block translation/minutes jobs from unknown/non-policy-approved input. Test thresholds/boundaries/races/late completion. Evidence: `completeness-report.json`.

## P14-T08 - Two-hour finalization and recovery qualification

Run mobile and Windows synthetic meetings with disconnect, late/missing/corrupt chunks, duplicated/disagreeing realtime, provider outage/recovery, worker/Redis/API crash, repeated End, and multi-source gaps. Replay yields same projection/completeness and accounts every range. Evidence: `evidence/P14/EVIDENCE.md`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Manifest/API | T01-T03 | finalization domain/API | P10,P05 | state/storage review |
| Backfill | T04 | worker backfill | P06,P13 | provider/job review |
| Reconciler | T05-T07 | transcript/completeness | T01,T03,T04 | determinism/immutability review |
| Independent E2E | T08 | tests/evidence | all | two-hour/data-integrity review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Client dies during End | timing | Local manifest resumes; repeated End safe | boundary test |
| Chunk hash mismatch | persistence | Quarantine/range recovery; no complete claim | corruption test |
| Backfill unavailable | provider | `partial_ready`/processing with retry action | outage test |
| Realtime/backfill disagree | contract | Preserve both and deterministic projection | golden replay |
| Source absent | state | Explicit gap/recovery, never infer silence | range test |

# Integrated verification

Run finalization state/property, real storage verification, job/backfill integration/live synthetic, reconciliation golden/replay, API/client E2E, two-hour resilience, source mutation/security tests, and `pnpm verify`. Inspect every expected range classification.

# Acceptance gate

- [ ] P14-A01 - Every expected source range is verified, pending, missing, corrupt, paused, gap, or explicitly waived with evidence.
- [ ] P14-A02 - End/finalization/backfill/reconciliation are idempotent and restart/replay safe.
- [ ] P14-A03 - Unknown/incomplete data cannot silently start downstream translation/AI.
- [ ] P14-A04 - Raw audio/realtime/backfill events remain immutable and projection lineage is complete.
- [ ] P14-A05 - Mobile/desktop two-hour fault scenarios expose actionable truthful states with no silent range loss.
- [ ] P14-A06 - Real provider file backfill passes fixed vi/en synthetic cases or phase records exact external blocker.

# Migration, rollout, and rollback

Internal flag; deploy schemas/read status before job generation. Rollback pauses new finalization/backfill while preserving manifests/jobs/events for replay.

# Required documentation updates

API End/status, Data Model completeness/reconciliation, User Flows processing states, Operations finalization incident, Status/Traceability/Progress, and P14 evidence.

# Handoff record

Unblock P15 and P28; P16 waits for P15. Stop.
