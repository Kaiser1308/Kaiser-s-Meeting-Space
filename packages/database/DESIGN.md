# @kms/database — Design (Phase P03)

**Status:** Design / Architecture deliverable (no product code)
**Phase:** P03 — PostgreSQL schema, migrations, integrity-preserving repositories
**Authoritative inputs:** `docs/execution/phases/P03-persistence.md`, `docs/architecture/DATA_MODEL.md`, `docs/execution/EXECUTION_PROTOCOL.md` (§3, §7), `docs/decisions/ADR-002`, `docs/decisions/ADR-005`, `docs/architecture/API_CONTRACTS.md`, all P02 schemas under `packages/domain/src/**`, `packages/domain/src/index.ts`.
**Scope firewall (from packet):** Allowed = new `packages/database/`, Drizzle config/schema/migrations/repositories, DB test helpers/fixtures, focused model/migration docs. Forbidden = HTTP/auth middleware, S3 ops, Redis workers, provider calls, production DB provisioning, generic source update/delete APIs, team/RBAC schema.

This document is implementation-ready. An implementer subagent should not need to make further architectural decisions — only follow it.

---

## 1. Tooling & versions

### 1.1 Chosen stack

| Concern                     | Package                                       | Suggested range                  | Rationale                                                                                                                                                                                                                |
| --------------------------- | --------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ORM                         | `drizzle-orm`                                 | `^0.36.0`                        | Accepted in `TECH_STACK.md`; explicit SQL migrations; first-class `pgEnum`, CHECK, indexes, relations.                                                                                                                   |
| Migrator / codegen          | `drizzle-kit`                                 | `^0.28.0`                        | Generates ordered, transactional SQL under `drizzle/`. Must be a peer-compatible pair with `drizzle-orm`; if `pnpm add` reports a peer conflict, bump both together to the latest matched pair and let the lockfile pin. |
| **Driver**                  | **`postgres`** (postgresjs)                   | `^3.4.4`                         | **See §1.2.**                                                                                                                                                                                                            |
| Test DB                     | `@testcontainers/postgres`                    | `^10.14.0`                       | Hermetic `postgres:17-alpine` per spec.                                                                                                                                                                                  |
| Test DB core                | `testcontainers`                              | `^10.14.0`                       | Required peer of `@testcontainers/postgres`.                                                                                                                                                                             |
| Workspace dev deps (mirror) | `typescript`, `vitest`, `@vitest/coverage-v8` | `^5.9.2` / `^4.1.10` / `^4.1.10` | Match root `package.json` exactly.                                                                                                                                                                                       |

All ranges are **floors**; exact versions are pinned by `pnpm-lock.yaml`. The implementer must verify `drizzle-orm` ↔ `drizzle-kit` peer compatibility at install time.

### 1.2 Driver decision: `postgres` (postgresjs) — RECOMMENDED

**Chosen: `postgres` (postgresjs) with `drizzle-orm/postgres-js`.**

Rationale:

1. **ESM-native.** This repo is `"type":"module"`, `moduleResolution: "Bundler"`, Node 24. `postgres` ships as native ESM and imports cleanly with no `esModuleInterop`/`__require` shims.
2. **Drizzle parity.** `drizzle-orm/postgres-js` is the recommended first-class Drizzle Postgres binding; the `Tx` type extraction in §2 is well-typed.
3. **No CJS friction.** `pg` (node-postgres) is CJS-oriented and has historically needed interop flags under strict ESM; it gains us nothing here.
4. **Prepared-statement control.** `postgres(url, { prepare: false })` is required inside pooled transactions (Drizzle documents this); trivial to set.

Deviation note: the packet said "likely `postgres` or `pg`" — we pick `postgres` for the above. This is the only driver-related decision and it does not change any contract.

### 1.3 Config file locations

```
packages/database/
  package.json
  tsconfig.json
  vitest.config.ts
  drizzle.config.ts        ← Drizzle codegen/migrate config (schema source, migrations out dir)
  src/
  drizzle/                 ← generated, ordered, committed SQL migrations + meta/
  test/
```

- `drizzle.config.ts` points `schema` at `./src/schema/index.ts`, `out` at `./drizzle`, `dialect: 'postgresql'`. It reads `DATABASE_URL` from env only for `migrate`; generation needs no connection.
- `vitest.config.ts` mirrors `packages/domain/vitest.config.ts` **except**: `include: ['src/**/*.test.ts', 'test/**/*.test.ts']`; coverage thresholds start at `0` (DB integration tests cannot hit 100% of driver paths) and are ratcheted later by the main agent.
- `tsconfig.json` `extends: "../../tsconfig.base.json"`, `include: ["src", "test", "drizzle.config.ts", "vitest.config.ts"]`.
- `package.json` (mirrors `@kms/domain`):
  - `"type": "module"`, `"private": true`, `"exports": "./src/index.ts"`.
  - `scripts`: `typecheck` (`tsc --noEmit`), `test:unit` (`vitest run`), `db:generate` (`drizzle-kit generate`), `db:migrate` (`drizzle-kit migrate`).
  - `dependencies`: `drizzle-orm`, `postgres`, `@kms/domain` (`workspace:*`).
  - `devDependencies`: `drizzle-kit`, `@testcontainers/postgres`, `testcontainers`, `typescript`, `vitest`, `@vitest/coverage-v8`.
- **`vitest.workspace.ts`** (root): adding `'packages/database'` is the **main agent's** job, not this design. The main agent should add it only after T01 scaffolding compiles, so `pnpm verify` does not break mid-phase (see §9).

### 1.4 Enum drift prevention (critical)

P02 defines the enum _values_ as `as const` arrays. **The DB `pgEnum`s MUST be defined by importing those arrays**, never by re-typing them:

- `MEETING_STATES` (`packages/domain/src/state/machine.ts`)
- `ALL_TEMPLATES` (`packages/domain/src/minutes/schemas.ts`)
- The `z.enum([...])` literal arrays that are not exported as `const` arrays today (language, mode, source, etc.) — **T01 implementer must either import the existing exported arrays or, where P02 only exposes the Zod schema, read `.options` off the schema** (e.g. `MeetingLanguageSchema.options`). All pgEnums are built from a single P02 import so they cannot drift. If P02 ever lacks an exportable source of truth, the implementer records it as a handoff item rather than duplicating literals.

---

## 2. Connection / transaction boundary (`src/client.ts`)

Owned by **T01**; every later task and every repository depends on it.

### 2.1 Types and factory

```ts
// src/client.ts  (illustrative contract — implementer fills body)
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Db = PostgresJsDatabase<typeof schema>;
// A transaction is exactly the callback argument of db.transaction:
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
// Any code path (top-level or inside a tx) is a Connection:
export type Connection = Db | Tx;

export interface CreateClientOptions {
  max?: number;
  /** set true under Testcontainers/pooled tx */ prepare?: boolean;
  ssl?: 'require' | 'disable';
}
export interface ClientHandle {
  db: Db;
  readonly $raw: ReturnType<typeof postgres>;
  close(): Promise<void>;
}

export function createClient(databaseUrl: string, options: CreateClientOptions = {}): ClientHandle;
```

- `createClient` builds `postgres(url, { max: options.max ?? 10, prepare: options.prepare ?? false, onnotice: () => {} })` and wraps it with `drizzle(client, { schema })`. `prepare: false` is the Drizzle-recommended setting for pooled transactions.
- `close()` ends the underlying postgresjs connection pool. Tests and the app call it on shutdown.
- **`DATABASE_URL`** is the single configuration input. It is read by the app at runtime and injected by Testcontainers at test time (§3). No other environment coupling in `client.ts`.

### 2.2 How transactions reach repositories

