# Phase P06 - Durable Jobs, Transactional Outbox, and Resumable Progress Events Implementation Plan (Revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement BullMQ durable background jobs fueled by a PostgreSQL transactional outbox, with dispatcher leasing (SKIP LOCKED), effectively-once canonical DB result commits, owner-scoped job APIs, and resumable SSE event streams with cursor-gap expiration.

**Architecture:** Business actions save status mutations and outbox entries in a single transaction. The outbox dispatcher uses PG `LISTEN`/`NOTIFY` triggers + fallback polling to acquire leases via `FOR UPDATE SKIP LOCKED`, pushes to BullMQ, and updates state with compare-and-set. Workers execute jobs idempotent-checked, and clients consume status events over resilient SSE streams.

**Tech Stack:** Fastify, Drizzle ORM, PostgreSQL (pg driver), BullMQ, Redis, Vitest.

## Global Constraints

- Every read/write database query for jobs or events must be strictly scoped by `owner_id`.
- Outbox acknowledgement MUST use compare-and-set checking `message_id`, `lease_owner`, and state.
- Job retry MUST preserve full execution attempt history (`job_attempts` table).
- SSE cursors must use opaque `(created_at, event_id)` or meeting-scoped monotonic sequence, fully validated, returning `EVENT_CURSOR_EXPIRED` (JSON with HTTP 400 status) on expired/retention gaps.
- Node stream backpressure checks use `reply.raw.write()` for Fastify.
- Docker Testcontainers tests are required for full gate verification, but skipped if Docker is unavailable.

---

## File and Component Map

### `packages/jobs` (NEW Component)

- `packages/jobs/package.json`
- `packages/jobs/tsconfig.json`
- `packages/jobs/src/types.ts` - registry configurations, retry policies, backoffs.
- `packages/jobs/src/registry.ts` - job spec definition contracts and validator schemas.
- `packages/jobs/src/index.ts` - package exports.

### `packages/database` (MODIFY)

- `packages/database/src/schema/outbox.ts` (MODIFY) - add `next_attempt_at`, `last_error_message`, and `meeting_event_sequence` columns.
- `packages/database/drizzle/0006_jobs_outbox_improvements.sql` (NEW) - migration SQL adding columns and trigger `notify_outbox_inserted`.
- `packages/database/src/repositories/outbox.ts` (NEW) - manages outbox events, leases, trigger, and compare-and-set.
- `packages/database/src/repositories/index.ts` (MODIFY) - exports `OutboxRepository`.

### `apps/worker` (NEW Component)

- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/src/dispatcher.ts` - outbox listen/poll and BullMQ enqueue loop.
- `apps/worker/src/worker.ts` - BullMQ worker executor, idempotent context, version checks, graceful shutdown.
- `apps/worker/src/index.ts` - application entrypoint.

### `apps/api` (MODIFY)

- `apps/api/src/modules/jobs/routes.ts` (NEW) - job retry, cancellation, and SSE routes.
- `apps/api/src/modules/jobs/index.ts` (NEW) - registers job routes as a Fastify plugin.
- `apps/api/src/app.ts` (MODIFY) - registers the new jobs module inside the protected routes scope.

---

## Task Breakdown

### Task 1: Database Schema Extensions and Migration (P06-T02-Schema)

**Files:**

- Modify: `packages/database/src/schema/outbox.ts`
- Create: `packages/database/drizzle/0006_jobs_outbox_improvements.sql`
- Test: `packages/database/test/t08-outbox-schema.test.ts`

- [ ] **Step 1: Modify outbox schema**
      Add columns to `outboxEvents` table:
  - `nextAttemptAt`: timestamp type.
  - `lastErrorMessage`: text type.
  - `meetingEventSequence`: bigint/integer type representing meeting-scoped monotonic sequence.
- [ ] **Step 2: Create migration SQL**
      Create `packages/database/drizzle/0006_jobs_outbox_improvements.sql` adding the new fields and establishing the trigger `notify_outbox_inserted` executing `pg_notify('outbox_inserted', '')` on inserts.
- [ ] **Step 3: Write tests verifying schema structures**
      Add unit/contract tests for outbox fields.
- [ ] **Step 4: Run typecheck**
      Run `pnpm --dir packages/database typecheck`
- [ ] **Step 5: Commit**
      Commit the schema additions.

---

### Task 2: Job Registry and Specification contracts (P06-T01)

**Files:**

- Create: `packages/jobs/package.json`
- Create: `packages/jobs/tsconfig.json`
- Create: `packages/jobs/src/types.ts`
- Create: `packages/jobs/src/registry.ts`
- Create: `packages/jobs/src/index.ts`
- Test: `packages/jobs/src/registry.test.ts`

**Interfaces:**

- Consumes: `@kms/domain` schemas.
- Produces: `JobRegistry` lookup, mapping `JobType` to concurrency limits, retry policies, and timeout durations.

- [ ] **Step 1: Create package configuration**
      Write `packages/jobs/package.json` with dependencies `bullmq`, `pg`, `redis`, `@kms/database`, and `@kms/domain`. Write `packages/jobs/tsconfig.json`.
- [ ] **Step 2: Implement registry contracts**
      Create `registry.ts` exporting `getJobConfig(type: JobType)` returning policy descriptors (concurrency, backoffs).
- [ ] **Step 3: Write tests for invalid specifications**
      Write tests validating parameter boundaries.
- [ ] **Step 4: Run unit tests**
      Run `pnpm --dir packages/jobs test` (without Docker).
- [ ] **Step 5: Commit**
      Commit the registry package.

---

### Task 3: Transactional Outbox Repository (P06-T02-Repo)

**Files:**

- Create: `packages/database/src/repositories/outbox.ts`
- Modify: `packages/database/src/repositories/index.ts`
- Test: `packages/database/test/t08-outbox-repo.test.ts`

**Interfaces:**

- Consumes: `Connection`, `OwnerContext` from `@kms/database`.
- Produces: `OutboxRepository` containing:
  - `saveEvent(ctx, conn, envelope): Promise<void>` (accepts transaction handle)
  - `acquireLeases(conn, leaseOwner, limit): Promise<OutboxEvent[]>` (uses SKIP LOCKED)
  - `acknowledgePublish(conn, messageId, leaseOwner): Promise<boolean>` (uses CAS)

- [ ] **Step 1: Implement OutboxRepository**
      Implement methods ensuring CAS rules: require matching `message_id`, `lease_owner`, and expected state when marking status.
- [ ] **Step 2: Export from barrel**
      Modify `packages/database/src/repositories/index.ts` to export `OutboxRepository`.
- [ ] **Step 3: Write unit/contract tests (No Docker)**
      Write tests checking queries, parameters, and return types.
- [ ] **Step 4: Run typecheck**
      Run `pnpm typecheck`
- [ ] **Step 5: Commit**
      Commit repository.

---

### Task 4: Dispatcher Bootstrap and Leasing Loop (P06-T02 / T03)

**Files:**

- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/dispatcher.ts`
- Test: `apps/worker/src/dispatcher.test.ts`

