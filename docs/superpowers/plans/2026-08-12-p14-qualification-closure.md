# P14 Qualification Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the available P14 finalization, storage, job, reconciliation, and completeness gates with direct synthetic and real-service evidence, stopping only at a required manual/device/provider gate.

**Architecture:** Preserve the existing local-first finalization boundary: immutable source manifests and run events feed deterministic reconciliation and completeness projections, while PostgreSQL/Redis/MinIO provide durable integration evidence. Any defect found is fixed at its source with a focused regression test; no provider or device behavior is simulated for a real gate.

**Tech Stack:** TypeScript, Vitest, PostgreSQL, Redis, MinIO, pnpm workspace, Docker Desktop, Android ADB where required.

## Global Constraints

- Finalized audio and source transcript evidence remain immutable; corrections and derived artifacts are versioned.
- Every expected range is represented exactly once as canonical text or an explicit gap.
- Recording and source durability do not depend on network, provider, or AI availability.
- Tests use synthetic or explicitly consented fixtures only; no real meeting content is logged or committed.
- P14 may consume P06/P10/P13 at `IMPLEMENTED` only through the deferred qualification lane and cannot claim `VERIFIED` while inherited rows remain open.

### Task 1: P14 automated and real-service gate closure

**Files:**
- Inspect/modify only P14 finalization, database, jobs, API, and test files when a reproducible defect is found.
- Create/update: `docs/execution/evidence/P14/RUN-20260812-<time>.md` and direct evidence artifacts.

**Interfaces:**
- Consumes P06 jobs/outbox, P10 recovery/sync, and P13 transcript-run contracts.
- Produces direct evidence for finalization manifest verification, idempotent End, resumable parts, reconciliation, completeness, and real PostgreSQL/Redis/MinIO behavior.

- [ ] Run narrow P14 domain/jobs/API/database/client suites and record baseline.
- [ ] Run real PostgreSQL/Redis/MinIO integration and migration checks with Docker.
- [ ] For each failure, reproduce with a synthetic fixture, add a failing regression test, fix the smallest root cause, and rerun related tests.
- [ ] Run P14 static, unit, integration, resilience, and repository gates that are in scope.
- [ ] Stop at the first required manual/device/provider gate and record the exact command, environment, blocker, and next owner action.

### Task 2: P14 evidence and handoff

**Files:**
- Modify: `docs/execution/evidence/P14/EVIDENCE.md`, `docs/execution/PROGRESS.md`, `docs/execution/TRACEABILITY.md`, `docs/STATUS.md` only after direct verification.

- [ ] Map every P14 acceptance ID to direct evidence or an explicit open external row.
- [ ] Set lifecycle only to the state justified by evidence; never promote inherited open rows.
- [ ] Record the handoff and stop before starting P15.