- **Every mutating repository method takes an explicit `conn: Connection` first data parameter** (after `ctx: OwnerContext`). Callers wrap multi-step mutations in `db.transaction(async (tx) => repo.method(ctx, tx, ...))`.
- Reads accept `conn: Connection` too (a read inside a tx must see uncommitted writes; a read outside uses the pool).
- `Connection = Db | Tx` lets the same repository method run top-level or inside a transaction without overloads.
- The migrator (§7) uses a raw client, not `Connection`, because it must not run inside a user transaction boundary that Drizzle controls.

### 2.3 Programmatic migrator (`src/migrator.ts`)

```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
export async function runMigrations(db: Db, migrationsFolder = './drizzle'): Promise<void>;
```

Used by the test harness (§3) and the migration/restore tests (§7). It does **not** create schema objects itself; it only replays the committed SQL in `drizzle/`.

---

## 3. Test harness (`test/harness.ts`)

Owned by **T01**; imported by every other test file. Hermetic by construction — **no test depends on the long-running `docker-compose` service** (`docker-compose.test.yml` on :5433 is for manual/dev only, not for `vitest`).

### 3.1 Public helper signatures (exact)

```ts
// test/harness.ts
export interface TestDb {
  readonly url: string; // postgres://...  (hand to createClient if needed)
  readonly db: Db; // drizzle handle, migrations already applied
  readonly $raw: Sql; // postgresjs raw client for adversarial SQL / pg_dump helpers
  readonly close: () => Promise<void>; // stop container (afterAll)
}

/** Start one isolated Postgres, apply all migrations, return a ready handle. */
export function startPostgres(opts?: { image?: string; database?: string }): Promise<TestDb>;

/** Sugar: start → fn(db) → close. For whole-file setup use startPostgres + afterAll. */
export function withTestDb(fn: (db: TestDb) => Promise<void>): Promise<void>;

/** Per-test isolation: run fn inside a transaction that is ALWAYS rolled back. */
export function withRollbackTx<T>(db: TestDb, fn: (tx: Tx) => Promise<T>): Promise<T>;

/** Unique identifier for namespacing test databases/schemas (re-exports test-support helper). */
export function uniqueDbName(prefix: string): string;
```

### 3.2 Isolation strategy

- **One container per test file** (`beforeAll` → `startPostgres()`; `afterAll` → `close()`). Container image `postgres:17-alpine` (matches `docker-compose.yml`).
- Inside that container: a single database (default `kms_test`), all migrations applied once in `beforeAll`.
- **Per-test isolation = transaction rollback.** Repository/contract tests wrap each test body in `withRollbackTx`. This is fast (no DDL per test) and hermetic.
- **Migration / integrity / concurrency tests** (T06/T07) cannot use rollback isolation (they need commits and parallel connections), so they use either a fresh database (`CREATE DATABASE uniqueDbName(...)`) within the same container or `TRUNCATE ... RESTART IDENTITY CASCADE` in `beforeEach`. The harness exposes `$raw.query` for both.

### 3.3 Keeping it fast on Windows/Docker

- Start container with `.withStartupTimeout(60_000)`; Ryuk left **enabled** (default) so leaked containers self-clean.
- Reuse the migrated `db` across all tests in a file (migrate once in `beforeAll`).
- Parallelism: vitest file-level isolation means each file gets its own container; acceptable (~2–4 s startup). Do **not** share one container across files via global setup — it breaks hermeticity and serializes. If startup cost becomes a measured problem, the main agent may introduce a single shared container with per-file unique schemas later; that is out of P03 scope to optimize further.
- Guard: tests skip cleanly with a descriptive message if the Docker daemon is unreachable, but **a skipped DB test can never satisfy acceptance** (packet: "Mocks cannot satisfy database acceptance").

---

## 4. Schema file breakdown — every P02 entity → Drizzle table

Conventions for every table:

- `id` is `uuid` (`primaryKey`, default `gen_random_uuid()`) unless P02 models a non-UUID string id (e.g. `ChunkId`, `TranscriptSegment.id`, `MinutesVersion.id`) — those use `text` `primaryKey` and the value is produced upstream.
- All timestamps are `timestamptz` (UTC). At the DB→domain boundary they are converted to ISO-8601 strings to satisfy the P02 `z.string().datetime()` parsers.
- Millisecond values are `bigint` columns exposed as `number` (P02 `z.number().int()`). Use `bigint` to avoid `number` overflow on long sessions; `mode: 'number'` mapping at parse time.
- Every **user-data** table carries `owner_id text NOT NULL` and an index on `(owner_id, …)` even when the owner is derivable via FK — it makes owner-scoped queries single-table and keeps wrong-owner reads uniform.
- All pgEnums are defined in the schema file that first uses them, **sourced from P02** (§1.4). They are re-exported from `src/schema/index.ts`.

### ENUM registry (exact names → exact values, all from P02)

| Enum name               | Values (from P02)                                                                                                                                                              | Source                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `meeting_language`      | `vi`, `en`                                                                                                                                                                     | `MeetingLanguageSchema`                          |
| `meeting_mode`          | `meeting_only`, `meeting_translate`                                                                                                                                            | `MeetingModeSchema`                              |
| `meeting_state`         | `draft`, `checking`, `recording`, `paused`, `finalizing`, `processing`, `ready`, `recovery_required`, `partial_ready`, `deleted`                                               | `MEETING_STATES`                                 |
| `audio_source`          | `mic`, `system`, `derived_mix`                                                                                                                                                 | `AudioSourceSchema`                              |
| `speech_mode`           | `api`, `local`                                                                                                                                                                 | `SpeechModeSchema`                               |
| `upload_status`         | `pending`, `uploading`, `completed`, `failed`                                                                                                                                  | `UploadStatusSchema`                             |
| `timeline_marker_type`  | `pause`, `gap`                                                                                                                                                                 | `TimelineEvent` (PauseInterval/GapMarker `type`) |
| `audio_gap_description` | `source_disconnect`, `buffer_overflow`, `crash_recovery`                                                                                                                       | `GapMarkerSchema.description`                    |
| `transcript_source`     | `api`, `local`, `manual`                                                                                                                                                       | `TranscriptSourceSchema`                         |
| `gap_reason`            | `network_loss`, `provider_unavailable`, `buffer_overflow`, `crash_recovery`, `source_disconnect`                                                                               | `GapReasonSchema`                                |
| `translation_status`    | `pending`, `processing`, `completed`, `failed`                                                                                                                                 | `TranslationStatusSchema`                        |
| `minutes_template`      | `team`, `one_on_one`, `direct_report`, `leadership`, `recurring`                                                                                                               | `ALL_TEMPLATES`                                  |
| `detail_level`          | `detailed`, `near_verbatim`                                                                                                                                                    | `DetailLevelSchema`                              |
| `action_item_status`    | `open`, `done`, `needs_confirmation`                                                                                                                                           | `ActionItemStatusSchema`                         |
| `evidence_owner_type`   | `section`, `action_item`                                                                                                                                                       | derived from `EvidenceRef` usage                 |
| `paper_size`            | `A4`, `Letter`, `Legal`                                                                                                                                                        | `PaperSizeSchema`                                |
| `export_format`         | `docx`, `pdf`, `markdown`, `txt`, `json`, `audio`                                                                                                                              | `ExportFormatSchema`                             |
| `export_status`         | `pending`, `processing`, `completed`, `failed`                                                                                                                                 | `ExportStatusSchema`                             |
| `job_type`              | `speech_transcription`, `translation`, `minutes_generation`, `export`, `deletion`, `finalization`, `backfill`                                                                  | `JobTypeSchema`                                  |
| `job_state`             | `pending`, `running`, `completed`, `failed`, `cancelled`, `retrying`                                                                                                           | `JobStateSchema`                                 |
| `entity_type`           | `meeting`, `audio_chunk`, `transcript_segment`, `transcript_revision`, `translation_segment`, `speaker`, `minutes_document`, `minutes_version`, `export_job`, `processing_job` | `EntityTypeSchema`                               |
| `deletion_state`        | `pending`, `in_progress`, `completed`, `failed`                                                                                                                                | storage-only (P22 lifecycle)                     |
| `deletion_step_status`  | `pending`, `running`, `completed`, `failed`, `skipped`                                                                                                                         | storage-only (P22 lifecycle)                     |
| `outbox_state`          | `pending`, `published`, `failed`                                                                                                                                               | storage-only dispatch lease                      |

