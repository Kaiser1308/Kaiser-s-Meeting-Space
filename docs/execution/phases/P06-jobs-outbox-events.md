---
phase: P06
title: Durable jobs, transactional outbox, and resumable progress events
packet_status: ACCEPTED
depends_on: [P03, P04]
requirements: [NFR-Reliability, NFR-Observability, ADR-005]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Expensive work executes through typed, idempotent BullMQ jobs created from a PostgreSQL transactional outbox, with leases, bounded retry/DLQ, cancellation/heartbeat, one canonical result, owner-scoped APIs, and resumable SSE. Redis loss cannot lose authoritative business work.

# Authoritative context

Read System Architecture state/worker sections, API Contracts jobs/SSE, Operations queue incidents/SLOs, ADR-005, P02 job/envelope/error contracts, and P03/P04 evidence.

# Preconditions and external prerequisites

P03 is `VERIFIED`. P04 satisfies the capability-scoped `IMPLEMENTED` gate below;
its full-route and OS-keychain/device acceptance remain open and are not consumed
by this server-side phase. Real PostgreSQL and Redis Testcontainers run. Use
deterministic mock handlers only; no speech/AI/export implementation.

# Dependency gate

| Dependency | Required capability                                                                                                                                                                                         | Required evidence                                                      | Minimum lifecycle |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| P03        | Verified outputs and invariants consumed by this packet.                                                                                                                                                    | `../evidence/P03/EVIDENCE.md`                                          | VERIFIED          |
| P04        | JWT verification, authenticated owner context, owner-isolation policy, and safe API conventions. P04-A04 full-route coverage and P04-A05 OS-keychain/device evidence are orthogonal and remain unsatisfied. | [P04 acceptance ledger](../evidence/P04/EVIDENCE.md#acceptance-ledger) | IMPLEMENTED       |

# Scope firewall

**Allowed:** `packages/jobs/`, `apps/worker/` bootstrap, outbox/job repositories/migrations, API job/SSE modules, mock handlers, fault/contract tests.

**Forbidden/out:** production provider calls, actual speech/translation/AI/export behavior, production dashboards, Redis as business truth, unbounded retries/concurrency, and polling-only progress.

**Extension seams:** typed job registry/handler capabilities allow new phase-owned job types without central provider switches.

# Contracts and invariants

- `JobSpec`/`JobRecord` use P02 type/state/stage/progress/attempt/error/cancel/dedupe/version metadata.
- Business transaction and outbox insert commit atomically; dispatcher lease is reclaimable.
- Handlers are at-least-once but canonical result commit is guarded by job/attempt/version/idempotency.
- Retry classification, timeout, backoff, max attempts, concurrency, and DLQ are defined per type.
- SSE persists bounded safe events in PostgreSQL/outbox sequence and supports `Last-Event-ID`; owner checks precede delivery.

# File and ownership map

| Path                             | Responsibility                            | Owner                |
| -------------------------------- | ----------------------------------------- | -------------------- |
| `packages/jobs/src/`             | registry, retry policy, handler context   | Queue/worker         |
| database outbox/job repositories | transactions, leases, event log           | Outbox               |
| `apps/worker/src/`               | dispatcher/worker bootstrap/mock handlers | Queue/worker         |
| `apps/api/src/modules/jobs/`     | get/retry/cancel/SSE                      | API/events           |
| `tests/resilience/jobs/`         | crash/race/Redis-loss matrix              | Independent reviewer |

# Ordered task packets

## P06-T01 - Typed job registry and lifecycle contracts

Add tests for every job type's input/result/stages/retry/timeout/concurrency/dedupe/cancel capability and invalid state/progress/error. Implement registry using P02 schemas; later production job types have registry contracts only and no handler behavior in this phase. Evidence: `evidence/P06/job-contract.json`.

## P06-T02 - Transactional outbox and dispatcher leasing

Implement same-transaction business state/outbox insert, SKIP LOCKED-style leases, attempt/expiry/reclaim, publish marker, and safe dispatcher loop. Crash before/after commit/publish/mark tests prove eventual dispatch without missing work. Evidence: `outbox-fault-matrix.json`.

## P06-T03 - BullMQ queues, workers, retry, and DLQ

Implement queue mapping, bounded concurrency/timeouts/exponential jitter/backoff, retry categories, max attempts, DLQ and graceful shutdown. Test transient/permanent/rate/timeout/poison job and queue saturation. Evidence: `queue-policy-report.json`.

## P06-T04 - Idempotent handler context, heartbeat, cancellation, result commit

Implement attempt/version-scoped context, heartbeat lease, cancellation polling/signal, resource cleanup, and guarded result transaction. Race tests inject crash, ACK loss, late result, heartbeat expiry, and cancellation at every commit boundary and require one canonical effect. Evidence: `handler-race-report.json`.

## P06-T05 - Owner-scoped job commands

Implement get/retry/cancel routes with P04 auth, idempotency, allowed-state policy, safe error/attempt history, and `retry-with-provider` contract-only rejection until provider phases. Test two users, enumeration, duplicate retry, cancel terminal, and rate limits. Evidence: `job-api-report.json`.

## P06-T06 - Durable resumable SSE

Implement ordered event log/cursor, heartbeat, bounded retention, owner filter, `Last-Event-ID`, disconnect/reconnect/dedupe, slow consumer/backpressure, and expired cursor snapshot/recovery response. Reconnect tests cover every cursor boundary, two users, retention expiry, duplicate delivery, and slow-client cutoff. Evidence: `sse-reconnect-report.json`.

## P06-T07 - Redis-loss and end-to-end fault qualification

Run mock business commands through outbox/Redis/worker/result/SSE while killing dispatcher/worker/Redis/API at each boundary, duplicating messages, delaying ACK, cancelling, and rebuilding dispatch from PostgreSQL. Evidence: `evidence/P06/EVIDENCE.md`.

# Subagent work packages

| Package        | Tasks       | Exclusive paths           | Depends on    | Review gate                    |
| -------------- | ----------- | ------------------------- | ------------- | ------------------------------ |
| Outbox         | T02         | DB outbox/dispatcher      | P03           | transaction/lease review       |
| Queue/worker   | T01,T03,T04 | jobs + worker             | T02 contracts | retry/idempotency review       |
| API/events     | T05,T06     | API jobs/SSE              | T01,T02       | auth/backpressure review       |
| Fault reviewer | T07         | resilience tests/evidence | all           | independent crash/Redis review |

# Failure and debugging matrix

| Failure                            | Classification | Expected behavior                          | Recovery/regression         |
| ---------------------------------- | -------------- | ------------------------------------------ | --------------------------- |
| DB commit then dispatcher crash    | timing         | Reclaim committed outbox after lease       | boundary test               |
| Worker result then ACK lost        | timing         | Replay returns one result                  | attempt/version test        |
| Redis wiped                        | state          | Recreate dispatchable jobs from PostgreSQL | rebuild test                |
| SSE disconnect/slow client         | timing         | Resume/dedupe or bounded snapshot path     | reconnect/backpressure test |
| Cancel during non-cancellable call | provider       | `cancel_requested`; discard late result    | late-result test            |

# Integrated verification

Run job unit/property/contract tests, real PostgreSQL+Redis integration, API authorization/SSE tests, full resilience fault campaign, content-free log scan, typecheck, and `pnpm verify`. Assert every submitted job is canonical complete, visible failed/DLQ, or cancel state—never missing.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P06/EVIDENCE.md` |

# Acceptance gate

- [ ] P06-A01 - Business state and outbox commit atomically across injected boundaries.
- [ ] P06-A02 - At-least-once delivery and ACK loss produce one canonical effect.
- [ ] P06-A03 - Retries/timeouts/cancel/heartbeat/concurrency/DLQ are bounded and observable.
- [ ] P06-A04 - Owner-scoped job API and SSE resume/backpressure/retention pass.
- [ ] P06-A05 - Redis loss/rebuild demonstrates PostgreSQL authority.
- [ ] P06-A06 - Diagnostics contain only approved IDs/counts/timing/safe codes.

# Migration, rollout, and rollback

Mock handlers only. Queue features remain disabled until a later phase registers its type. Schema expands before workers; rollback stops dispatch and preserves outbox/jobs.

# Required documentation updates

API jobs/SSE, System Architecture worker flow, Operations queue runbook, Status/Traceability/Progress, and P06 evidence.

# Conversation boundary

Use deterministic mock handlers only. Do not implement speech, translation, generative AI, export behavior, or production dashboards. Stop after P06.

# Handoff record

P13 and P17 still await other dependencies; record completion and stop.
