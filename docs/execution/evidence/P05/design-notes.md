# P05 Design Notes — Object storage and idempotent audio chunk protocol

**Status:** Design (architecture subagent output, pre-implementation)
**Phase:** P05 (depends_on P03, P04)
**Owner:** Architecture / Engineering
**Date:** 2026-07-23
**Scope:** Object-storage protocol ONLY. No capture, transcription, finalization/backfill, local cleanup, or permanent deletion (see phase firewall).

This document maps contracts, module boundaries, DB additions, the manifest reconciliation model, limits, testing, risks, and task sequencing. It is the authoritative design reference for P05-T01…T07 implementers. It does not write production code; it fixes the interfaces each task must satisfy.

---

## 0. Findings from existing codebase (contracts already in place)

P03/P04 already delivered most of the persistence foundation P05 builds on. The implementer MUST reuse these, not re-create them:

| Concern                                                                                                                                                                                                  | Existing asset                                    | P05 action                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| `AudioChunk` domain shape (codec/container/sampleRate/channels locked, monotonic+wall-clock ordered, branded `ChunkId`)                                                                                  | `packages/domain/src/audio/schemas.ts`            | Reuse verbatim; do not relax                                               |
| Chunk ID format `{meetingId}/{source}/{chunkIndex}` + `formatChunkId`/`parseChunkId`                                                                                                                     | `packages/domain/src/meeting/schemas.ts`          | Source of opaque inputs for key derivation                                 |
| Error codes `AUDIO_CHUNK_CONFLICT` (409), `STORAGE_UPLOAD_FAILED` (502), `STORAGE_OBJECT_NOT_FOUND` (404), `STORAGE_CHECKSUM_MISMATCH` (409) + `SafeErrorDetailSchema` (forbids credential/content keys) | `packages/domain/src/errors/catalog.ts`           | Map `StorageError` → these codes                                           |
| `audio_chunks` / `audio_manifests` / `audio_assets` tables with checks + unique `(meeting_id, source, chunk_index)`                                                                                      | `packages/database/src/schema/audio.ts`           | Reuse; ADD orphan + reconciliation tables                                  |
| `audio_chunks` immutability trigger `trg_audio_chunks_immutable` (blocks UPDATE/DELETE when `finalized_at IS NOT NULL`, SQLSTATE `P0311`)                                                                | `drizzle/0000_init...sql` lines 181-198           | **Already satisfies A04 immutability.** No new audio_chunks trigger needed |
| `idempotency_records` table, unique `(owner_id, entity_type, idempotency_key)`                                                                                                                           | `packages/database/src/schema/idempotency.ts`     | Reuse for register/complete dedup                                          |
| `AudioRepository.registerChunk` (idempotent: existing+same-sha256 → `{created:false}`; existing+different → `DbError('conflict')`)                                                                       | `packages/database/src/repositories/manifests.ts` | Reuse as-is; conflict already maps to `AUDIO_CHUNK_CONFLICT`               |
| `AudioRepository.finalizeChunk` (atomic UPDATE `upload_status='completed', finalized_at` WHERE id+owner+sha256; 0 rows → not_found/conflict probe)                                                       | same                                              | Reuse; HEAD/verify happens in the service BEFORE this call                 |
| `mapDbError` maps `P0311`→`immutable_violation`, `23505`→`duplicate`, `23503`→`not_found`                                                                                                                | `packages/database/src/repositories/base.ts`      | Conflict/immutable errors flow through here                                |
| `OwnerContext { ownerId }`, `Connection = Db                                                                                                                                                             | Tx`, `ownerCondition`, `paginate`, `toDomain`     | `packages/database/src/repositories/{types,base}.ts`                       | Service passes `OwnerContext`; every repo call owner-scoped |
| Bearer auth → `request.authenticatedOwnerContext: { ownerId, issuer, subject }`                                                                                                                          | `apps/api/src/plugins/bearer-auth.ts`             | Route handler reads `request.authenticatedOwnerContext.ownerId`            |
| `requireIdempotencyKey(request)` (header `Idempotency-Key`, regex `^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$`)                                                                                                 | `apps/api/src/conventions/idempotency.ts`         | Apply on register + complete                                               |
| Rate limimiter (60 rpm default), `ApiConventionError`, `X-Request-Id`                                                                                                                                    | `apps/api/src/conventions/*`                      | Reuse; audio routes mount under the same protected scope                   |
| Env: `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`                                                                                                    | `.env.example`                                    | Source `StorageConfig`                                                     |
| Capture profile: Opus-in-WebM, 48 kHz, mono, 96 kbps, 10s chunk ≈ 120 KB                                                                                                                                 | `evidence/P00/capture-profile-v1.md`              | Drives content-type + size limits                                          |

**Key reuse decision:** `registerChunk` already implements the idempotent insert-vs-conflict semantics the contract requires (same ID/same checksum → replay; same ID/different checksum → conflict). P05's register route is a thin orchestrator over it: validate → derive key → presign → insert. The service layer must NOT re-implement conflict detection.

---

## 1. Storage package (`packages/storage/`)

### 1.1 Package layout