### CHECK constraint registry (exact, derived from P02 `.refine`)

- `meetings`: `version > 0`; `char_length(title) BETWEEN 1 AND 500`; `(ended_at IS NULL OR started_at IS NOT NULL)`; `(ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)`.
- `meeting_capture_sources`: `source IN ('mic','system')` (defensive even though enum allows `derived_mix`).
- `audio_chunks`: `chunk_index >= 0`; `byte_length > 0`; `duration_ms > 0`; `sample_rate = 48000`; `channels = 1`; `codec = 'opus'`; `container = 'webm'`; `wall_clock_end >= wall_clock_start`; `monotonic_end >= monotonic_start`; `sha256 ~ '^[0-9a-fA-F]{64}$'`.
- `timeline_markers`: `end_ms >= start_ms`; `duration_ms > 0`; `(marker_type = 'pause') OR (marker_type = 'gap' AND description IS NOT NULL)`.
- `transcript_segments`: `end_ms > start_ms`; `sequence >= 0`; `confidence IS NULL OR confidence BETWEEN 0 AND 1`; `(is_gap = false OR gap_reason IS NOT NULL)`.
- `evidence_refs`: `end_ms >= start_ms`; `quote_hash IS NULL OR quote_hash ~ '^[0-9a-fA-F]{64}$'`.
- `minutes_versions`: `version > 0`.
- `minutes_documents`: `current_version > 0`.
- `jobs`: `max_attempts > 0`; `progress IS NULL OR progress BETWEEN 0 AND 100`.
- `job_attempts`: `attempt > 0`.
- `safe_audit`: none in SQL (jsonb); enforced by application allowlist mirroring `SafeErrorDetailSchema` forbidden keys (`transcriptText`, `audioData`, `minutesContent`, `meetingContent`, `apiKey`, `accessToken`, …). The insert path validates metadata against a port of `SafeErrorDetailSchema` before writing.

---

### 4.1 T01 — `src/schema/identity.ts`, `meeting.ts`, `capture.ts`, `audio.ts` (+ shared scaffolding)

T01 also owns: `package.json`, `tsconfig.json`, `vitest.config.ts`, `drizzle.config.ts`, `src/client.ts`, `src/migrator.ts`, `src/schema/index.ts`, `test/harness.ts`, and migration `drizzle/0000_init_identity_meeting_capture_audio.sql` + `meta/`.

**`identity.ts`**

| Table                 | Columns / constraints                                                                                                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`               | `id text pk`, `created_at timestamptz not null default now()`. Minimal — P04 adds auth shape. `owner_id` everywhere FKs here.                                                                                                                                                     |
| `external_identities` | `id uuid pk default gen_random_uuid()`, `user_id text not null references users(id) on delete cascade`, `issuer text not null`, `subject text not null`, `created_at timestamptz not null default now()`. **Unique index `(issuer, subject)`** (identity key). Index `(user_id)`. |

**`meeting.ts`**

| Table                     | Columns / constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meetings`                | `id uuid pk` (P02 `MeetingId`), `owner_id text not null references users(id)`, `title text not null`, `language meeting_language not null`, `mode meeting_mode not null`, `speech_mode speech_mode not null default 'api'`, `timezone text not null`, `version integer not null` (optimistic), `state meeting_state not null default 'draft'`, `capture_profile jsonb not null` (snapshot of `DEFAULT_CAPTURE_PROFILE`; validated at boundary), `created_at timestamptz not null`, `started_at timestamptz`, `ended_at timestamptz`, `deleted_at timestamptz`. CHECKs per registry. Indexes: `(owner_id, created_at desc, id)` (library pagination), `(owner_id, state)`, `(id, owner_id)` covering. |
| `meeting_capture_sources` | `meeting_id uuid not null references meetings(id) on delete cascade`, `source audio_source not null`. PK / **unique `(meeting_id, source)`**, CHECK `source in ('mic','system')`. Represents `captureSources[]` (normalized → enforces non-empty + no duplicates at DB).                                                                                                                                                                                                                                                                                                                                                                                                                             |

Immutability (language/mode/captureSources after recording start): enforced by a **trigger** (co-located here, see §6) that forbids UPDATE of `language`/`mode` and any INSERT/DELETE on `meeting_capture_sources` when `meetings.state NOT IN ('draft','checking')`.

**`capture.ts`**

