# Durable Jobs, Transactional Outbox, and Resumable Progress Events

This specification details the architecture, data models, error handling, and testing strategies for Phase P06.

---

## 1. Transactional Outbox & Dispatcher Leasing (T02)

### 1.1 Atomic Persistence

- Every business state mutation (e.g. finalizing a meeting) and the insertion of its corresponding outbox event (Command or DomainEvent envelope) must occur inside the same PostgreSQL database transaction.
- Outbox events start in a `pending` state with `attempts = 0`.
- Outbox entries are assigned an immutable, unique `message_id` (used as the `event_id`).
- Payloads are persisted as JSONB.

### 1.2 Instant Wake-up & Fallback Polling

- A PostgreSQL trigger on INSERT to `outbox_events` issues a `NOTIFY outbox_inserted`.
- The notification payload does NOT contain sensitive business data or meeting content; it serves as a lightweight wake-up signal.
- The dispatcher maintains a dedicated PostgreSQL connection to `LISTEN outbox_inserted`. On connection loss, the dispatcher must automatically reconnect and resume listening.
- A background fallback timer executes a polling loop every 5–10 seconds to handle any missed notifications or network partitions. Correctness of the outbox delivery does not depend on the notify mechanism.

### 1.3 Safe Leasing & Dispatch Loop

To prevent concurrent dispatchers from publishing duplicate jobs:

1. **Acquire Lease (Atomic SELECT & Update):**
   - The dispatcher runs a short transaction using `SELECT FOR UPDATE SKIP LOCKED` on eligible rows (where `state = 'pending'` or `state = 'failed'` but retryable, and `leased_until < now()`).
   - It claims rows by setting a unique `lease_owner`, setting `leased_until = now() + lease_duration`, and incrementing `attempts`.
   - The transaction commits immediately to release table locks quickly.
2. **Publish to BullMQ:**
   - Outside the transaction, the dispatcher attempts to publish each claimed event to its respective BullMQ queue.
3. **Compare-and-Set Acknowledgement:**
   - On successful publish, it updates the outbox event state to `published` and sets `published_at = now()`.
   - **Compare-and-Set Constraint:** The update query MUST require a matching `message_id`, matching `lease_owner`, and expected leased state.
   - If the update affects 0 rows (e.g., because another dispatcher reclaimed the lease after a timeout), the dispatch is treated as stale. The stale dispatcher must not overwrite the newer lease or state.
4. **Error & Dead-Letter Handling:**
   - On failure, it saves `last_error` and schedules a retry according to a bounded backoff policy (`next_attempt_at`).
   - If attempts exceed the configured threshold, the event state is updated to `dead_letter` (fails permanently).
5. **Lease Expiry:**
   - If a dispatcher crashes after committing the lease but before publishing/acknowledging, the lease will naturally expire. Once `leased_until < now()`, another dispatcher can reclaim the event.

---

## 2. BullMQ, Workers, and Idempotent Handler Context (T03–T04)

### 2.1 Queue Mapping & Workers

- Queues map 1:1 to job types (e.g., `speech_transcription`, `minutes_generation`, `export`, etc.).
- Workers are defined in `packages/jobs` and bootstrapped under `apps/worker`.

### 2.2 Idempotency Rules

- **At-Least-Once Delivery:** The system assumes at-least-once delivery of jobs.
- **Effectively-Once Canonical Database Results:** Handlers enforce idempotency by locking the job and checking state prior to execution:
  - Every handler reads the current state of the job inside a transaction.
  - If the job is already `completed`, in a terminal non-retryable `failed` state, or `cancelled`, the handler exits immediately as a no-op success.
  - Prior to committing, the handler re-verifies the cancellation state and the optimistic version of the job row.
  - Database side effects and canonical job-result state must commit atomically.
  - External side effects are not assumed atomic; where needed, handlers must pass a stable `job_id` or `event_id` as an idempotency key to external providers.
  - A failed attempt must never overwrite a completed result.

### 2.3 Job Retry and History Preservation

- When a job is retried, the system must NOT clear previous results or errors.
- Every retry execution creates a new `job_attempt` record.
- The attempts array/history preserves the `attempt` number, timestamps, errors, and prior canonical results.
- The new canonical result is only committed if the job version/state is still valid.
- Stale, late-running previous attempts must be rejected and must never overwrite a newer successful attempt.

### 2.4 Redis-Loss Recovery

