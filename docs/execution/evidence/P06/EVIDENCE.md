# P06 Evidence Ledger

- Phase/state: P06 — IMPLEMENTED
- Date/Time: 2026-07-24 UTC+7
- Environment: Node.js v24.18.0, pnpm 10.14.0, Windows 11
- Base Commit: `c8c991c` (working tree changes untracked)
- Docker availability: UNAVAILABLE (daemon stopped)

## Acceptance Ledger

| Acceptance ID | Test or scenario | Result | Artifact / Evidence |
| ------------- | ---------------- | ------ | ------------------- |
| P06-A01       | Business state and outbox commit atomically across injected boundaries | BLOCKED | Requires PostgreSQL Docker integration (BLOCKED_BY_ENVIRONMENT) |
| P06-A02       | At-least-once delivery and ACK loss produce one canonical effect | BLOCKED | Requires PostgreSQL Docker integration (BLOCKED_BY_ENVIRONMENT) |
| P06-A03       | Retries/timeouts/cancel/heartbeat/concurrency/DLQ are bounded and observable | PASS (isolation) | Checked in [worker.test.ts](file:///c:/Users/thien/Documents/Project/Kaiser's%20Meeting%20Space/apps/worker/src/worker.test.ts) |
| P06-A04       | Owner-scoped job API and SSE resume/backpressure/retention pass | PASS (isolation) | Checked in [routes.test.ts](file:///c:/Users/thien/Documents/Project/Kaiser's%20Meeting%20Space/apps/api/src/modules/jobs/routes.test.ts) and [sse.test.ts](file:///c:/Users/thien/Documents/Project/Kaiser's%20Meeting%20Space/apps/api/src/modules/jobs/sse.test.ts) |
| P06-A05       | Redis loss/rebuild demonstrates PostgreSQL authority | BLOCKED | Requires Redis/PostgreSQL Docker integration (BLOCKED_BY_ENVIRONMENT) |
| P06-A06       | Diagnostics contain only approved IDs/counts/timing/safe codes | PASS | Log strings and error codes scanned manually |

## Blocked Gates (BLOCKED_BY_ENVIRONMENT)

The following integration gates remain blocked due to Docker daemon being offline:
1. `t08-outbox-repo.test.ts` (SKIP LOCKED concurrent leasing and CAS acknowledgements against real PostgreSQL)
2. `redis-loss.test.ts` (Redis-loss rebuild verification)

All non-Docker unit, model, and mock route/SSE tests compile and pass successfully.