| Table               | Columns / constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture_intervals` | `id uuid pk`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `source audio_source not null`, `started_at timestamptz not null`, `ended_at timestamptz`, `monotonic_start bigint not null`, `monotonic_end bigint`, `created_at timestamptz not null default now()`. CHECK `(ended_at is null or ended_at >= started_at)`, `(monotonic_end is null or monotonic_end >= monotonic_start)`. Index `(meeting_id, source, started_at)`. Represents the open/close of a capture session (start→pause, resume→pause). |
| `timeline_markers`  | `id uuid pk`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `source audio_source not null`, `marker_type timeline_marker_type not null`, `description audio_gap_description` (null when pause), `start_ms bigint not null check (start_ms >= 0)`, `end_ms bigint not null`, `duration_ms bigint not null`. CHECKs per registry. Unique `(meeting_id, source, marker_type, start_ms)`. Models the P02 `TimelineEvent` union (`PauseInterval                                                                    | GapMarker`). |

**`audio.ts`**

| Table             | Columns / constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `audio_chunks`    | `id text pk` (P02 `ChunkId` = `{meetingId}/{source}/{chunkIndex}`), `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `source audio_source not null`, `chunk_index integer not null`, `storage_key text not null`, `started_at timestamptz not null`, `duration_ms bigint not null`, `byte_length bigint not null`, `codec text not null`, `container text not null`, `sample_rate integer not null`, `channels integer not null`, `sha256 text not null`, `upload_status upload_status not null`, `finalized_at timestamptz`, `wall_clock_start timestamptz not null`, `wall_clock_end timestamptz not null`, `monotonic_start bigint not null`, `monotonic_end bigint not null`. CHECKs per registry. **Unique `(meeting_id, source, chunk_index)`** (packet invariant). Index `(meeting_id, finalized_at)`. |
| `audio_manifests` | `id uuid pk`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `source audio_source not null`, `storage_key text not null` (the JSONL manifest object key), `sha256 text not null` (manifest file checksum) check hex64, `byte_length bigint not null check (byte_length>0)`, `entry_count integer not null check (entry_count>=0)`, `first_chunk_index integer not null`, `last_chunk_index integer not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. **Unique `(meeting_id, source)`**. Atomic manifest = one row per meeting+source.                                                                                                                                                                                                            |
| `audio_assets`    | `id uuid pk`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `source audio_source not null` (always `derived_mix`), `label text not null`, `storage_key text not null`, `sha256 text not null` check hex64, `byte_length bigint not null check (byte_length>0)`, `derived_from jsonb not null` (array of `mic`/`system`), `mix_version integer not null check (mix_version>0)`, `created_at timestamptz not null default now()`. CHECK `source = 'derived_mix'`, `derived_from ?& array['mic']` (jsonb contains at least one). Models `DerivedMixMetadata`.                                                                                                                                                                                                                                                 |

Audio immutability trigger on `audio_chunks` (see §6): block UPDATE/DELETE when `OLD.finalized_at IS NOT NULL`; the single allowed post-insert mutation is setting `finalized_at` from NULL→value plus `upload_status`→`completed`.

---

### 4.2 T02 — `src/schema/transcript.ts`, `completeness.ts`; migration `drizzle/0001_transcript.sql`

| Table                     | Columns / constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transcript_segments`     | `id text pk` (P02 `TranscriptSegment.id`), `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `sequence integer not null check (sequence>=0)`, `speaker_id text not null`, `language meeting_language not null`, `text text not null`, `start_ms bigint not null check (start_ms>=0)`, `end_ms bigint not null`, `confidence double precision`, `source transcript_source not null`, `provider text`, `provider_event_id text`, `is_gap boolean not null default false`, `gap_reason gap_reason`, `created_at timestamptz not null`. CHECKs per registry. **Unique `(meeting_id, sequence)`** (stable sequence). **Partial unique index `(meeting_id, provider, provider_event_id) WHERE provider_event_id IS NOT NULL`** (DUPLICATE_PROVIDER_EVENT). Index `(meeting_id, start_ms)`, `(speaker_id)`. **Immutable after insert** (trigger §6: block all UPDATE/DELETE; corrections go to `transcript_revisions`). |
| `transcript_revisions`    | `id text pk`, `segment_id text not null references transcript_segments(id) on delete cascade`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `base_revision_id text` (self-ref ancestry; null = first revision), `revised_text text not null`, `revised_speaker_id text`, `actor_id text not null`, `reason text`, `created_at timestamptz not null`. Index `(segment_id, created_at)` (lineage order), `(base_revision_id)`. **Append-only** (trigger blocks UPDATE/DELETE). Lineage validated at boundary: `base_revision_id` must be null or reference a revision of the same segment.                                                                                                                                                                                                                                                                                                                    |
| `speakers`                | `id text pk`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `label text not null default 'Unknown Speaker'`, `display_name text`, `created_at timestamptz not null default now()`. Unique `(meeting_id, label)`. Index `(meeting_id)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `translation_segments`    | `id text pk`, `source_segment_id text not null references transcript_segments(id) on delete cascade`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `target_language meeting_language not null`, `translated_text text not null`, `provider text`, `model text`, `status translation_status not null`, `created_at timestamptz not null`. Index `(source_segment_id)`, `(meeting_id, target_language)`. **Immutable snapshot** (trigger blocks UPDATE); `status` transition is recorded by inserting a new versioned row + current pointer (see `translation_current` below) OR, for alpha simplicity, an exception is documented: status mutation is the _only_ allowed update, via a guarded repository method. **Recommendation: immutable + current-pointer** to match ADR-002 "versioned derived artifacts".                                                                                            |
| `translation_current`     | `meeting_id uuid pk references meetings(id) on delete cascade`, `source_segment_id text not null references transcript_segments(id) on delete cascade`, `current_translation_id text not null references translation_segments(id)`, `version integer not null check (version>0)` (optimistic). Unique `(source_segment_id)`. Current-pointer projection with optimistic version.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `transcript_completeness` | `meeting_id uuid pk references meetings(id) on delete cascade`, `owner_id text not null`, `audio_complete boolean not null`, `transcript_complete boolean not null`, `diarization_complete boolean`, `translation_complete boolean`, `gaps jsonb not null default '[]'` (array of `GapEntry`), `pending_ranges jsonb not null default '[]'` (array of `PendingRange`), `version integer not null check (version>0)` (optimistic), `updated_at timestamptz not null default now()`. JSON arrays validated against `GapEntrySchema`/`PendingRangeSchema` at boundary. This is the **immutable-source boundary**: source segments can't change; only this derived completeness record is mutable.                                                                                                                                                                                                                                                                 |

---

### 4.3 T03 — `src/schema/minutes.ts`, `brand.ts`, `export.ts`; migration `drizzle/0002_minutes_brand_export.sql`

