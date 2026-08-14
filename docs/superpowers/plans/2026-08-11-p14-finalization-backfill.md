# P14 Finalization and Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement immutable meeting finalization, durable local/cloud final-run orchestration, deterministic reconciliation, and truthful completeness without weakening deferred qualification gates.

**Architecture:** Extend the existing P14 domain/API partials into a domain-first pipeline. Persist the immutable close manifest and expected ranges before enqueueing one policy-selected final job; workers consume P13 run/window contracts and append raw results; pure reconciliation and completeness projections remain replayable from immutable inputs.

**Tech Stack:** TypeScript 5.9, Zod, Fastify 5, Drizzle/PostgreSQL, BullMQ/Redis, Vitest/fast-check, React 19, Expo/React Native, Electron.

## Global Constraints

- Execute only P14; stop after its handoff and do not start P15.
- P06 is `VERIFIED`; P10/P13 may be consumed at `IMPLEMENTED` only through `docs/execution/DEFERRED_END_TO_END_QUALIFICATION.md`.
- P14 may reach at most `IMPLEMENTED` while inherited or P14 ledger rows remain open.
- Recording cannot depend on network, speech, translation, or generative AI availability.
- Audio and raw transcript events are immutable; every expected range becomes canonical text or an explicit non-canonical state.
- Security, owner isolation, consent, data-loss, provider authorization, and migration gates are not deferred.
- Tests use synthetic or explicitly consented fixtures and logs contain no meeting content.

## Preflight and File Map

- Existing partials to audit, not assume complete: `packages/domain/src/finalization/{manifest,policy,source-verification}.ts` and `apps/api/src/modules/finalization/end-command-service.ts`.
- Create domain modules: `packages/domain/src/finalization/{runs,reconciliation,speakers,completeness,index}.ts` with colocated `*.test.ts`.
- Create persistence: `packages/database/src/schema/finalization.ts`, `packages/database/src/repositories/finalization.ts`, migration `packages/database/drizzle/0008_finalization.sql`, and integration tests.
- Create API: `apps/api/src/modules/finalization/{dto,service,routes,index}.ts` and tests; register in `apps/api/src/app.ts`.
- Create jobs: `packages/jobs/src/finalization/{planner,handler}.ts` and tests; update `packages/jobs/src/{registry,index}.ts`.
- Create client state/views under `apps/mobile/src/features/processing/` and `apps/desktop/src/features/processing/`.
- Evidence destination: `docs/execution/evidence/P14/`.

### Task 1: P14-T01 — Immutable close and policy contracts

**Interfaces:** Produce `FinalizationManifestV1Schema`, `decidePrimaryFinalAction()`, `FinalRunPlanV1Schema`, and `CompletenessSnapshotV1Schema`; consume P02 meeting states and P13 transcription policy.

- [ ] Add failing cases to `packages/domain/src/finalization/{manifest,policy}.test.ts` for invalid source order/hash/range, repeated End identity, exactly-one-primary action, missing consent, waiting states, and illegal downstream readiness.
- [ ] Run `pnpm --filter @kms/domain exec vitest run src/finalization/manifest.test.ts src/finalization/policy.test.ts`; require failures caused by missing P14 behavior.
- [ ] Complete the schemas and pure policy functions in `manifest.ts`, `policy.ts`, and `runs.ts`; export them from `finalization/index.ts` and `packages/domain/src/index.ts`.
- [ ] Rerun the narrow tests plus `pnpm --filter @kms/domain typecheck`; require exit 0 and non-zero tests.
- [ ] Record `docs/execution/evidence/P14/finalization-contract.json`; commit only P14-T01 files with message `feat(p14): define finalization contracts` when repository conditions permit.

### Task 2: P14-T02 — Local-first idempotent End transaction

**Interfaces:** Consume `FinalizationManifestV1`; produce `EndCommandService.execute(request): Promise<EndCommandResult>` and `FinalizationRepository.commitEnd()` that atomically writes manifest, job, and outbox.

- [ ] Extend `apps/api/src/modules/finalization/end-command-service.test.ts` with local-close/request/DB/outbox crash boundaries, duplicate key/same manifest, duplicate key/different manifest, and two-owner cases.
- [ ] Run the test and confirm the missing durable store/route behavior fails.
- [ ] Add finalization schema/repository/migration, wire the authenticated End route, and preserve the existing in-flight dedupe while making database uniqueness authoritative.
- [ ] Run API unit tests, database schema tests, and PostgreSQL integration for the new repository.
- [ ] Record `end-fault-matrix.json`; commit as `feat(p14): persist idempotent meeting end`.

### Task 3: P14-T03 — Uploaded source verification

**Interfaces:** Consume immutable manifest plus P05 object metadata; produce stable `SourceVerification` classifications: `verified|missing|corrupt|overlapping|pending|paused|gap|waived`.

- [ ] Add failing property/unit cases to `source-verification.test.ts` for late upload, duplicate observation, metadata/hash mismatch, source drift, gaps, and observation-order replay.
- [ ] Run `pnpm --filter @kms/domain exec vitest run src/finalization/source-verification.test.ts` and capture the intended failure.
- [ ] Complete pure range accounting and implement the P05-backed verifier adapter in `apps/api/src/modules/finalization/source-verifier.ts` without downloading/logging content.
- [ ] Run domain property tests and API real-storage tests; inspect that every expected range appears exactly once.
- [ ] Record `source-verification.json`; commit as `feat(p14): verify finalization sources`.