```
packages/storage/
  package.json            # name: @kms/storage, deps: @kms/domain, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
  tsconfig.json           # extends ../../tsconfig.base.json, include src + vitest.config.ts
  vitest.config.ts        # pool: forks, singleFork: true (matches database package)
  src/
    object-store.ts       # provider-neutral CONTRACT: ObjectStore interface + value types + StorageError
    key-derivation.ts     # deriveStorageKey() + segment validators (path-traversal/unicode-safe)
    config.ts             # StorageConfig + loadStorageConfig(env) with validation + secret redaction
    s3/
      s3-object-store.ts  # S3ObjectStore implements ObjectStore via @aws-sdk/*
      presign.ts          # presign helpers (PUT/GET) via getSignedUrl
    in-memory/
      in-memory-object-store.ts  # test/contract double; NOT shipped to production callers
    errors.ts             # StorageError + toStorageError() normalization (strips credentials/paths)
    index.ts              # public surface: ObjectStore, types, StorageError, loadStorageConfig, S3ObjectStore
```

`package.json` conventions (mirrors `@kms/database`/`@kms/auth`):

- `"private": true`, `"type": "module"`, `"exports": "./src/index.ts"`
- scripts: `typecheck` (`tsc --noEmit`), `test:unit` (`vitest run`)
- `dependencies`: `@kms/domain` (`workspace:*`), `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `zod`
- `devDependencies`: `typescript`, `vitest`, `@testcontainers/minio`, `testcontainers` (minio integration tests live here OR in `tests/integration/` — see §7)

### 1.2 `ObjectStore` capability CONTRACT (provider-neutral)

`packages/storage/src/object-store.ts`. Every method takes a **server-derived** key (see §1.3); the interface never accepts user-supplied paths.

```ts
// ── Value types ──

/** Opaque, server-derived object key (never constructed from client strings). */
export type StorageKey = string & { readonly __brand: 'StorageKey' };

export interface PutOptions {
  /** Body length in bytes; used to set Content-Length and validate against limits. */
  readonly contentLength: number;
  /** Required Content-Type the object must be stored with. */
  readonly contentType: string;
  /** Optional object metadata (x-amz-meta-*); MUST pass SafeErrorDetailSchema key filter. */
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface PutResult {
  /** Object ETag when available; never required by callers. */
  readonly etag?: string;
}

export interface HeadResult {
  readonly exists: boolean;
  readonly contentLength?: number;
  readonly contentType?: string;
  readonly etag?: string;
  readonly lastModified?: string;
  /** Object metadata if present. */
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface GetResult {
  /** Streaming body; caller MUST consume or abort. */
  readonly body: ReadableStream<Uint8Array>;
  readonly contentLength?: number;
  readonly contentType?: string;
}

export interface SignUrlOptions {
  readonly method: 'PUT' | 'GET';
  /** Lifetime in seconds. Capped by the policy in §2. */
  readonly expiresInSeconds: number;
  /** PUT only: Content-Type the uploader must send (bound as a signed header). */
  readonly contentType?: string;
  /** PUT only: exact Content-Length the uploader must send (bound when the provider supports it). */
  readonly contentLength?: number;
}

export interface SignedUrl {
  /** The presigned URL string returned to the client. */
  readonly url: string;
  readonly method: 'PUT' | 'GET';
  readonly expiresAt: string; // RFC 3339 UTC
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

// ── Contract ──

export interface ObjectStore {
  /** Store a complete object. Server-side path (completion verify) uses streaming GET instead. */
  put(
    key: StorageKey,
    body: Uint8Array | ReadableStream<Uint8Array>,
    opts: PutOptions,
  ): Promise<PutResult>;

  /** Probe existence + metadata. Cheap; used by completion to fail-fast on missing/wrong-size objects. */
  head(key: StorageKey): Promise<HeadResult>;

  /** Stream the object body. Completion uses this to compute SHA-256 authoritatively. */
  get(key: StorageKey): Promise<GetResult>;

  /**
   * Delete one object. P05 only defines this for orphan-abandonment test hygiene; production
   * permanent deletion is P22's policy. Implementations MUST NOT expose bulk/prefix delete.
   */
  delete(key: StorageKey): Promise<void>;

