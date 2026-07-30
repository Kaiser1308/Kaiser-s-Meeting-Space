# P05-T02 — Provider-neutral S3 adapter & signed URLs

**Task:** T02 (ObjectStore contract, S3ObjectStore, presign, in-memory double, contract + MinIO tests)
**Phase:** P05 (Object storage and idempotent audio chunk protocol)
**Status:** VERIFIED (binary gates green)
**Date:** 2026-07-23

## Scope

Implemented the provider-neutral `ObjectStore` contract, the real `S3ObjectStore`
(S3 / MinIO / R2 compatible), the presigned-URL helper, an in-memory contract
double, and the shared contract test suite run against **both** the in-memory double
and **real MinIO** (via `@testcontainers/minio`). T01's `key-derivation.ts`,
`config.ts`, `errors.ts` were reused verbatim and NOT modified.

## Files

### Created (exclusive ownership)

| File                                                            | Purpose                                                                                                                                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/storage/src/object-store.ts`                          | `ObjectStore` interface + value types (`PutOptions`, `PutResult`, `HeadResult`, `GetResult`, `SignUrlOptions`, `SignedUrl`). Imports `StorageKey` from `key-derivation.js`.                    |
| `packages/storage/src/object-store.contract.ts`                 | Shared contract suite `runObjectStoreContract(name, createStore)` + `readAll` helper. Run by both in-memory and S3/MinIO tests.                                                                |
| `packages/storage/src/in-memory/in-memory-object-store.ts`      | `InMemoryObjectStore` — faithful Map-backed test double (NOT exported from the public barrel).                                                                                                 |
| `packages/storage/src/in-memory/in-memory-object-store.test.ts` | Runs the contract against the double + in-memory-specific tests (concurrency, round-trip integrity, repeated get).                                                                             |
| `packages/storage/src/s3/presign.ts`                            | `presignUrl()` via `getSignedUrl`; binds Content-Type on PUT.                                                                                                                                  |
| `packages/storage/src/s3/s3-object-store.ts`                    | `S3ObjectStore implements ObjectStore`. SDK errors normalized via `toStorageError`; 404 → `{exists:false}` / `StorageError('object_not_found')`.                                               |
| `packages/storage/src/s3/s3-object-store.minio.test.ts`         | Real-MinIO integration: runs the full contract against `S3ObjectStore` + live presign PUT/GET round-trips via `fetch`. Skips gracefully (no Docker) via top-level detection + `describe.skip`. |

### Modified

| File                            | Change                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/storage/package.json` | Added deps `@aws-sdk/client-s3@^3.700.0`, `@aws-sdk/s3-request-presigner@^3.700.0`; devDeps `@testcontainers/minio@^10.14.0`, `testcontainers@^10.14.0`.          |
| `packages/storage/src/index.ts` | Added `export * from './object-store.js'` and `export { S3ObjectStore } from './s3/s3-object-store.js'`. In-memory double intentionally NOT exported (test-only). |

### Filename deviation (justified)

The task suggested `packages/storage/src/object-store.test.ts` for the shared
contract suite. A file that is **both** imported by other test files **and**
collected by vitest's `*.test.ts` glob cannot work: module caching means the
shared file's top-level suites register under the first importer, leaving its own
collection with zero suites → vitest v4 fails with "No test suite found".
Renamed to `object-store.contract.ts` (outside the glob) — the standard convention
for a shared, imported test helper. Both consumers updated. Behavior is identical;
only the on-disk name differs.

## Verification

```
pnpm install
pnpm --filter @kms/storage typecheck
pnpm --filter @kms/storage test:unit
```

| Command                                                 | Exit  | Result                                                    |
| ------------------------------------------------------- | ----- | --------------------------------------------------------- |
| `pnpm install`                                          | 0     | 28 packages added; `@aws-sdk/*` + testcontainers resolved |
| `pnpm --filter @kms/storage typecheck` (`tsc --noEmit`) | **0** | clean                                                     |
| `pnpm --filter @kms/storage test:unit` (`vitest run`)   | **0** | **5 files, 125 tests passed** (0 failed, 0 skipped)       |

### Test breakdown (125 total)

- `config.test.ts` + `errors.test.ts` + `key-derivation.test.ts` — 94 (T01, unchanged)
- `in-memory/in-memory-object-store.test.ts` — 16 (12 contract + 4 in-memory-specific)
- `s3/s3-object-store.minio.test.ts` — **15 (12 contract + 3 MinIO-specific), executed against REAL MinIO**

Docker was available in this environment (Docker 29.6.2), so the MinIO suite
ran for real — **no test was skipped or faked**. Live round-trips proven:
`presign PUT` (client uploads via signed URL + Content-Type → HEAD/GET verify),
`presign GET` (client downloads via signed URL → byte compare), and a real
S3-shaped ETag from `head`.

## Key design decisions

1. **Presigned PUT binds Content-Type only, not Content-Length.** Per design-notes
   §2 / risk #2: S3/MinIO presigned PUT cannot enforce `content-length-range`
   (a POST-policy feature). Content-Type is signed; authoritative length+checksum
   validation happens at completion (HEAD fast-fail + streaming GET SHA-256).
   `SignUrlOptions.contentLength` remains in the type but is intentionally NOT
   added to `requiredHeaders` for the S3 path.
2. **`S3ObjectStore.put` buffers `ReadableStream` → `Uint8Array` before upload.**
   Root cause diagnosed against real MinIO: the AWS SDK throws
   `Unable to calculate hash for flowing readable stream` for a web
   `ReadableStream` body. Safe given `MAX_CHUNK_BYTES` = 50 MB and that `put`
   stores complete objects (server-side streaming is `get`, not `put`).
   The `Uint8Array` path needs no buffering.
3. **`expiresAt` is computed from the injected `now()`** (not the SDK clock) so
   the returned field is deterministic and testable; the SDK still signs with its
   own clock. NTP prerequisite documented in design-notes §2.
4. **`SignedUrl` exposes exactly `{url, method, expiresAt, requiredHeaders}`** —
   never a storage-key / bucket / credential field. The contract asserts the
   exact key set.

## Assumptions

- `ReadableStream` (WHATWG) is the body type used everywhere (Node 24 global).
  `transformToWebStream()` from the AWS SDK returns it; no `@types/node` was
  needed (the global resolves under the current lib without it).
- MinIO default image (`minio/minio:RELEASE.2024-12-13T22-19-12Z`) and default
  credentials (`minioadmin/minioadmin`) are acceptable for the integration test;
  the bucket is created per run with a random name.
- The in-memory double is test-only and deliberately not part of the public
  surface (design-notes §1.1).

## Unresolved findings / concerns

- **MinIO test runs in `test:unit`.** It auto-skips (via `describe.skip`) when
  Docker is unavailable, so it never fakes a pass, but environments without
  Docker will simply not exercise the real adapter. T07 owns the full adversarial
  matrix against real MinIO + Postgres.
- **Presigned Content-Length not bound.** If a future requirement needs the
  uploader to be forced to a single exact size at the presign layer, S3 presigned
  PUT cannot do it — it would require moving to POST policies (out of P05 scope).
- **No bulk/prefix delete** is exposed (by design; P22 owns deletion policy).