### Task 4: P14-T04 — Durable local/cloud final-run jobs

**Interfaces:** Consume P13 `TranscriptRun`, `TranscriptRunPart`, deterministic window plans, provider capability/consent; produce append-only run-part checkpoints and raw result hashes.

- [ ] Add failing tests in `packages/jobs/src/finalization/handler.test.ts` for local windows, cloud full-batch, same-provider window fallback, outage, malformed result, cancel, crash/restart, and completed-part non-replay.
- [ ] Run the narrow job suite and verify it fails at missing registration/handler behavior.
- [ ] Implement planner/handler, register the job, persist attempt/checkpoint/result lineage, and explicitly refuse automatic local-to-cloud fallback or scope expansion.
- [ ] Run jobs tests, speech conformance tests, and PostgreSQL/Redis integration with synthetic audio manifests.
- [ ] Record `final-run-job-report.json`; commit as `feat(p14): orchestrate durable final runs`.

### Task 5: P14-T05 — Deterministic overlap and multi-run reconciliation

**Interfaces:** Produce `reconcileTranscriptEvents(input, algorithmVersion): ReconciliationProjection` from immutable P13 events; no generative rewriting.

- [ ] Create failing golden/property tests in `packages/domain/src/finalization/reconciliation.test.ts` for punctuation, drift, missing/extra word, homophone, silence, overlap, late events, speaker conflict, ambiguity, shuffled reads, and replay.
- [ ] Run the narrow test and confirm lost/duplicate boundary speech is detected.
- [ ] Implement source-range identity dedupe, normalized token comparison, stable ordering, retained alternatives, and versioned projection decisions.
- [ ] Rerun tests twice with shuffled input order and compare serialized projections byte-for-byte.
- [ ] Record `reconciliation-report.json`; commit as `feat(p14): reconcile transcript runs deterministically`.

### Task 6: P14-T06 — Speaker mapping and sequential cloud check

**Interfaces:** Produce versioned stable speaker mappings and `CloudCheckRequestV1` requiring completed local run, exact ranges/full scope, named provider, consent, and usage approval.

- [ ] Add failing tests in `speakers.test.ts` and jobs tests for cross-window numeric labels, ambiguous identity, uncertain-range suggestions, unapproved/expanded cloud scope, and cloud-check non-mutation.
- [ ] Run the tests and verify policy rejection paths are absent or incorrect.
- [ ] Implement confidence-bearing mappings and a separate cloud-check job request; preserve raw labels and require an explicit projection decision before selection.
- [ ] Run domain, API authorization, speech provider, and job checkpoint suites.
- [ ] Record `speaker-cloud-check.json`; commit as `feat(p14): add speaker mapping and cloud check`.

### Task 7: P14-T07 — Completeness and downstream gate

**Interfaces:** Produce `calculateCompleteness()` and owner-scoped status API; clients render `waiting_for_desktop|waiting_for_model|needs_recovery|processing|partial_ready|review_required|final_ready`.

- [ ] Add failing boundary/race/late-completion tests in `completeness.test.ts`, API route tests, and client component tests; unknown input must never become complete or start translation/minutes.
- [ ] Run the focused domain/API/client suites and verify intended failures.
- [ ] Implement completeness projection, guarded downstream eligibility, status routes, and truthful mobile/desktop processing/recovery views.
- [ ] Run all focused tests, package typechecks, and accessibility assertions for status/actions.
- [ ] Record `completeness-report.json`; commit as `feat(p14): expose finalization completeness`.

### Task 8: P14-T08 — Integrated qualification and handoff

**Interfaces:** Consume all P14 deliverables; produce P14 evidence and a truthful lifecycle result. Deferred physical/provider rows remain open unless directly executed.

- [ ] Create `docs/execution/evidence/P14/RUN-YYYYMMDD-HHMM.md` from the template and run synthetic record-only/local/cloud/local-check, waiting-state, corruption, duplicate End, crash/restart, and replay scenarios.
- [ ] Run focused gates: domain finalization, API finalization, database integration, jobs finalization, speech regressions, mobile/desktop processing tests, and security mutation negatives.
- [ ] Run `pnpm verify`; record exact exit code/test counts and classify environment failures without weakening assertions.
- [ ] Run the real two-hour/device/provider matrix only when prerequisites exist; otherwise keep P14-A05/A06 and inherited rows OPEN and cap the phase at `IMPLEMENTED`.
- [ ] Update P14 evidence, traceability, status, and progress only from direct outputs; run `node .gitnexus/run.cjs detect-changes --scope compare --base-ref main` before any commit; stop before P15.

## Final Review Checklist

- [ ] P14-A01 through P14-A06 each map to direct evidence or an explicit open external gate.
- [ ] Every expected range is classified exactly once and replay is deterministic.
- [ ] End/job/provider retries are idempotent and owner scoped.
- [ ] Raw audio/events are unchanged and logs are content-free.
- [ ] Open deferred rows prevent a `VERIFIED` claim.