  /** Produce a scoped, short-lived presigned URL bound to one key + method. */
  signUrl(key: StorageKey, opts: SignUrlOptions): Promise<SignedUrl>;
}
```

### 1.3 Key derivation module (`packages/storage/src/key-derivation.ts`)

**Invariants (phase packet §"Contracts and invariants"):** keys derive SERVER-SIDE from opaque owner/meeting/source/chunk IDs; user paths are never accepted; internal keys are never returned to clients.

**Key format:**

```
audio/{ownerId}/{meetingId}/{source}/{chunkIndex}.webm
```

| Segment        | Source                                            | Validation (defense-in-depth; re-checked at derivation)                                |
| -------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `audio/`       | literal prefix                                    | enables bucket partitioning / listing                                                  |
| `{ownerId}`    | `OwnerContext.ownerId` (server-resolved identity) | non-empty; `^[A-Za-z0-9_-]{1,128}$`; rejects `/`, `\`, `..`, control chars             |
| `{meetingId}`  | UUID (branded `MeetingId`)                        | RFC 4122 UUID regex; rejects everything else                                           |
| `{source}`     | `AudioSource` enum                                | `mic` \| `system` only at registration (`derived_mix` keys are a separate P13 concern) |
| `{chunkIndex}` | integer                                           | `>= 0`, `<= 1_000_000`; integer only                                                   |
| `.webm`        | literal suffix                                    | matches container                                                                      |

**Why include `ownerId` in the key:** defense-in-depth owner isolation at the object namespace. A bug that drops the DB `WHERE owner_id=` filter still cannot let owner A address owner B's object by guessing keys, because the key itself encodes the owner and the presign path only ever signs keys derived from the authenticated owner.

**Collision avoidance:** `(meetingId, source, chunkIndex)` is globally unique by DB constraint, and those three segments are a subset of the key, so two distinct chunks cannot derive the same key. `ownerId` is constant per meeting (FK invariant), so it cannot cause a collision.

**Path-traversal / unicode safety:** the derivation function accepts **typed** inputs (branded `MeetingId`, the `AudioSource` enum, a validated `number`, and the validated `ownerId` string). It assembles the key by joining validated segments with `/` and asserts the result matches the canonical regex:

```
^audio/[A-Za-z0-9_-]{1,128}/[0-9a-fA-F-]{36}/(mic|system)/\d+\.webm$
```

Any component failing validation throws `StorageError('invalid_key')` (internal). No string concatenation of raw request bodies occurs. The function never accepts a `path`/`key`/`filename` parameter from callers — only the typed tuple. NFC-normalize `ownerId` defensively before charset check (handles equivalently-rendered owner IDs from identity providers).

**Return to client:** the register response returns `uploadUrl` (presigned) + `requiredHeaders` + `expiresAt`. It NEVER returns `storageKey`. The manifest endpoint NEVER returns `storageKey` either (see §5). `storageKey` lives only in the DB row and in service-internal presign calls.

### 1.4 `StorageConfig` (`packages/storage/src/config.ts`)

```ts
export interface StorageConfig {
  readonly endpoint: string; // S3_ENDPOINT  (e.g. http://localhost:9000)
  readonly region: string; // S3_REGION    (default us-east-1)
  readonly bucket: string; // S3_BUCKET
  readonly accessKey: string; // S3_ACCESS_KEY  (server secret — never logged/serialized)
  readonly secretKey: string; // S3_SECRET_KEY  (server secret — never logged/serialized)
  readonly forcePathStyle: boolean; // S3_FORCE_PATH_STYLE (true for MinIO)
}
```

`loadStorageConfig(env)` validates presence/format and throws a **content-free** config error if any required var is missing. It implements a `toSafeLoggable()` that redacts `accessKey`/`secretKey`/`bucket`/`endpoint` to `***` for any diagnostic. `StorageConfig` is `Error`/`JSON.stringify`-safe by storing secrets as non-enumerable accessors OR by never exposing the object to serializers — implementer picks one; tests assert `JSON.stringify(config)` contains no secret. This satisfies global invariant "Provider credentials remain server secret-store or env references" and "Logs/telemetry contain no ... credential".

### 1.5 S3 implementation (`packages/storage/src/s3/`)

- `S3ObjectStore` wraps a single `S3Client` constructed from `StorageConfig` (`forcePathStyle` forwarded; region/endpoint passed).
- `put` → `PutObjectCommand` (sets `ContentType`, `ContentLength`, `Metadata`).
- `head` → `HeadObjectCommand`; maps 404 (`NoSuchKey` / `NotFound`) to `{ exists: false }`, never throws for missing object.
- `get` → `GetObjectCommand`; body exposed as `ReadableStream` (S3 SDK v3 stream). Caller consumes.
- `delete` → `DeleteObjectCommand`.
- `signUrl` → `getSignedUrl` from `@aws-sdk/s3-request-presigner` with `PutObjectCommand` or `GetObjectCommand`. Bound headers (`Content-Type`, and `Content-Length` where supported) are added to the command so they become part of the signature.

### 1.6 `StorageError` (`packages/storage/src/errors.ts`)

```ts
export type StorageErrorCategory =
  | 'object_not_found' // → STORAGE_OBJECT_NOT_FOUND (404)
  | 'upload_failed' // → STORAGE_UPLOAD_FAILED (502)
  | 'checksum_mismatch' // → STORAGE_CHECKSUM_MISMATCH (409)
  | 'access_denied' // → STORAGE_UPLOAD_FAILED (502) — collapsed to avoid leaking policy shape
  | 'invalid_key' // → INTERNAL_ERROR (500)
  | 'provider_error' // → STORAGE_UPLOAD_FAILED (502)
  | 'config_error'; // → INTERNAL_ERROR (500)

export class StorageError extends Error {
  constructor(
    public readonly category: StorageErrorCategory,
    public readonly cause?: unknown, // SDK error; NEVER surfaced to clients
  ) {
    super(category);
    this.name = 'StorageError';
  }
}
```

**Normalization rules (`toStorageError(e)`):** inspect AWS SDK error `name`/`$metadata.httpStatusCode` ONLY (`NoSuchKey`/`NotFound`→`object_not_found`; `AccessDenied`/`403`→`access_denied`; network/timeout→`provider_error`). **Strip** `message`, `request`, `response`, headers, bucket name, endpoint, keys, and any credential. The category is the only thing that propagates. A mapping table (category → domain `ErrorCode`) lives in the service layer (§3.3), keeping `@kms/storage` free of a hard dependency on the error catalog (it imports types only).

---

## 2. Signed URL policy

| Attribute                                       | PUT (upload)                                                                            | GET (download/fetch)                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Expiry                                          | **300 s (5 min)**                                                                       | **60 s**                                                                                                |
| Bound object                                    | exactly one derived `StorageKey`                                                        | exactly one derived `StorageKey`                                                                        |
| Bound method                                    | `PUT` only                                                                              | `GET` only                                                                                              |
| Bound `Content-Type`                            | `audio/webm` (signed header)                                                            | n/a                                                                                                     |
| Bound `Content-Length`                          | bound when provider supports; authoritative length check happens at completion HEAD/GET | n/a                                                                                                     |
| `Content-Length` upper bound enforced elsewhere | server limit `MAX_CHUNK_BYTES` (§6) validated at register + completion                  | —                                                                                                       |
| Returned to client                              | `uploadUrl` + `requiredHeaders` + `expiresAt` in register response                      | only via an explicit authenticated download endpoint (P13+); **not** in P05 register/complete responses |

**Why 300 s for PUT:** typical chunk is ~120 KB (10 s Opus @ 96 kbps); even on a poor mobile link this uploads in seconds. 300 s gives retry headroom without leaving a wide attack window. **60 s for GET:** downloads are short and the URL is only minted on demand through an authenticated endpoint.

**Content-length-range caveat (documented):** S3 presigned **PUT** URLs cannot enforce `content-length-range` — that is a **POST policy** feature. We therefore bind `Content-Type` as a signed header on the presigned PUT and perform the **authoritative** length+checksum validation at completion (HEAD for length fast-fail, then streaming GET + SHA-256 compare). This is the correct layering: the presigned URL constrains _what headers the uploader must send_; the completion step constrains _what bytes actually landed_.

**Clock-skew handling:**

- The presigner uses the SDK's clock (`Date.now()` / system clock of the API host). `expiresAt` is computed as `now + expiresInSeconds` and returned alongside the URL so the client does not have to guess.
- Tests inject a controllable clock (the `S3ObjectStore` accepts an optional `now: () => Date` dependency) and assert behaviour with small offsets (±60 s) around expiry. Tests also assert a URL whose server-time expiry is in the past is rejected by MinIO.
- API host MUST run NTP / a synced clock; documented as an operational prerequisite (MinIO default skew tolerance is 15 min, well within our 5-min window, but we still keep the window tight).

---

## 3. API audio module (`apps/api/src/modules/audio/`)

### 3.1 Layout

```
apps/api/src/modules/audio/
  routes.ts            # Fastify plugin registering the 3 routes under /v1
  audio-chunk-service.ts   # AudioChunkService (orchestrates ObjectStore + AudioRepository + idempotency)
  manifest-service.ts      # builds the reconciliation view from repo reads
  dto.ts               # Zod request/response schemas (RegisterChunkRequest, CompleteChunkRequest, ManifestResponse, ...)
  errors.ts            # maps StorageError / DbError category → domain ErrorCode + http status
```

Routes mount inside the existing protected scope in `app.ts` (where `bearerAuth` is already registered), so `request.authenticatedOwnerContext` is populated. No new auth plugin.

### 3.2 Owner context flow

```
HTTP request
  → bearerAuth onRequest hook verifies token + resolves identity
  → request.authenticatedOwnerContext = { ownerId, issuer, subject }
route handler:
  const owner: OwnerContext = { ownerId: request.authenticatedOwnerContext.ownerId };
  service.registerChunk(owner, db, objectStore, parsed);
```

`ownerId` is the ONLY identity field that crosses into the service/repo layer. `issuer`/`subject` are not stored or logged in audio paths. Every repo call already takes `OwnerContext` and scopes by `owner_id`; cross-owner reads return indistinguishable null/404 (P03 guarantee, §3.2 of `base.ts`).

### 3.3 Service interface (`AudioChunkService`)

```ts
export interface RegisterChunkInput {
  // from path
  meetingId: string;
  // from body (validated by dto.ts)
  source: 'mic' | 'system';
  chunkIndex: number;
  sha256: string; // 64-hex
  byteLength: number;
  startedAt: string;
  durationMs: number;
  wallClockStart: string;
  wallClockEnd: string;
  monotonicStart: number;
  monotonicEnd: number;
  codec: 'opus';
  container: 'webm';
  sampleRate: 48000;
  channels: 1;
  // from header
  idempotencyKey: string;
}

export interface RegisterChunkResult {
  chunkId: string;
  created: boolean; // false on idempotent replay
  upload: {
    method: 'PUT';
    url: string; // presigned; NEVER the storageKey
    expiresAt: string; // RFC 3339
    requiredHeaders: { 'Content-Type': string };
  };
}

export interface CompleteChunkInput {
  meetingId: string;
  chunkId: string; // path param {meetingId}/{source}/{chunkIndex}
}

export interface CompleteChunkResult {
  chunkId: string;
  finalizedAt: string;
  sha256: string;
  byteLength: number;
}
```

**register flow** (T03):

1. `requireIdempotencyKey(request)`.
2. Validate body via `dto.ts` (source ∈ {mic,system}, chunkIndex ≥ 0 monotonic, capture profile constants, sha256 format, byteLength ≤ MAX_CHUNK_BYTES).
3. Idempotency check: look up `idempotency_records(ownerId, entity_type='audio_chunk_register', idempotencyKey)`; if a non-expired hit exists, return the stored `responseSummary` (canonical replay). This MUST happen before side effects.
4. Verify meeting exists + owner-scoped (and optionally in a recording-compatible state; strict state machine is P04 — record assumption).
5. Derive `storageKey = deriveStorageKey(ownerId, meetingId, source, chunkIndex)`.
6. `registerChunk(owner, conn, audioChunk)` → reuses existing repo. On `DbError('conflict')` → throw mapped `AUDIO_CHUNK_CONFLICT` (preserves original row — repo already does this).
7. `objectStore.signUrl(storageKey, { method:'PUT', expiresInSeconds:300, contentType:'audio/webm' })`.
8. Persist idempotency record with the response summary (inside the same tx as the chunk insert when feasible; if the repo insert already committed, store idempotency best-effort and tolerate the narrow replay window).
9. Return result WITHOUT `storageKey`.

**complete flow** (T04):

1. `requireIdempotencyKey(request)`.
2. Parse/validate `chunkId` (must match the path's `meetingId`).
3. Idempotency check (entity_type `audio_chunk_complete`); if already finalized, return canonical result.
4. `getChunk(owner, conn, chunkId)`; missing → `RESOURCE_NOT_FOUND` (owner-indistinguishable). Already finalized + same sha → canonical replay (idempotent).
5. Derive `storageKey` from the chunk row (ownerId/meetingId/source/chunkIndex) — never trust a client-supplied key.
6. `head = objectStore.head(storageKey)`; `!head.exists` → `STORAGE_OBJECT_NOT_FOUND`, do NOT finalize, record orphan-candidate (status `pending_object`).
7. If `head.contentLength !== chunk.byteLength` → `STORAGE_UPLOAD_FAILED` (size mismatch), record orphan, do not finalize.
8. **Authoritative checksum:** stream `objectStore.get(storageKey).body` through SHA-256; compare to `chunk.sha256`. Mismatch → `STORAGE_CHECKSUM_MISMATCH`, record orphan (status `corrupt_object`), do not finalize. (Typical chunk ~120 KB → cost negligible.)
9. `finalizeChunk(owner, conn, chunkId, chunk.sha256, now)` → atomic UPDATE sets `upload_status='completed', finalized_at`. The P03 immutability trigger allows this transition (OLD.finalized_at IS NULL) and then locks the row. 0 rows (concurrent completion or sha mismatch) → probe → `AUDIO_CHUNK_CONFLICT`/`RESOURCE_NOT_FOUND`.
10. Bump reconciliation version (§4.2) inside the same transaction.
11. Return `CompleteChunkResult`.

**Concurrent-completion race:** only one `finalizeChunk` UPDATE can win (the atomic `WHERE id AND owner AND sha256 AND finalized_at IS NULL` via the trigger-bounded row). The loser's probe finds `finalized_at` set → returns canonical `AUDIO_CHUNK_CONFLICT` or, better, replays the now-finalized result. Implementation choice: if the row is already finalized with the SAME sha256, return the canonical finalized result (idempotent); only a genuinely different shape is a conflict. This matches the packet's "stable replay result".

### 3.4 Route handlers (`routes.ts`)

| Method | Path                                              | Handler  |
| ------ | ------------------------------------------------- | -------- |
| `POST` | `/v1/meetings/:id/audio/chunks/register`          | register |
| `POST` | `/v1/meetings/:id/audio/chunks/:chunkId/complete` | complete |
| `GET`  | `/v1/meetings/:id/audio/manifest`                 | manifest |

Handlers: parse params/body with `dto.ts`, build `OwnerContext` from `request.authenticatedOwnerContext`, call the service within a `db.transaction` where the service needs atomicity, catch `StorageError`/`DbError`, map via `errors.ts` to the domain error envelope (`{ error: { code, message, requestId, details? } }`). `details` MUST pass `SafeErrorDetailSchema` (no keys, paths, credentials). Request body size for register is tiny (metadata only); upload bytes never traverse the API.

### 3.5 Error mapping (`errors.ts`)

| Source                                     | → Domain code               | HTTP                |
| ------------------------------------------ | --------------------------- | ------------------- |
| `StorageError('object_not_found')`         | `STORAGE_OBJECT_NOT_FOUND`  | 404                 |
| `StorageError('checksum_mismatch')`        | `STORAGE_CHECKSUM_MISMATCH` | 409                 |
| `StorageError('upload_failed'              | 'provider_error'            | 'access_denied')`   | `STORAGE_UPLOAD_FAILED` | 502 |
| `StorageError('invalid_key'                | 'config_error')`            | `INTERNAL_ERROR`    | 500                     |
| `DbError('conflict')` from `registerChunk` | `AUDIO_CHUNK_CONFLICT`      | 409                 |
| `DbError('not_found')`                     | `RESOURCE_NOT_FOUND`        | 404                 |
| `DbError('immutable_violation')`           | `AUDIO_CHUNK_CONFLICT`      | 409 (finalized row) |
| validation failure                         | `VALIDATION_ERROR`          | 400                 |
| missing/invalid idempotency key            | `VALIDATION_ERROR`          | 400                 |

`details` never includes `storageKey`, bucket, endpoint, or credential. E.g. a checksum mismatch returns `details: { chunkId, reason: 'checksum_mismatch' }` only.

---

## 4. DB additions (migration `0005_audio_orphan_reconciliation.sql`)

### 4.1 What already exists (no change)

- `audio_chunks` + immutability trigger (finalized → immutable; A04 satisfied).
- `audio_manifests` (per meeting+source summary).
- `audio_assets` (derived mix metadata; P13-owned, untouched in P05).
- `idempotency_records` (register/complete dedup).

### 4.2 New table: `audio_reconciliation` (meeting-level version counter)

**Decision: separate table, NOT a column on `audio_manifests`.** Rationale: the manifest endpoint is per-meeting across all sources, while `audio_manifests` is per (meeting, source). A meeting-level counter gives a single monotonic `reconciliationVersion` for ETag-style caching and deterministic replay, bumped atomically inside the same transaction as each register/complete.

```sql
CREATE TABLE "audio_reconciliation" (
  "meeting_id" uuid PRIMARY KEY NOT NULL,
  "owner_id"   text NOT NULL,
  "version"    bigint NOT NULL DEFAULT 1,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "audio_reconciliation_version_positive" CHECK ("audio_reconciliation"."version" > 0)
);
ALTER TABLE "audio_reconciliation"
  ADD CONSTRAINT "audio_reconciliation_meeting_id_meetings_id_fk"
  FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id")
  ON DELETE cascade ON UPDATE no action;
CREATE INDEX "audio_reconciliation_owner_idx" ON "audio_reconciliation" USING btree ("owner_id");
```

Repo helper: `bumpReconciliationVersion(ctx, conn, meetingId)` — `INSERT ... ON CONFLICT (meeting_id) DO UPDATE SET version = version + 1, updated_at = now() RETURNING version`, owner-scoped by the FK + a `WHERE owner_id = $owner` guard on read. Called inside the register/complete transaction.

### 4.3 New table: `audio_orphan_records` (orphan-candidate lifecycle)

Tracks chunks that are registered-but-never-completed, or uploaded-but-not-registered, or corrupt. P05 only **records** candidates; reconciliation/abandonment policy is P22. Columns per the brief:

```sql
CREATE TYPE "audio_orphan_status" AS ENUM(
  'pending_object',     // registered, completion saw no object (upload lost / not started)
  'size_mismatch',      // object exists, wrong length
  'corrupt_object',     // object exists, checksum mismatch
  'missing_completion', // registered, object ok, but no completion within threshold (sweeper)
  'reconciled',         // later completed / resolved
  'abandoned'           // P22 policy gave up
);

CREATE TABLE "audio_orphan_records" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id"    uuid NOT NULL,
  "owner_id"      text NOT NULL,
  "source"        "audio_source" NOT NULL,
  "chunk_index"   integer NOT NULL,
  "storage_key"   text NOT NULL,           -- internal only; never returned by manifest
  "sha256"        text,                     -- registered sha256 if known
  "byte_length"   bigint,
  "status"        "audio_orphan_status" NOT NULL,
  "detected_at"   timestamptz NOT NULL DEFAULT now(),
  "reconciled_at" timestamptz,
  CONSTRAINT "audio_orphans_status_check" CHECK (
    "audio_orphan_records"."status" IN
      ('pending_object','size_mismatch','corrupt_object','missing_completion','reconciled','abandoned')
  ),
  CONSTRAINT "audio_orphans_byte_length_positive" CHECK (
    "audio_orphan_records"."byte_length" IS NULL OR "audio_orphan_records"."byte_length" > 0
  )
);
ALTER TABLE "audio_orphan_records"
  ADD CONSTRAINT "audio_orphan_records_meeting_id_meetings_id_fk"
  FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "audio_orphan_records_meeting_source_index_unique"
  ON "audio_orphan_records" USING btree ("meeting_id","source","chunk_index");
CREATE INDEX "audio_orphan_records_owner_status_idx"
  ON "audio_orphan_records" USING btree ("owner_id","status","detected_at");
```

**Immutability:** orphan records are operational metadata (DATA_MODEL class "Operational metadata") — mutable by design (status transitions `pending_object → reconciled`). NO immutability trigger. Source audio immutability is already enforced on `audio_chunks`.

### 4.4 Expand/contract approach (DATA_MODEL §5)

This migration is purely **additive** (two new tables + one enum). No column is added to an existing table, no existing column/constraint is dropped. It is therefore safe to apply ahead of code rollout; old code simply does not read the new tables. Rollback = `DROP TABLE` both + `DROP TYPE audio_orphan_status` (contract phase). No backfill needed (new tables start empty). Migration file name: **`packages/database/drizzle/0005_audio_orphan_reconciliation.sql`** (next sequential number after `0004_identity_status.sql`). Drizzle schema (`packages/database/src/schema/audio.ts`) is appended (append-only, like the existing barrel convention) with `audioReconciliation` and `audioOrphanRecords` table objects + the `audioOrphanStatusEnum` sourced from a new domain enum constant (mirrors how `uploadStatusEnum` sources from `UploadStatusSchema`).

### 4.5 Repository additions

Extend `AudioRepository` (or a sibling `OrphanRepository` in the same file) with:

- `recordOrphan(ctx, conn, input)` — upsert on `(meeting_id, source, chunk_index)`; sets status + detected_at.
- `listOrphans(ctx, conn, meetingId)` — owner-scoped, excludes `storage_key` from the returned domain type.
- `getReconciliation(ctx, conn, meetingId)` → `{ version, updatedAt } | null`.

`mapDbError` already covers the new tables (no special SQLSTATE beyond `23505`/`23503`).

---

## 5. Manifest reconciliation model

`GET /v1/meetings/{id}/audio/manifest` returns a versioned, **path-free** view computed from `audio_chunks` + `audio_manifests` + `audio_orphan_records` + `audio_reconciliation` + `timeline_markers`.

**Response shape (dto.ts `ManifestResponseSchema`):**

```ts
{
  meetingId: string;
  reconciliationVersion: number; // from audio_reconciliation.version
  updatedAt: string; // RFC 3339
  sources: Array<{
    source: 'mic' | 'system';
    expected: { count: number; firstIndex: number | null; lastIndex: number | null };
    registered: { count: number }; // rows in audio_chunks (any upload_status)
    uploaded: { count: number }; // object HEAD-ok but not finalized (pending/uploading)
    finalized: { count: number; totalBytes: number; totalDurationMs: number };
    missing: Array<{ fromIndex: number; toIndex: number }>; // gaps in chunk_index sequence
    outOfOrder: Array<{ chunkIndex: number; registeredAt: string }>;
    conflicts: Array<{ chunkIndex: number; expectedSha256: string; reason: 'checksum_mismatch' }>;
  }>;
  timeline: {
    pauses: Array<{ startMs: number; durationMs: number }>;
    gaps: Array<{ description: string; startMs: number; endMs: number; durationMs: number }>;
  }
  orphans: Array<{
    source: 'mic' | 'system';
    chunkIndex: number;
    status: string; // audio_orphan_status value
    detectedAt: string;
    reconciledAt: string | null;
    // NOTE: storage_key intentionally absent
  }>;
}
```

**Computation rules (manifest-service.ts):**

- `expected`: derived from `first_chunk_index`/`last_chunk_index`/`entry_count` on `audio_manifests`, or from the densest finalized range if no manifest row exists yet.
- `missing`: walk the sorted finalized+registered `chunk_index` set per source; emit `[from,to]` ranges for any gap in the monotonic sequence (capture-profile invariant: index is monotonic per source, gaps are explicit). A pause-truncated chunk is NOT a gap in index.
- `outOfOrder`: chunks whose `wall_clock_start` is earlier than a previously-registered lower-index chunk (registeredAt ordering anomaly) — surfaced for diagnostics.
- `conflicts`: orphan rows with `status='corrupt_object'` or `size_mismatch` (sha mismatch on replay). `expectedSha256` comes from the registered chunk row.
- `orphans`: projection of `audio_orphan_records` minus `storage_key`.

**Deterministic replay:** identical DB state ⇒ identical response (sorted arrays, stable field order). `reconciliationVersion` lets clients cache and detect drift without diffing payloads.

**Pagination:** the manifest is per-meeting and bounded by chunk count limits (§6); chunk lists within a source are cursor-paginated via the existing `paginate()` helper when a source exceeds `MAX_MANIFEST_SOURCE_CHUNKS` (e.g. 500) — `limit`/`cursor` query params, default returns the head + missing ranges (which are always computed over the full set, not the page).

---

## 6. Limits and security

| Limit                                   | Value                                   | Rationale / enforcement                                                                                                                                   |
| --------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Max chunk byte size (`MAX_CHUNK_BYTES`) | **50 MB** (52,428,800)                  | 10 s Opus @ 96 kbps ≈ 120 KB; 50 MB covers pathological pause-truncated chunks (~70 min of Opus). Validate at register (body) + completion (HEAD length). |
| Max chunks per meeting per source       | **10,000**                              | 2 h / 5 s × 2 sources ≈ 2,880; generous headroom. Reject register beyond this.                                                                            |
| Max chunks per meeting (all sources)    | **20,000**                              | aggregate cap.                                                                                                                                            |
| Rate limit                              | 60 rpm default (existing limiter)       | per-owner; audio routes share the global limiter. Consider a tighter per-endpoint sub-limit if load testing shows abuse.                                  |
| Concurrency                             | 1 in-flight presign per (owner, chunk)  | idempotency key + unique constraint dedup concurrent registers.                                                                                           |
| Idempotency key TTL                     | 24 h (`idempotency_records.expires_at`) | matches retry window for flaky mobile uploads.                                                                                                            |

**Owner isolation:**

- Every query is `owner_id`-scoped (P03 guarantee). Cross-owner access returns indistinguishable 404/`RESOURCE_NOT_FOUND`. No error discloses whether the resource exists under another owner.
- `storageKey` embeds `ownerId`; presign only ever signs keys derived from the authenticated owner.

**Private bucket:**

- Bucket MUST be configured with **no public access** (Block Public Access = ON). P05 security tests assert an anonymous GET on a known object key returns 403. Bucket policy denial is exercised in T06/T07.
- No object is ever served through a public/long-lived URL. All access is authenticated API or a scoped, short-lived presigned URL.

**Content exclusion from logs/telemetry:** no audio bytes, no transcript, no object URL/key, no bucket/endpoint, no credentials in any log line or error detail. The service/logs use opaque `chunkId` + status only.

**Path abuse:** key derivation rejects any segment containing `/`, `\`, `..`, NUL, or non-ASCII outside the strict charset. Tests (T01) exercise `..`, `%2F`, `%00`, Unicode lookalikes, oversized segments, and confirm none reach the object store as a path.

---

## 7. Testing strategy

| Layer                      | Location                                                                                               | What it covers                                                                                                                                       | Real vs mock                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Unit — key derivation      | `packages/storage/src/key-derivation.test.ts`                                                          | segment validation, path traversal, unicode, collision, regex, format invariants                                                                     | pure                                     |
| Unit — error normalization | `packages/storage/src/errors.test.ts`                                                                  | SDK error → `StorageError` category; credential/path stripping                                                                                       | pure                                     |
| Unit — config              | `packages/storage/src/config.test.ts`                                                                  | env parsing, missing-var content-free error, `JSON.stringify` leaks no secret                                                                        | pure                                     |
| Contract — `ObjectStore`   | `packages/storage/src/in-memory/*.test.ts` + a shared contract suite run against both in-memory and S3 | put/head/get/delete/signUrl semantics, expiry, method/object binding, missing object, content-type binding                                           | in-memory double                         |
| Integration — real MinIO   | `tests/integration/object-storage/*.test.ts`                                                           | put/head/get/delete against `@testcontainers/minio`; presign expiry/clock-skew; missing object; concurrent put; bucket-policy denial; method binding | **real MinIO**                           |
| DB repository              | `packages/database/test/*.test.ts` (or `src/*.test.ts`)                                                | orphan upsert/list, reconciliation bump (concurrent), owner-scoping, conflict → AUDIO_CHUNK_CONFLICT                                                 | real Postgres (testcontainers)           |
| API route                  | `apps/api/src/modules/audio/*.test.ts`                                                                 | register/complete/manifest happy path, idempotent replay, conflict, owner isolation, missing idempotency key, size/checksum mismatch mapping         | injected in-memory ObjectStore + test DB |
| Security                   | `tests/integration/object-storage/security.test.ts` (+ API)                                            | path traversal, cross-owner indistinguishable 404, expired URL denied, private bucket anonymous 403, credential never in response/log                | real MinIO + real Postgres               |

**Synthetic fixtures only** (global invariant). Audio chunk bodies are random byte arrays of the expected length with a precomputed SHA-256 — never real meeting content.

**T07 adversarial matrix** runs the full fault set (duplicate/out-of-order/missing/corrupt/expired/cross-user/path) against real MinIO + real Postgres and inspects canonical DB rows + objects after each injected failure.

---

## 8. Risks and sequencing

### 8.1 Top risks + mitigations

1. **MinIO Testcontainer flakiness on Windows / Docker parallel exhaustion.** P03 hit this (resolved by `pool:'forks', singleFork:true`). Mitigation: storage package's `vitest.config.ts` copies the same single-fork settings; MinIO tests run sequentially; document a docker-compose MinIO fallback for local dev; CI pins Docker resource limits. Severity: high (blocks T02/T07 if it regresses).
2. **Presigned PUT cannot enforce content-length-range** (S3 limitation). Mitigation: bind `Content-Type` on the presigned URL; perform authoritative length+checksum at completion (HEAD fast-fail + streaming GET SHA-256). Documented in §2 so implementers don't attempt an unsupported policy. Severity: medium (design clarity, not a blocker).
3. **Concurrent completion race / lost completion call.** Two `complete` calls or a crash between upload and complete. Mitigation: idempotency key dedup; atomic `finalizeChunk` UPDATE where only the first wins; replay returns canonical finalized result; orphan record for upload-lost cases. T04 injects failures before/after DB commit. Severity: high (correctness core to A02).
4. **Clock skew on presigned URLs.** Mitigation: short windows (300 s/60 s) vs MinIO's 15-min tolerance; injected clock in tests; `expiresAt` returned to client; NTP prerequisite documented. Severity: low.
5. **Credential/path leakage in errors or logs.** Mitigation: `StorageError` strips everything but category; `SafeErrorDetailSchema` filter; `StorageConfig` redaction; tests assert `JSON.stringify(config)` and error responses contain no secret/bucket/key. Severity: high (security core to A01/A05).

Secondary risks: Drizzle migration ordering (0005 must be generated via `drizzle-kit generate` against the appended schema, not hand-edited, to stay consistent with the journal); `derived_mix` key namespace collision (out of P05 scope, but key-derivation must reject `source='derived_mix'` at register to reserve that namespace for P13).

### 8.2 Confirmed task sequencing

Matches the packet's work-package map. Serial within each package; packages are serial where interfaces/migrations depend.

```
P03/P04 VERIFIED
        │
        ▼
┌─────────────────────────────── Storage adapter (serial) ──────────────────────────────┐
│ T01  Server-derived key + storage policy  (deriveStorageKey, StorageConfig, key tests) │
│  │   Exclusive: packages/storage/src/{key-derivation,config,errors}.ts                 │
│  ▼                                                                                     │
│ T02  Provider-neutral S3 adapter + signed URLs (ObjectStore contract, S3ObjectStore,   │
│      presign, in-memory double, contract tests, MinIO integration)                     │
│      Exclusive: packages/storage/src/{object-store,s3/*,in-memory/*,index}.ts          │
└────────────────────────────────────────────────────────────────────────────────────────┘
        │ ObjectStore + deriveStorageKey contracts frozen
        ▼
┌─────────────────────────────── Manifest API (serial) ──────────────────────────────────┐
│ T03  Idempotent chunk registration (route, AudioChunkService.register, dto, error map) │
│  │   + migration 0005 audio_reconciliation table (needed for version bump at register)  │
│  ▼                                                                                     │
│ T04  Verified atomic completion (service.complete: HEAD + streaming SHA-256 + finalize)│
│  ▼                                                                                     │
│ T05  Authoritative manifest + reconciliation view (manifest-service, ManifestResponse) │
│  ▼                                                                                     │
│ T06  Limits, conflicts, authorization, orphan lifecycle (audio_orphan_records table,   │
│      limit enforcement, security tests)                                                │
│      Exclusive: apps/api/src/modules/audio/*, packages/database migration 0005 + schema │
└────────────────────────────────────────────────────────────────────────────────────────┘
        │ all in-scope behavior implemented + narrow tests green
        ▼
┌─────────────────────────────── Adversarial reviewer (depends on all) ──────────────────┐
│ T07  Real-storage adversarial qualification against real MinIO + real Postgres         │
│      Exclusive: tests/integration/object-storage/*, security tests                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
   P05 gate → VERIFIED → handoff (unblocks P07)
```

**Sequencing notes for implementers:**

- T01 must land `deriveStorageKey` + `StorageConfig` + `StorageError` before T02 uses them.
- T02 freezes the `ObjectStore` contract that T03/T04 depend on; it must be reviewed (URL/key/credential gate) before T03 starts.
- Migration `0005` (both new tables + enum) is generated once; T03 introduces the reconciliation table usage, T06 introduces orphan-record usage, but the **migration file is owned by one task** (recommend T03 generates the full `0005` covering both tables up front to avoid migration-sequence contention between T03/T06 — confirm during preflight). Drizzle schema appends are append-only and non-conflicting across the two tasks if the migration is produced atomically.
- T07 is the independent whole-phase integrity reviewer and depends on T01–T06 being integrated.

### 8.3 Out-of-scope reminders (firewall)

- Capture/mixing/transcription, finalization/backfill, local cleanup, permanent deletion execution → later phases.
- `derived_mix` object keys and mixing → P13.
- Production S3/R2 vendor config → P25.
- GC/abandonment policy for orphan/source objects → P22 (P05 only records orphan candidates; does not delete source).
