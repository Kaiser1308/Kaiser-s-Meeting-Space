---
phase: P14
title: Meeting finalization, final-run orchestration, reconciliation, and completeness
packet_status: ACCEPTED
depends_on: [P06, P10, P13]
requirements: [FR-3, FR-4, NFR-Reliability, NFR-Performance]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Ending a mobile or desktop meeting produces an immutable expected-source manifest, verifies every durable range, and orchestrates exactly the selected primary final mode: none, desktop local or consented cloud. Local windows and cloud batch/window parts resume durably; optional cloud check runs only after local completion and exact approval. Immutable run events reconcile deterministically into a versioned projection with truthful `waiting_for_desktop`, `waiting_for_model`, completeness and review-required states before downstream translation/AI can run.

# Authoritative context

Read PRD FR-2-FR-5/release rules, User Flows End/processing/failure, Data Model transcript/evidence, AI/Speech provider file contract, P05/P06/P07/P10/P13 evidence, ADR-001/002/003, and Test Strategy scenarios 5,8,9.

# Preconditions and external prerequisites

P06 is `VERIFIED`. P10/P13 are required to be `VERIFIED` for P14 verification;
for P14 implementation only, their named finalization inputs may be consumed at
`IMPLEMENTED` through the deferred qualification lane below. Real storage/jobs,
verified Windows local-file capability, authorized cloud file transcription
capability, and fixed synthetic/consented two-hour manifests/audio remain
mandatory closure prerequisites. Provider/model/desktop outage is an expected
truthful state, but local and cloud acceptance require their named real
environments.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P06        | Verified outputs and invariants consumed by this packet. | `../evidence/P06/EVIDENCE.md` | VERIFIED          |
| P10        | Verified outputs and invariants consumed by this packet. | `../evidence/P10/EVIDENCE.md` | VERIFIED          |
| P13        | Verified outputs and invariants consumed by this packet. | `../evidence/P13/EVIDENCE.md` | VERIFIED          |

## Deferred end-to-end qualification lane

For implementation only, P14 may consume the directly evidenced P10 sync and
P13 final-run contracts at `IMPLEMENTED` under
[`../DEFERRED_END_TO_END_QUALIFICATION.md`](../DEFERRED_END_TO_END_QUALIFICATION.md).
The fresh run record must identify those contracts and inherit their open rows.
P14 is capped at `IMPLEMENTED` until the inherited rows and P14's own integrated
finalization rows are closed.

# Scope firewall

**Allowed:** finalize/close contracts/routes/services/jobs, immutable source manifest, storage verification, mutually exclusive local/cloud final orchestration, deterministic run-part checkpoints, cloud full-batch/window fallback, post-local approved cloud check, uncertain-range suggestions, overlap/run/speaker reconciliation, completeness model/API/client status, fault/E2E tests.

**Forbidden/out:** translation, transcript edits, minutes, source deletion/mutation, invented audio/transcript ranges, and hiding/waiving gaps without explicit approved user/policy action.

**Extension seams:** all speech execution uses P13 provider/local-file, run/part and window contracts; reconciliation algorithms/config and projection decisions are versioned and replayable. P16 owns human review.

# Contracts and invariants

- `FinalizationManifestV1` pins meeting/version, sources, intervals, expected chunk IDs/order/ranges/hashes/formats, pauses/gaps, client close time, and local manifest hash.
- End is idempotent and moves through finalizing/processing/partial_ready/ready/recovery-required only through P02 transition rules.
- Storage verification classifies every range as verified, missing, corrupt, overlapping, pending, paused, gap, or explicitly waived with actor/reason.
- Policy creates exactly one primary final action. Missing desktop/model waits truthfully; local failure never creates cloud work.
- Local final executes deterministic P13 windows per part. Cloud final prefers a full batch and falls back to P13 windows only with the same provider, consent and approved range.
- Completed run parts and raw live/local/cloud/check events remain immutable; restart resumes incomplete parts only.
- Cloud check requires completed local final plus exact range/full approval and never changes the projection automatically.
- Current final projection records versioned overlap/run/speaker reconciliation and retains ambiguous boundary/disagreement candidates for P16.
- Completeness includes coverage by source/time, pending/known gaps/diarization/translation readiness; unknown never maps to complete.