- PostgreSQL remains the authoritative source of truth for all job states. BullMQ/Redis state is treated as transient and non-authoritative.
- On Redis data loss or queue wipe, the dispatcher reads the PostgreSQL `jobs` table to rebuild the queue state.
- The rebuild process queries all active, pending, or retryable jobs in PostgreSQL and republishes them to BullMQ.
- Since consumers deduplicate by stable `message_id`/`job_id`, republishing is fully safe.

### 2.5 Graceful Shutdown

- On `SIGTERM` or `SIGINT`, workers stop accepting new jobs.
- Workers call `worker.close()` and wait for active jobs to finish up to a bounded timeout (e.g. 10–30 seconds).
- Active jobs that fail to complete within the timeout remain unfinished in Redis.
- **Lock/Stalled-Job Recovery:** BullMQ's native lock renewal and stalled-job mechanics recover these jobs in Redis, separate from PostgreSQL's lease expiry.
- A restarted or surviving worker will safely reclaim and retry these unfinished/stalled jobs.
- Uncaught exceptions and unhandled rejections must log a safe error and exit the worker process, trigger supervisor alerts, and allow orchestrator restarts.

---

## 3. Owner-Scoped Job APIs (T05)

### 3.1 Endpoints

- `GET /v1/jobs/:id`
- `POST /v1/jobs/:id/retry`
- `POST /v1/jobs/:id/cancel`

### 3.2 Security & Isolation

- Every read, update, and deletion is scoped strictly by the authenticated `owner_id`.
- Conditional update and select predicates MUST contain both `job_id` and `owner_id` (e.g., `WHERE id = :id AND owner_id = :ownerId`).
- To prevent enumeration attacks, missing jobs or jobs belonging to another owner must return a `404 Not Found` response.
- Retry is permitted only for jobs in retryable terminal states (`failed`, `cancelled`). Triggering a retry resets state to `pending`, clears previous results, and increments the attempts array while preserving historical logs.
- Cancel operations set a `cancelled` flag cooperatively. Running workers poll this status during heartbeat loops and immediately before final commit.

---

## 4. Durable Resumable SSE (T06)

### 4.1 Endpoint

- `GET /v1/meetings/:id/events`

### 4.2 Monotonic Cursor & Resume Semantics

- Replay cursors are opaque and safely validated.
- Replay queries require both `meeting_id` and `owner_id` scoping to prevent unauthorized cross-tenant event reads.
- We resolve cursor position using an opaque cursor constructed from `(created_at, event_id)` or a per-meeting monotonic sequence (`meeting_event_sequence`).
- When a client reconnects and provides a valid `Last-Event-ID`, the server replays events starting after that cursor.
- **Cursor Gap / Expiration Contract:** If the cursor is older than the retention window or a cursor gap is detected, the server responds with a `400 Bad Request` HTTP status containing a JSON body:
  ```json
  {
    "error": {
      "code": "EVENT_CURSOR_EXPIRED",
      "message": "Event stream cursor has expired or a gap was detected. Please reload from the current snapshot.",
      "requestId": "req_...",
      "details": { "recovery": "RELOAD_SNAPSHOT" }
    }
  }
  ```

### 4.3 Streaming & Backpressure

- SSE responses enforce Node stream backpressure by checking the return value of `reply.raw.write()` (since the API uses Fastify).
- If a slow client exceeds a bounded buffer threshold, the server forcibly disconnects the client.
- The stream transmits a `: keep-alive` comment event every 15–30 seconds to prevent network proxies from timing out the connection.

---

## 5. Verification & Testing Plan

### 5.1 Unit and Contract Tests (No Docker)

- Job schema serialization, states, and transition tests.
- Envelope validation (`CommandEnvelopeV1` and `DomainEventEnvelopeV1` schemas).
- Authorization predicates and IDOR route tests.
- Cursor pagination and format serialization tests.

### 5.2 Integration Tests (Docker Required)

- Atomic transactional commits verifying outbox state and business records.
- Concurrency testing of the dispatcher using `SKIP LOCKED` across multiple active runners.
- Pg `LISTEN`/`NOTIFY` trigger wake-up and connection recovery tests.
- Compare-and-set outbox updates and stale-acknowledgement prevention tests.
- Bounded retry, exponential backoff, and dead-letter queue (DLQ) integration.
- Graceful shutdown tests capturing timeout events and worker exit statuses.
- Resumable SSE reconnect scenarios with backpressure, keep-alive verification, and client disconnects.
- Redis-loss recovery verification showing PostgreSQL authority rebuilds BullMQ dispatch state.
