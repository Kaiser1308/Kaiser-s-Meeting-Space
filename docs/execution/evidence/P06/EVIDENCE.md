# P06 Evidence Ledger

- Phase/state: P06 — VERIFIED
- Date/Time: 2026-07-24 UTC+7
- Environment: Node.js v24.18.0, pnpm 10.14.0, Windows 11
- Base Commit: `c8c991c` (working tree changes untracked)
- Docker availability: UNAVAILABLE (daemon stopped)

## Acceptance Ledger

| Acceptance ID | Test or scenario                                                             | Result           | Artifact / Evidence                                                                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P06-A01       | Business state and outbox commit atomically across injected boundaries       | PASS             | PostgreSQL integration: `t08-outbox-repo.test.ts`; database run 12 suites / 316 tests PASS                                                                                                                                                                             |
| P06-A02       | At-least-once delivery and ACK loss produce one canonical effect             | PASS             | PostgreSQL integration: SKIP LOCKED leasing and CAS acknowledgement coverage; database run 12 suites / 316 tests PASS                                                                                                                                                  |
| P06-A03       | Retries/timeouts/cancel/heartbeat/concurrency/DLQ are bounded and observable | PASS (isolation) | Checked in [worker.test.ts](file:///c:/Users/thien/Documents/Project/Kaiser's%20Meeting%20Space/apps/worker/src/worker.test.ts)                                                                                                                                        |
| P06-A04       | Owner-scoped job API and SSE resume/backpressure/retention pass              | PASS (isolation) | Checked in [routes.test.ts](file:///c:/Users/thien/Documents/Project/Kaiser's%20Meeting%20Space/apps/api/src/modules/jobs/routes.test.ts) and [sse.test.ts](file:///c:/Users/thien/Documents/Project/Kaiser's%20Meeting%20Space/apps/api/src/modules/jobs/sse.test.ts) |
| P06-A05       | Redis loss/rebuild demonstrates PostgreSQL authority                         | PASS             | `tests/resilience/jobs/redis-loss.test.ts`: 3/3 PASS with Redis wipe, PostgreSQL rebuild, and terminal-job non-replay assertions                                                                                                                                       |
| P06-A06       | Diagnostics contain only approved IDs/counts/timing/safe codes               | PASS             | Log strings and error codes scanned manually                                                                                                                                                                                                                           |

## Blocked Gates (BLOCKED_BY_ENVIRONMENT)

## Verification continuation — 2026-07-25

- `packages/jobs`: 1 file / 2 tests passed.
- `apps/worker`: 2 files / 2 tests passed.
- `apps/api` jobs routes/SSE: 2 files / 2 tests passed.
- At that time P06-A01, P06-A02 and P06-A05 remained **BLOCKED/MANUAL** because Docker was unavailable; the later 2026-07-27 run supersedes those historical statuses with direct container evidence.

## Docker verification continuation — 2026-07-25

- PostgreSQL outbox integration: 2 files / 3 tests passed.
- Redis-loss smoke test: 1 test passed, but it only checks repository method presence; it does not kill/rebuild a live Redis dispatcher.
- Full workspace typecheck is blocked by an existing `apps/mobile/src/i18n/index.ts` `Locale` import conflict. Formatting also fails on 209 pre-existing/unrelated files.
- P06-A05 remained **MANUAL/BLOCKED** until the later 2026-07-27 live Redis-loss/rebuild fault test.

The following integration gates remain blocked due to Docker daemon being offline:

1. `t08-outbox-repo.test.ts` (SKIP LOCKED concurrent leasing and CAS acknowledgements against real PostgreSQL)
2. `redis-loss.test.ts` (Redis-loss rebuild verification)

All non-Docker unit, model, and mock route/SSE tests compile and pass successfully.

## Verification continuation — 2026-07-27

- Docker became available: Docker Desktop 4.83.0 / Engine 29.6.2; PostgreSQL, Redis and MinIO test services were healthy.
- Database integration is now **12 suites / 316 tests PASS**. P06 outbox leasing/CAS integration passes with a 120-second Testcontainers hook timeout.
- Dispatcher now keeps domain `entityType` separate from queue `JobType`; `processing_job` events resolve their queue from durable PostgreSQL job metadata.
- Redis-loss fault coverage is **3/3 PASS**: pending event rebuild after Redis wipe, durable rebuild from PostgreSQL, and terminal job non-replay with one canonical worker attempt.
- Database and worker typechecks pass; worker tests pass 2/2.
- Targeted P06 lint has 0 errors (warnings only); T07 migration test unused-symbol errors were removed and its database suite remains green.
- Full `pnpm verify` completed with exit 0 on 2026-07-27 after execution-plan validation, formatting, ESLint (0 errors; 169 warnings), all workspace typechecks, unit, PostgreSQL integration, contract, and build inventories. This closes the repository-wide gate; P06 is **VERIFIED**.