# File and ownership map

| Path                                     | Responsibility                                | Owner                |
| ---------------------------------------- | --------------------------------------------- | -------------------- |
| domain finalization/completeness modules | manifests/states/reconciliation contracts     | Manifest             |
| API meeting finalization module          | End/verify/status commands                    | Manifest             |
| worker finalization/backfill modules     | storage verification/file transcription/retry | Backfill             |
| transcript reconciliation module         | event dedupe/range/speaker projection         | Reconciler           |
| mobile/desktop processing/recovery UI    | truthful status/actions                       | Client               |
| finalization fault/golden tests          | crash/provider/storage/two-hour               | Independent reviewer |

# Ordered task packets

## P14-T01 - Immutable close, policy decision, and finalization contracts

Define manifest/completeness/range/waiver/reconciliation schemas, exactly-one-primary final decision and waiting/review states. Test every policy/readiness pair, invalid source/order/hash/range/version, missing source, repeated End, illegal downstream start, missing cloud consent and immutability. Evidence: `evidence/P14/finalization-contract.json`.

## P14-T02 - Local-first idempotent End command

On client close active chunks and atomically commit local manifest before authenticated server End; server transaction records expected manifest/job/outbox once. Crash/retry at local close/request/DB/outbox boundaries. Evidence: `end-fault-matrix.json`.

## P14-T03 - Uploaded source verification and range accounting

HEAD/check all expected objects/metadata/hash/length/order/range/source and compute missing/corrupt/overlap/pending/unconfirmed sets deterministically. Test late uploads, duplicates, object mutation, multi-source drift/gaps, and repeated verification. Evidence: `source-verification.json`.

## P14-T04 - Durable local/cloud final-run jobs

Execute local final from deterministic P13 windows with per-part checkpoints. Execute cloud final as a full batch when capabilities permit or equivalent windows within unchanged consent/provider/scope. Persist immutable raw results with bounded retry/cancel/budget. Test model/desktop/provider outage, batch limit/failure, scope expansion attempt, malformed/partial/cancel/crash/restart and completed-part non-replay. Evidence: `final-run-job-report.json`.

## P14-T05 - Overlap and multi-run deterministic reconciliation

Version an algorithm that uses source-range identity, timestamps and normalized token similarity to reconcile overlaps without generative rewriting. It dedupes by event identity/provenance, handles disagreement/late events, preserves raw candidates and creates a stable ordered projection without loss or duplicate speech. Golden/property/replay tests cover punctuation, drift, missing/extra word, homophone, silence, speaker conflict, ambiguity and algorithm upgrade. Evidence: `reconciliation-report.json`.

## P14-T06 - Stable speakers and sequential cloud check

Map provider/session/window labels to stable meeting speakers using versioned evidence/confidence while retaining raw labels; numeric labels across windows never imply identity. After local completion, suggest uncertain ranges from explicit gaps, confidence, overlap, signal quality and material entities, then require exact provider/scope/usage approval before a separate cloud-check run. Unknown/ambiguous stays explicit and check output cannot replace the projection. Evidence: `speaker-cloud-check.json`.

## P14-T07 - Completeness calculation and downstream gate

Compute range coverage/source states/pending/gaps/waivers/diarization into `waiting_for_desktop | waiting_for_model | needs_recovery | processing | partial_ready | review_required | final_ready`; expose API/UI and block translation/minutes from unknown/non-policy-approved input. Count every expected range exactly once as canonical text or explicit gap. Test thresholds/boundaries/races/late completion and unresolved cloud disagreements. Evidence: `completeness-report.json`.