- [ ] **Step 1: Setup worker application package**
      Create configuration files, adding dependencies: `bullmq`, `pg`, `redis`, `@kms/database`, `@kms/domain`, `@kms/jobs`.
- [ ] **Step 2: Implement dispatcher loop**
      Write loop with PG `LISTEN`/`NOTIFY` triggers and connection reconnect. On wake-up, execute leasing via `FOR UPDATE SKIP LOCKED`, push to BullMQ, and commit via CAS.
- [ ] **Step 3: Write tests for outbox fallback and concurrent dispatcher**
      Validate dispatcher loop in isolation without Docker.
- [ ] **Step 4: Run typecheck**
      Run typecheck.
- [ ] **Step 5: Commit**
      Commit the dispatcher.

---

### Task 5: BullMQ Workers and Graceful Shutdown (P06-T03 / T04)

**Files:**

- Create: `apps/worker/src/worker.ts`
- Create: `apps/worker/src/index.ts`
- Test: `apps/worker/src/worker.test.ts`

- [ ] **Step 1: Implement worker handler loop**
      Write BullMQ Worker execution logic with idempotency checks, atomic result commits, attempt version check, and attempt history preservation.
- [ ] **Step 2: Implement graceful shutdown handler**
      Stop accepting new jobs on `SIGTERM`/`SIGINT`. Close worker and await active jobs. Document lock recovery.
- [ ] **Step 3: Write tests for graceful shutdown and re-execution**
      Write unit tests validating lock recovery and timeouts.
- [ ] **Step 4: Run typecheck**
      Run typecheck.
- [ ] **Step 5: Commit**
      Commit the worker.

---

### Task 6: Owner-Scoped Job REST APIs (P06-T05)

**Files:**

- Create: `apps/api/src/modules/jobs/routes.ts`
- Create: `apps/api/src/modules/jobs/index.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/jobs/routes.test.ts`

- [ ] **Step 1: Write routes**
      Implement GET, POST retry, and POST cancel endpoints. Scope all updates and SELECT queries strictly by `owner_id`. Return 404 for missing/unauthorized resources.
- [ ] **Step 2: Integrate routes in Fastify bootstrap**
      Register routes inside `apps/api/src/app.ts` under the protected route scope.
- [ ] **Step 3: Write IDOR test cases**
      Verify route security using unit/contract tests.
- [ ] **Step 4: Run API unit tests**
      Run `pnpm --dir apps/api test:unit`.
- [ ] **Step 5: Commit**
      Commit API routes.

---

### Task 7: Resumable Durable SSE Events (P06-T06)

**Files:**

- Create: `apps/api/src/modules/jobs/sse.ts`
- Test: `apps/api/src/modules/jobs/sse.test.ts`

- [ ] **Step 1: Implement SSE handler**
      Write SSE route using `reply.raw.write()` backpressure validation, keep-alives, and connection resume. Query by `meeting_id` and `owner_id`.
- [ ] **Step 2: Implement cursor gap response**
      If cursor is invalid/expired, return HTTP 400 with `EVENT_CURSOR_EXPIRED` JSON.
- [ ] **Step 3: Write tests for reconnect and backpressure**
      Write unit tests validating SSE logic in isolation.
- [ ] **Step 4: Run API typecheck and unit tests**
      Run validations.
- [ ] **Step 5: Commit**
      Commit SSE module.

---

### Task 8: Resilience & Redis-Loss Qualification (P06-T07)

**Files:**

- Create: `tests/resilience/jobs/redis-loss.test.ts`
- Modify: `docs/execution/evidence/P06/EVIDENCE.md`
- Modify: `docs/execution/PROGRESS.md`

- [ ] **Step 1: Write Redis loss recovery check**
      Write a script/test that uses a dedicated ephemeral test Redis, wipes it, triggers outbox rebuild from PG, and asserts BullMQ executes duplicate jobs safely.
- [ ] **Step 2: Run all workspace unit/contract tests**
      Run `pnpm test:unit` to verify everything is green.
- [ ] **Step 3: Commit**
      Commit all remaining verification code.