| Table               | Columns / constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `minutes_documents` | `id text pk`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `template minutes_template not null`, `current_version_id text`, `current_version integer not null default 1 check (current_version>0)` (optimistic current pointer), `created_at timestamptz not null`. Index `(meeting_id)`, `(owner_id, created_at)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `minutes_versions`  | `id text pk`, `document_id text not null references minutes_documents(id) on delete cascade`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `version integer not null check (version>0)`, `template minutes_template not null`, `detail_level detail_level not null`, `output_language meeting_language not null`, `provider text`, `model text`, `prompt_version text`, `transcript_projection text not null default 'current' check (transcript_projection in ('source','current'))`, `is_complete boolean not null default true`, `creator_id text not null`, `created_at timestamptz not null`. **Unique `(document_id, version)`**. Index `(meeting_id)`. **Immutable snapshot** (trigger blocks UPDATE/DELETE). `minutes_documents.current_version_id` FKs here. |
| `minutes_sections`  | `id text pk`, `version_id text not null references minutes_versions(id) on delete cascade`, `meeting_id uuid not null`, `owner_id text not null`, `kind text not null check (kind in ('section','decisions','open_questions'))`, `heading text not null`, `content text not null`, `order_index integer not null check (order_index>=0)`. Index `(version_id, order_index)`. Evidence lives in `evidence_refs`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `action_items`      | `id text pk`, `version_id text not null references minutes_versions(id) on delete cascade`, `meeting_id uuid not null`, `owner_id text not null`, `description text not null`, `owner text`, `due_date text`, `status action_item_status not null`, `order_index integer not null`. Index `(version_id)`, `(meeting_id, status)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `evidence_refs`     | `id uuid pk default gen_random_uuid()`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `owner_type evidence_owner_type not null`, `section_id text references minutes_sections(id) on delete cascade`, `action_item_id text references action_items(id) on delete cascade`, `segment_id text not null references transcript_segments(id)`, `start_ms bigint not null check (start_ms>=0)`, `end_ms bigint not null`, `quote_hash text`. CHECKs: exactly one of `section_id`/`action_item_id` is non-null; `end_ms >= start_ms`; hex64 quote hash. **Same-meeting trigger**: the referenced `transcript_segments.meeting_id` must equal `evidence_refs.meeting_id` (else raise). Index `(section_id)`, `(action_item_id)`, `(segment_id)`.                               |
| `brand_presets`     | `id text pk`, `owner_id text not null references users(id)`, `name text not null`, `logo_url text`, `primary_color text` check (`~ '^#([0-9a-fA-F]{3}                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [0-9a-fA-F]{6})$' or null`), `secondary_color text`(same check),`font_family text`, `header_text text`, `footer_text text`, `paper_size paper_size`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `version integer not null default 1 check (version>0)`(optimistic). Unique`(owner_id, name)`. Index `(owner_id)`. |
| `brand_assets`      | `id uuid pk`, `brand_preset_id text not null references brand_presets(id) on delete cascade`, `owner_id text not null`, `storage_key text not null`, `sha256 text not null` check hex64, `byte_length bigint not null check (byte_length>0)`, `kind text not null` (e.g. `logo`), `created_at timestamptz not null default now()`. Index `(brand_preset_id)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `export_jobs`       | `id text pk`, `meeting_id uuid not null references meetings(id) on delete cascade`, `owner_id text not null`, `minutes_version_id text not null references minutes_versions(id)`, `format export_format not null`, `brand_preset_id text references brand_presets(id)`, `status export_status not null default 'pending'`, `download_url text`, `created_at timestamptz not null default now()`, `completed_at timestamptz`. Index `(meeting_id)`, `(owner_id, status, created_at)`. **Version pin**: `minutes_version_id` FK guarantees the export references an immutable snapshot.                                                                                                                                                                                                                                    |
| `export_manifests`  | `id uuid pk`, `export_job_id text not null references export_jobs(id) on delete cascade`, `owner_id text not null`, `minutes_version_id text not null` (pin, provenance), `template minutes_template not null`, `detail_level detail_level not null`, `output_language meeting_language not null`, `transcript_projection text not null`, `provider text`, `model text`, `prompt_version text`, `brand_preset_id text`, `format export_format not null`, `sha256 text not null` check hex64, `byte_length bigint not null check (byte_length>0)`, `storage_key text not null`, `created_at timestamptz not null default now()`. Index `(export_job_id)`. Complete provenance + version pin for the generated file; immutable snapshot.                                                                                   |

**Optimistic current pointers**: `minutes_documents.current_version` (+ `current_version_id`) and `translation_current.version` are updated with `WHERE ... AND version = expected`; 0 rows ⇒ conflict (§5).

---

### 4.4 T04 — `src/schema/jobs.ts`, `outbox.ts`, `idempotency.ts`, `deletion.ts`, `audit.ts`; migration `drizzle/0003_operational.sql`

**Storage shape only** — no processing behavior (packet §T04, P06/P22 own behavior). All `owner_id` scoped.

| Table                 | Columns / constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jobs`                | `id text pk`, `owner_id text not null`, `meeting_id uuid not null references meetings(id) on delete cascade`, `type job_type not null`, `state job_state not null default 'pending'`, `max_attempts integer not null check (max_attempts>0)`, `progress integer check (progress between 0 and 100)`, `result jsonb` (safe metadata only; validated by app allowlist, no content/credentials), `lease_token text`, `lease_expires_at timestamptz`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `completed_at timestamptz`. Indexes: `(owner_id, state, created_at)`; `(meeting_id, type)`; lease index `(state, lease_expires_at) where state in ('pending','running','retrying')`.                                                                                            |
| `job_attempts`        | `id uuid pk`, `job_id text not null references jobs(id) on delete cascade`, `attempt integer not null check (attempt>0)`, `started_at timestamptz not null`, `completed_at timestamptz`, `success boolean not null`, `error_code text`, `error_message text`. **Unique `(job_id, attempt)`**. Index `(job_id, attempt)`. Error stored as code+message only (mirrors safe error catalog); **no provider bodies / stack traces / content**.                                                                                                                                                                                                                                                                                                                                                                                           |
| `job_progress`        | `id uuid pk`, `job_id text not null references jobs(id) on delete cascade`, `recorded_at timestamptz not null default now()`, `percent integer not null check (percent between 0 and 100)`, `message text` (safe, content-free). Index `(job_id, recorded_at)`. Append-only progress history.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `outbox_events`       | `id uuid pk`, `message_id text not null`, `correlation_id text not null`, `causation_id text`, `owner_id text not null`, `entity_type entity_type not null`, `entity_id text not null`, `event_type text not null`, `event_version integer not null check (event_version>0)`, `actor_id text not null`, `idempotency_key text not null`, `payload jsonb not null` (validated by app to reject forbidden keys — see §6/P03-A06), `state outbox_state not null default 'pending'`, `leased_until timestamptz`, `attempts integer not null default 0`, `last_error_code text`, `created_at timestamptz not null default now()`, `published_at timestamptz`. **Unique `(message_id)`**. Lease/dedupe index `(state, leased_until) where state='pending'`; index `(entity_type, entity_id)`.                                             |
| `idempotency_records` | `id uuid pk`, `owner_id text not null`, `entity_type entity_type not null`, `idempotency_key text not null`, `request_id text not null`, `response_code text`, `response_summary jsonb` (safe metadata), `created_at timestamptz not null default now()`, `expires_at timestamptz not null`. **Unique `(owner_id, entity_type, idempotency_key)`**. Index `(expires_at)` (expiry sweep).                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `deletion_tombstones` | `id uuid pk`, `meeting_id uuid not null references meetings(id) on delete restrict`, `owner_id text not null`, `state deletion_state not null default 'pending'`, `requested_at timestamptz not null default now()`, `completed_at timestamptz`. **Unique `(meeting_id)`** (one tombstone per meeting). Index `(owner_id, state)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `deletion_steps`      | `id uuid pk`, `tombstone_id uuid not null references deletion_tombstones(id) on delete cascade`, `step text not null`, `status deletion_step_status not null default 'pending'`, `attempt integer not null default 0`, `started_at timestamptz`, `completed_at timestamptz`, `error_code text`. **Unique `(tombstone_id, step)`** (idempotent step completion). Index `(tombstone_id, status)`. Stores **counts/IDs only** — no meeting content (P03-A06).                                                                                                                                                                                                                                                                                                                                                                          |
| `safe_audit`          | `id uuid pk`, `owner_id text not null`, `actor_id text not null`, `action text not null`, `entity_type entity_type not null`, `entity_id text not null`, `occurred_at timestamptz not null default now()`, `metadata jsonb not null default '{}'`. Index `(owner_id, occurred_at)`, `(entity_type, entity_id)`. **Application allowlist** mirrors `SafeErrorDetailSchema` forbidden keys; the repository refuses to insert any metadata whose keys contain `transcriptText`, `audioData`, `minutesContent`, `meetingContent`, `apiKey`, `accessToken`, `refreshToken`, `secretKey`, `password`, `credential`, `token`, `secret`, `key`, `providerResponseBody`, `rawBody`, `responseBody`. No raw SQL CHECK can express substring-over-jsonb portably, so this is enforced in the repository insert path (§6 adversarial test #19). |

---

## 5. Repository design (T05)

Owned by **T05** in `src/repositories/**` + `src/index.ts`. Depends on T01–T04 schemas.

### 5.1 Core types (`src/repositories/types.ts`)

```ts
export interface OwnerContext {
  readonly ownerId: string;
} // mandatory on every user-data method

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
export interface PageQuery {
  readonly limit: number;
  readonly cursor?: string;
} // limit bounded by repo

// Stable cursor = base64url(`${createdAtIso}|${id}`). Ordering is always (created_at ASC, id ASC).
export function encodeCursor(createdAt: Date, id: string): string;
export function decodeCursor(cursor: string): { createdAt: Date; id: string };

// Stable, owner-agnostic DB error categories (never leak SQL/text):
export type DbErrorCategory =
  | 'not_found'
  | 'conflict'
  | 'version_conflict'
  | 'duplicate'
  | 'constraint_violation'
  | 'immutable_violation'
  | 'internal';
export class DbError extends Error {
  constructor(
    public readonly category: DbErrorCategory,
    public readonly cause?: unknown,
  ) {
    super(category);
  }
}
```

### 5.2 Common module (`src/repositories/base.ts`)

- `ownerScope(conn, ctx, table)`: returns a Drizzle `.$dynamic()` select filtered by `eq(table.owner_id, ctx.ownerId)`. Wrong-owner reads return zero rows ⇒ `null`/`404`, indistinguishable from missing.
- `paginate<T>(select, query, orderByCreatedAtThenId)`: applies `(created_at, id) > (decoded.cursor)` and `LIMIT query.limit + 1`; returns `Page<T>` with `nextCursor` set only if the extra row exists.
- `toDomain<TDomain>(row, schema: ZodSchema<TDomain>)`: runs `schema.parse(row)` (after mapping `Date→ISO`, `bigint→number`). On failure throws `DbError('internal')` — **never leaks the row or Zod path**. This is the P02 parse boundary mandated by the packet.
- `assertOneRow(result, ctx)`: maps 0 rows from a wrong-owner/missing read to `null`; never distinguishes them.
- **Optimistic-version update helper** (`updateWithVersion`):
  1. `UPDATE t SET ... , version = version + 1 WHERE id = $id AND owner_id = $owner AND version = $expected`.
  2. If `rowCount === 1` → success.
  3. If `rowCount === 0` → run `SELECT 1 FROM t WHERE id = $id AND owner_id = $owner`:
     - 0 rows → `DbError('not_found')` (wrong owner or genuinely missing — indistinguishable).
     - 1 row → `DbError('version_conflict')`.
       This gives the correct category without leaking and without a racy read-then-write.
- **Constraint → category mapper** (`mapDbError(e)`): inspects the postgresjs error code only (`23505`→`duplicate`/`conflict`, `23503`→FK/`not_found`, `23514`→`constraint_violation`, the immutability trigger's custom SQLSTATE `P0311`→`immutable_violation`); strips `message`/`detail`/`hint`/`where` before any logging (P03-A06).

### 5.3 Repository method list (every user-data method takes `ctx: OwnerContext` + `conn: Connection`)

**`meetings.ts` — MeetingsRepository**

- `create(ctx, conn, input: MeetingSettings, state: MeetingState): Promise<MeetingSettings>`
- `get(ctx, conn, id: MeetingId): Promise<MeetingSettings | null>` (owner-scoped; returns aggregate incl. `captureSources` from join)
- `list(ctx, conn, query: PageQuery, filter?: { state?: MeetingState }): Promise<Page<MeetingSettings>>`
- `updateState(ctx, conn, id, expectedVersion, command result `{ state, startedAt?, endedAt? }`): Promise<MeetingSettings>` — optimistic (`updateWithVersion`); language/mode/captureSources never mutated here.
- `softDelete(ctx, conn, id, expectedVersion): Promise<MeetingSettings>` (sets `deleted_at`, state→`deleted`)
- `restore(ctx, conn, id, expectedVersion, previousState): Promise<MeetingSettings>`
- `setCaptureSources(ctx, conn, id, sources)` — only allowed pre-recording (DB trigger enforces); used by create.

**`manifests.ts` — AudioRepository** (chunks + manifests + assets; append/finalize/read only)

- `registerChunk(ctx, conn, chunk: AudioChunk): Promise<{ id: ChunkId; created: boolean }>` — idempotent: same `(meeting,source,index)` + same `sha256` ⇒ `{created:false}`; different `sha256` ⇒ `DbError('conflict')` (AUDIO_CHUNK_CONFLICT).
- `finalizeChunk(ctx, conn, id: ChunkId, sha256, finalizedAt): Promise<AudioChunk>` — the only allowed mutation; trigger locks the row afterwards.
- `getChunk(ctx, conn, id): Promise<AudioChunk | null>`
- `listChunks(ctx, conn, meetingId, source, query): Promise<Page<AudioChunk>>`
- `upsertManifest(ctx, conn, meetingId, source, manifest): Promise<void>` — atomic manifest update (replace row).
- `getManifest(ctx, conn, meetingId, source): Promise<ManifestAggregate | null>`
- `createAsset(ctx, conn, asset: DerivedMixMetadata + storage): Promise<AudioAsset>`
- `listAssets(ctx, conn, meetingId): Promise<AudioAsset[]>`

**`transcript.ts` — TranscriptRepository** (segments append-only; revisions append-only; completeness mutable with version)

- `appendSegments(ctx, conn, meetingId, segments: TranscriptSegment[]): Promise<void>` — bulk insert; duplicate provider event ⇒ `DUPLICATE_PROVIDER_EVENT` via partial unique index.
- `finalizeTranscript(ctx, conn, meetingId): Promise<void>` — no-op marker (sequence is already stable; immutability is row-level).
- `getSegment(ctx, conn, id): Promise<TranscriptSegment | null>`
- `listSegments(ctx, conn, meetingId, query): Promise<Page<TranscriptSegment>>`
- `addRevision(ctx, conn, revision: TranscriptRevision): Promise<TranscriptRevision>`
- `listRevisions(ctx, conn, segmentId): Promise<TranscriptRevision[]>` (lineage order)
- `upsertSpeaker` / `listSpeakers(ctx, conn, meetingId)`
- `upsertTranslation(ctx, conn, input): Promise<TranslationSegment>` — inserts immutable translation row + bumps `translation_current.version` optimistically.
- `getCurrentTranslation(ctx, conn, segmentId): Promise<TranslationSegment | null>`
- `setCompleteness(ctx, conn, meetingId, completeness, expectedVersion): Promise<Completeness>` — optimistic update.
- `getCompleteness(ctx, conn, meetingId): Promise<Completeness | null>`

**`minutes.ts` — MinutesRepository**

- `createDocument(ctx, conn, meetingId, template): Promise<MinutesDocument>`
- `createVersion(ctx, conn, input: MinutesVersion): Promise<MinutesVersion>` — inserts version + sections + action_items + evidence_refs atomically; then atomically advances `minutes_documents.current_version_id`/`current_version` (optimistic).
- `getVersion(ctx, conn, id): Promise<MinutesVersion | null>` (full aggregate with sections/action_items/evidence)
- `getCurrentVersion(ctx, conn, documentId): Promise<MinutesVersion | null>`
- `listVersions(ctx, conn, documentId, query): Promise<Page<MinutesVersion>>`
- `upsertBrandPreset(ctx, conn, preset, expectedVersion?): Promise<BrandPreset>` (optimistic update)
- `listBrandPresets(ctx, conn): Promise<BrandPreset[]>`
- `createExportJob(ctx, conn, input: ExportJob): Promise<ExportJob>`
- `completeExportJob(ctx, conn, id, manifest): Promise<ExportJob>` — sets status, download_url, completed_at, writes immutable `export_manifests`.
- `getExportJob(ctx, conn, id): Promise<ExportJob | null>`
- `listExportJobs(ctx, conn, meetingId, query): Promise<Page<ExportJob>>`

**`jobs.ts` — JobsMetadataRepository** (metadata CRUD only; processing is P06)

- `create(ctx, conn, input): Promise<Job>`
- `get(ctx, conn, id): Promise<Job | null>`
- `list(ctx, conn, query, filter?: { meetingId?; type?; state? }): Promise<Page<Job>>`
- `lease(ctx, conn, id, leaseToken, leaseExpiresAt): Promise<Job | null>` (claim for a worker)
- `recordAttempt(ctx, conn, id, attempt: JobAttempt): Promise<void>`
- `recordProgress(ctx, conn, id, percent, message?): Promise<void>`
- `markState(ctx, conn, id, state, result?): Promise<Job>` (terminal states)

Notes common to all repositories:

- **No generic update/delete on source tables.** Finalize is the only source mutation. Permanent deletion is not exposed in P03 (P22).
- Every method that writes takes `conn: Connection`; multi-step writes are wrapped by the caller in `db.transaction`.
- Pagination cursor order is `(created_at ASC, id ASC)`; the cursor is opaque base64url but deterministic.
- `toDomain` parses every row through the corresponding P02 Zod schema before returning.

---

## 6. Integrity / immutability plan (T06)

### 6.1 Recommended approach: BEFORE-row triggers raising a custom SQLSTATE

Triggers are the **primary** enforcement because P03 has no auth/role layer (P04) and triggers are owner-agnostic and tamper-resistant at the DB. Restricted repository APIs are the **secondary** layer (no update method is exposed).

Custom SQLSTATE `P0311` (= `immutable_violation`) is raised so the repository `mapDbError` can classify it distinctly from generic constraint violations. All triggers are co-located with the table that owns them (T01 audio, T02 transcript, T03 minutes) in the same migration; T06 writes **only tests**.

Exact triggers (function + `BEFORE UPDATE OR DELETE`):

| Trigger                               | Table                     | Rule                                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trg_audio_chunks_immutable`          | `audio_chunks`            | BEFORE UPDATE OR DELETE: if `OLD.finalized_at IS NOT NULL` → `RAISE EXCEPTION 'audio_chunk_finalized_immutable' USING ERRCODE='P0311'`. Allows the NULL→set finalize mutation (OLD.finalized_at IS NULL).                                          |
| `trg_transcript_segments_immutable`   | `transcript_segments`     | BEFORE UPDATE OR DELETE: always raise `P0311 'transcript_segment_immutable'`. Source segments are immutable on insert (ADR-002); corrections are revisions.                                                                                        |
| `trg_transcript_revisions_appendonly` | `transcript_revisions`    | BEFORE UPDATE OR DELETE: always raise `P0311`.                                                                                                                                                                                                     |
| `trg_translation_segments_immutable`  | `translation_segments`    | BEFORE UPDATE OR DELETE: always raise `P0311`. Current projection via `translation_current`.                                                                                                                                                       |
| `trg_minutes_versions_immutable`      | `minutes_versions`        | BEFORE UPDATE OR DELETE: always raise `P0311`.                                                                                                                                                                                                     |
| `trg_export_manifests_immutable`      | `export_manifests`        | BEFORE UPDATE OR DELETE: always raise `P0311`.                                                                                                                                                                                                     |
| `trg_meeting_language_mode_lock`      | `meetings`                | BEFORE UPDATE: if `NEW.language <> OLD.language OR NEW.mode <> OLD.mode` AND `OLD.state NOT IN ('draft','checking')` → raise `P0311 'meeting_language_mode_locked'`.                                                                               |
| `trg_meeting_capture_sources_lock`    | `meeting_capture_sources` | BEFORE INSERT OR DELETE: if the parent meeting `state NOT IN ('draft','checking')` → raise `P0311`.                                                                                                                                                |
| `trg_evidence_same_meeting`           | `evidence_refs`           | BEFORE INSERT OR UPDATE: the referenced `transcript_segments.meeting_id` must equal `NEW.meeting_id`; else raise `P0311 'evidence_cross_meeting'`. (Range-within-segment is validated at the app boundary because it depends on segment duration.) |

Rejected alternatives (documented for reviewers):

- **Column-level `GRANT UPDATE` restrictions** — no role layer exists yet (P04), and we want defense-in-depth that survives a future mis-configured role.
- **Generated columns** — express derivations, not immutability.
- **App-only immutability** — accepted as the _secondary_ layer but the packet (P03-A04) requires DB enforcement ("Finalized source evidence cannot be generically updated or deleted").

### 6.2 Adversarial test cases (T06 must implement each, via `$raw.query` to bypass repositories)

1. Duplicate chunk insert same `(meeting,source,index)` same sha256 → repository returns idempotent `{created:false}`; raw INSERT → `23505`.
2. Duplicate chunk insert with **different** sha256 → repository `DbError('conflict')`; raw → `23505`.
3. Raw `UPDATE audio_chunks SET sha256=...` on a finalized row → `P0311`.
4. Raw `DELETE FROM audio_chunks` on a finalized row → `P0311`.
5. Raw `UPDATE`/`DELETE` on `transcript_segments` → `P0311`.
6. Raw `UPDATE`/`DELETE` on `transcript_revisions` / `translation_segments` / `minutes_versions` / `export_manifests` → `P0311`.
7. Wrong-owner `get` → `null`; wrong-owner `updateState` → `DbError('not_found')`; both indistinguishable from missing (assert no row, no exception path difference).
8. Stale-version `updateState` (expected=1, actual=2) → `DbError('version_conflict')`, row unchanged.
9. Cross-meeting `evidence_refs` insert (segment belongs to another meeting) → `P0311 'evidence_cross_meeting'`.
10. Invalid enum insert (`language='fr'`) → `23514`/enum violation → `DbError('constraint_violation')`.
11. CHECK violations: `end_ms < start_ms` (transcript), `wall_clock_end < wall_clock_start`, `monotonic_end < monotonic_start`, `ended_at < started_at`, `duration_ms <= 0`, `byte_length <= 0`, `confidence > 1`, `version <= 0` → `23514`.
12. Duplicate `provider_event_id` (transcript) → partial unique → `23505` → repository `DUPLICATE_PROVIDER_EVENT`.
13. Invalid `sha256` (not 64 hex) → `23514`.
14. Concurrent duplicate insert: two parallel transactions insert the same provider event; one commits, the other maps to a canonical idempotent read.
15. Transaction rollback: force an error mid-`db.transaction` and assert zero net writes (count before == count after).
16. Evidence range beyond segment: app boundary rejects (assert repository refuses; no row written).
17. Revision FK to non-existent segment → `23503` → `DbError('not_found'/'constraint_violation')`.
18. Idempotency replay: same `(owner,entity_type,idempotency_key)` twice → second returns first `response_summary`, no duplicate side effect.
19. `safe_audit` insert with forbidden metadata key (e.g. `accessToken`) → repository rejects pre-write; assert no row inserted.
20. Language/mode change after `state='recording'` → `P0311 'meeting_language_mode_locked'`.

Every adversarial test asserts that **logs/errors contain no SQL text, no meeting content, no credentials** (P03-A06): capture repo-emitted `DbError` fields only.

---

## 7. Migration / restore plan (T07)

### 7.1 Generation & layout

- `drizzle.config.ts`: `dialect:'postgresql'`, `schema:'./src/schema/index.ts'`, `out:'./drizzle'`.
- Generate ordered SQL: **`pnpm --filter @kms/database exec drizzle-kit generate`**. Output: `drizzle/0000_*.sql`, `0001_*.sql`, … plus `drizzle/meta/_journal.json` (ordering source of truth) and snapshots. Migration filenames are prefixed numerically by drizzle-kit; the implementer gives each a descriptive suffix (`0000_init_identity_meeting_capture_audio.sql`, `0001_transcript.sql`, `0002_minutes_brand_export.sql`, `0003_operational.sql`, plus any integrity-trigger additions co-located in the owning task's migration).
- Migrations are **transactional** (drizzle-kit wraps each file in `BEGIN/COMMIT`) and **backward-compatible** (expand/contract; never a destructive down-migration in production).

### 7.2 Applying

- Programmatic (tests + app boot): `runMigrations(db)` (§2.3) → `migrate(db, { migrationsFolder:'./drizzle' })`.
- CLI: **`pnpm --filter @kms/database exec drizzle-kit migrate`** (reads `DATABASE_URL`).

### 7.3 T07 test scenarios (each a real Testcontainers run)

1. **Empty → current:** fresh container, `runMigrations`, assert every expected table/enum/index exists via `information_schema`/`pg_enum`/`pg_indexes`.
2. **Idempotent re-run:** run `runMigrations` again on the same DB → no-op, no error, row counts unchanged.
3. **N-1 → current expand/contract:** synthetically check out a DB at `0002` (apply 0000–0002 only), then apply `0003` (expand: add nullable/defaulted columns + new tables). Assert an "N-1 app" (a query using only pre-0003 columns) still works against the expanded schema. Document a sample contract migration (add nullable column → backfill → later add NOT NULL / drop old in a _separate future_ migration) and assert the N-1 app never breaks during expand.
4. **Interrupted/resumed backfill:** a migration that writes a resumable progress marker (e.g. into a `migration_batches` helper table or `drizzle.__migrations` extension) and backfills counts-only rows; kill the process mid-backfill, re-run, assert it resumes and completes with correct counts (no duplicates). Backfills audit **counts/IDs only** (P03-A06, DATA_MODEL §5).
5. **Concurrent writers:** two parallel transactions/connections writing disjoint + one overlapping row; assert unique constraints produce exactly one winner and the loser maps to idempotent read; no deadlocks under the designed index set.
6. **Failed-transaction rollback:** begin a tx, insert rows, force an error (constraint violation) → assert the whole tx rolled back (counts unchanged).
7. **Schema drift snapshot:** after migrating, dump `pg_dump --schema-only` to a committed fixture and diff against the previous snapshot; any unintended drift fails the test.
8. **Backup/restore qualification (P03-A05):**
   - Seed synthetic rows across meetings, chunks, manifest, transcript segments/revisions, minutes version + evidence, jobs, outbox.
   - Compute a **checksum bag**: per-table row counts + `sum(sha256)` over audio/manifests + set of constraint names + enum members.
   - `pg_dump` (data+schema) to a temp file; drop the database; restore from the dump into a fresh DB.
   - Re-run the checksum bag and assert equality (rows, relations, manifests, checksums, constraints).
   - Re-run the **full integrity constraint suite** (§6) against the restored DB — "Restore count passes but constraints fail" must be caught (failure-matrix row).
9. **Clean teardown:** assert `close()` stops the container and no `postgres:17-alpine` process leaks (Ryuk confirms).

### 7.4 Exact commands (for evidence records)

```
pnpm --filter @kms/database exec drizzle-kit generate
pnpm --filter @kms/database exec drizzle-kit migrate
pnpm --filter @kms/database run typecheck
pnpm --filter @kms/database run test:unit          # includes real-DB integration tests
```

---

## 8. Non-overlapping file ownership & sequencing

Two active agents never own the same file, migration sequence position, or the package index. **T01 owns all shared scaffolding** because every later task imports it.

| Task    | Exclusive files                                                                                                                                                                                                                                                                                                                                                        | Depends on     | Order                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------- |
| **T01** | `packages/database/package.json`, `tsconfig.json`, `vitest.config.ts`, `drizzle.config.ts`, `src/client.ts`, `src/migrator.ts`, `src/schema/index.ts`, `src/schema/identity.ts`, `meeting.ts`, `capture.ts`, `audio.ts`, `test/harness.ts`, `test/t01-core-schema.test.ts`, `drizzle/0000_*.sql` + `meta/` (incl. T01 immutability triggers for audio + meeting locks) | P02 (VERIFIED) | 1st                                                                         |
| **T02** | `src/schema/transcript.ts`, `src/schema/completeness.ts`, `test/t02-transcript-schema.test.ts`, `drizzle/0001_transcript.sql` + appended `meta/_journal.json` (incl. transcript immutability triggers)                                                                                                                                                                 | T01            | after T01                                                                   |
| **T03** | `src/schema/minutes.ts`, `brand.ts`, `export.ts`, `test/t03-derived-schema.test.ts`, `drizzle/0002_minutes_brand_export.sql` + `meta/` (incl. minutes/export immutability + same-meeting evidence trigger)                                                                                                                                                             | T01            | after T01 (parallel-eligible with T02 — disjoint schema files & migrations) |
| **T04** | `src/schema/jobs.ts`, `outbox.ts`, `idempotency.ts`, `deletion.ts`, `audit.ts`, `test/t04-operational-schema.test.ts`, `drizzle/0003_operational.sql` + `meta/`                                                                                                                                                                                                        | T01            | after T01 (parallel-eligible with T02/T03)                                  |
| **T05** | `src/repositories/types.ts`, `base.ts`, `meetings.ts`, `manifests.ts`, `transcript.ts`, `minutes.ts`, `jobs.ts`, `index.ts`, `src/index.ts`, `test/t05-repositories.test.ts`                                                                                                                                                                                           | T01–T04        | after all schema tasks                                                      |
| **T06** | `test/t06-integrity.test.ts` (+ `drizzle/0004_integrity_assertions.sql` **only if** a cross-table assertion is missing — otherwise tests only)                                                                                                                                                                                                                         | T01–T04        | after schema tasks (parallel-eligible with T05 since tests-only)            |
| **T07** | `test/t07-migration-restore.test.ts`, committed `drizzle/` snapshot fixture                                                                                                                                                                                                                                                                                            | T01–T06        | last                                                                        |

**Concurrency rules for the main agent (SDD dispatch):**

- T02, T03, T04 may be dispatched in parallel after T01 lands — they touch disjoint `src/schema/*.ts` files and disjoint migration files. They **share** `drizzle/meta/_journal.json`; the main agent integrates sequentially (re-run `drizzle-kit generate`/merge meta) so only one agent writes meta at a time.
- T05 depends on the full schema; T06 depends on all triggers existing; T07 depends on the final migration set. These are serialised after the schema tasks.
- The `src/schema/index.ts` barrel is owned by T01 (re-exports only); T02/T03/T04 add their exports by **append-only edit** (no rewrite of existing lines) — the main agent resolves any merge.

---

## 9. Risks & mitigations

| Risk                                                              | Mitigation                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ESM/CJS driver friction**                                       | Chose `postgres` (postgresjs), ESM-native; `prepare:false` for pooled tx per Drizzle docs. No `pg`.                                                                                                                                             |
| **Enum drift between P02 Zod and pgEnum**                         | Define every pgEnum from a P02 import (array const or `schema.options`). No duplicated literals. §1.4.                                                                                                                                          |
| **Testcontainers startup time on Windows/Docker**                 | One container per file, migrated once in `beforeAll`; per-test isolation via transaction rollback (no DDL per test). `withStartupTimeout(60_000)`, Ryuk enabled. A skipped DB test never satisfies acceptance.                                  |
| **Migration ordering correctness**                                | Numeric prefixes + drizzle-kit `meta/_journal.json` is the single order source. Re-run empty→current twice (idempotent) and snapshot diff (T07 #7).                                                                                             |
| **`pnpm verify` breakage before scaffolding lands**               | The main agent adds `packages/database` to `vitest.workspace.ts` and to the `-r` workspace only **after** T01 scaffolding typechecks & its narrow tests pass. Until then the package is invisible to `pnpm verify`. The design does not add it. |
| **Immutability without a role layer (pre-P04)**                   | DB triggers with custom SQLSTATE `P0311` (owner-agnostic, tamper-resistant) + repositories that expose no update method. §6.                                                                                                                    |
| **Leaking SQL/content in errors or audit (P03-A06)**              | `mapDbError` strips `message/detail/hint/where`; repositories emit only `DbErrorCategory`. `safe_audit` metadata validated against a port of `SafeErrorDetailSchema` before insert. Adversarial tests #19 + log-content assertions.             |
| **Optimistic version race**                                       | Atomic `UPDATE ... WHERE version=expected` + follow-up existence probe to classify not-found vs conflict; concurrent-duplicate test (T06 #14, T07 #5).                                                                                          |
| **Wrong-owner information leak**                                  | Every user-data query filters `owner_id`; wrong owner ⇒ 0 rows ⇒ `null`/`404`, indistinguishable from missing. Asserted in T06 #7.                                                                                                              |
| **Restore passes counts but breaks constraints (failure-matrix)** | Post-restore re-run of the full integrity suite (T07 #8) — counts alone never qualify a restore.                                                                                                                                                |
| **Backfill audited with content**                                 | Backfills record counts/IDs only (DATA_MODEL §5); T07 #4 asserts no content columns touched.                                                                                                                                                    |

---

## 10. Deviations from the packet

1. **Driver choice** (`postgres`/postgresjs, not `pg`) — justified in §1.2; no contract change.
2. **`participants` table** — the packet lists "participants" under T01, but P02 has **no `Participant` schema**. To avoid inventing contract, the participant roster is represented by the existing P02 `Speaker` entity (T02 `speakers`) plus `meeting_capture_sources`. T01 therefore does **not** create a free-standing `participants` table with invented columns; if a distinct participant roster is later required, it lands as a new ADR + migration. This is recorded as a handoff item, not a scope expansion. (No deviation from any invariant; only avoids fabricating a P02 type.)
3. **Derived-mix / asset representation** — P02 `DerivedMixMetadata` is stored as `audio_assets` (derived, versioned) rather than as a first-class `audio_chunks` row with `source='derived_mix'`, to keep the immutable source table purely source evidence (ADR-002). A `CHECK source='derived_mix'` isolates it.
4. **Translation current-pointer** — P02 `TranslationSegment` has no explicit version/current field; per ADR-002 ("versioned derived artifacts") we add `translation_current` + immutable `translation_segments` so the current projection is optimistic-concurrency controlled. This adds storage shape only; it does not change the P02 type (the boundary parse still produces `TranslationSegment`).
5. **Coverage thresholds** start at `0` for `@kms/database` (real-DB integration paths cannot hit 100% of driver internals); the main agent ratchets later. Domain's 100% threshold is untouched.

No other deviations. Every P02 entity has a table; every packet invariant has a constraint, index, trigger, or repository rule; every acceptance criterion P03-A01..A06 maps to T06/T07 tests above.