## P14-T08 - Two-hour finalization and recovery qualification

Run mobile and Windows two-hour synthetic meetings across record-only/local/cloud/local-check, waiting desktop/model, disconnect, late/missing/corrupt chunks, boundary speech, duplicated/disagreeing live, batch fallback, provider outage, worker/Redis/API/native crash, cancellation, repeated End and multi-source gaps. Replay yields the same plan/projection/completeness, resumes incomplete parts only and accounts every range. Evidence: `evidence/P14/EVIDENCE.md`.

# Subagent work packages

| Package           | Tasks   | Exclusive paths         | Depends on  | Review gate                     |
| ----------------- | ------- | ----------------------- | ----------- | ------------------------------- |
| Manifest/API      | T01-T03 | finalization domain/API | P10,P05     | state/storage review            |
| Run orchestration | T04     | worker final runs       | P06,P13     | consent/checkpoint/job review   |
| Reconciler        | T05-T07 | transcript/completeness | T01,T03,T04 | determinism/immutability review |
| Independent E2E   | T08     | tests/evidence          | all         | two-hour/data-integrity review  |

# Failure and debugging matrix

| Failure                    | Classification | Expected behavior                             | Recovery/regression |
| -------------------------- | -------------- | --------------------------------------------- | ------------------- |
| Client dies during End     | timing         | Local manifest resumes; repeated End safe     | boundary test       |
| Chunk hash mismatch        | persistence    | Quarantine/range recovery; no complete claim  | corruption test     |
| Desktop/model unavailable  | environment    | Waiting state; audio safe; no cloud fallback  | readiness test      |
| Cloud batch exceeds limits | provider       | Same-scope deterministic windows or safe fail | batch fallback test |
| Local/cloud disagree       | contract       | Preserve both; review required; audio seek    | golden replay       |
| Unapproved cloud check     | privacy        | No provider job or content transfer           | consent/scope test  |
| Source absent              | state          | Explicit gap/recovery, never infer silence    | range test          |

# Integrated verification

Run finalization policy/state/property, real storage verification, local/cloud job integration/live synthetic, checkpoint crash/resume, full-batch fallback scope, overlap/run/speaker reconciliation golden/replay, cloud-check consent, API/client E2E, two-hour resilience, source mutation/security tests, and `pnpm verify`. Inspect every expected range classification.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P14/EVIDENCE.md` |

# Acceptance gate

- [ ] P14-A01 - Every expected source range is verified, pending, missing, corrupt, paused, gap, or explicitly waived with evidence.
- [ ] P14-A02 - End/finalization/run-part execution/reconciliation are idempotent and restart/replay safe; completed parts are not rerun.
- [ ] P14-A03 - Unknown/incomplete data cannot silently start downstream translation/AI.
- [ ] P14-A04 - Raw audio/live/local/cloud/check events remain immutable; overlap reconciliation has no lost/duplicate speech and projection lineage is complete.
- [ ] P14-A05 - Mobile/desktop two-hour fault scenarios expose actionable truthful states with no silent range loss.
- [ ] P14-A06 - Real local and cloud vi/en final cases, same-scope cloud batch fallback and approved sequential cloud check pass or record exact external blockers.

# Migration, rollout, and rollback

Internal flag; deploy schemas/read status before job generation. Rollback pauses new finalization/backfill while preserving manifests/jobs/events for replay.

# Required documentation updates

API End/status, Data Model completeness/reconciliation, User Flows processing states, Operations finalization incident, Status/Traceability/Progress, and P14 evidence.

# Conversation boundary

Do not implement translation, transcript editing/decision UI, minutes, source deletion/mutation, hidden gap waivers, mobile local/live, advanced model lifecycle or import. Stop before P15/P28.

# Handoff record

Unblock P15 and P28; P16 waits for P15. Stop.
