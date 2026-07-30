# P05-T01 — Server-derived key and storage policy

**Status:** DONE
**Task:** T01 (Server-derived key, `StorageConfig`, `StorageError`)
**Package:** `@kms/storage` (new)
**Date:** 2026-07-23
**Verification basis:** TDD — tests written first, confirmed failing (module-missing), then implemented to green.

---

## 1. Files created

All under `packages/storage/` (exclusive ownership respected; no other repo files touched):

| File                         | Purpose                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`               | `@kms/storage`, private, `type: module`, `exports: ./src/index.ts`, deps `@kms/domain` (workspace:*), `zod`; devDeps `typescript`, `vitest`. No `@aws-sdk/*` (deferred to T02). |
| `tsconfig.json`              | Extends `../../tsconfig.base.json`, `include: ["src", "vitest.config.ts"]`.                                                                                                     |
| `vitest.config.ts`           | `pool: 'forks'`, sequential — see §4 assumption (vitest v4 pool rework).                                                                                                        |
| `src/errors.ts`              | `StorageErrorCategory`, `StorageError` class, `toStorageError()` normalizer.                                                                                                    |
| `src/errors.test.ts`         | 16 tests.                                                                                                                                                                       |
| `src/config.ts`              | `StorageConfig` interface, `loadStorageConfig(env)`, `toSafeLoggable()`. Secrets stored as non-enumerable, frozen properties.                                                   |
| `src/config.test.ts`         | 34 tests.                                                                                                                                                                       |
| `src/key-derivation.ts`      | `StorageKey` branded type, `deriveStorageKey()`, `isStorageKey()`.                                                                                                              |
| `src/key-derivation.test.ts` | 44 tests.                                                                                                                                                                       |
| `src/index.ts`               | Barrel: `errors`, `config`, `key-derivation`.                                                                                                                                   |

Out-of-scope (NOT created — reserved for T02): `object-store.ts`, `s3/*`, `in-memory/*`.

Only other repo-wide change: `pnpm-lock.yaml` (updated by `pnpm install` to register the new workspace package).

---

## 2. Verification

Exact commands run from repo root:

```
pnpm install --no-frozen-lockfile        # registers @kms/storage workspace
pnpm --filter @kms/storage typecheck     # exit 0, clean
pnpm --filter @kms/storage test:unit     # exit 0
```

| Command                                | Exit code | Result                      |
| -------------------------------------- | --------- | --------------------------- |
| `pnpm --filter @kms/storage typecheck` | **0**     | clean (no diagnostics)      |
| `pnpm --filter @kms/storage test:unit` | **0**     | **94 passed / 94**, 3 files |

Per-file test counts: `errors.test.ts` 16, `config.test.ts` 34, `key-derivation.test.ts` 44 → **94 total**.

---

## 3. Conformance to design-notes.md

**§1.3 key-derivation** — implemented exactly:

- Key format `audio/{ownerId}/{meetingId}/{source}/{chunkIndex}.webm`.
- NFC-normalize `ownerId` before charset check.
- ownerId `^[A-Za-z0-9_-]{1,128}$` (strict ASCII charset inherently rejects `/`, `\`, `..`, NUL, control chars, unicode lookalikes, `%2F`/`%00` literals, spaces).
- meetingId RFC 4122 UUID regex.
- source ∈ {`mic`,`system`} only; `derived_mix` and any other value → `StorageError('invalid_key')`.
- chunkIndex: `Number.isInteger`, `>= 0`, `<= 1_000_000`.
- Post-assembly assertion against canonical regex `^audio/[A-Za-z0-9_-]{1,128}/[0-9a-fA-F-]{36}/(mic|system)/\d+\.webm$`.
- Function signature takes typed segments only — no `path`/`filename` parameter accepted.
- `isStorageKey` type guard validates the canonical regex.

**§1.4 StorageConfig** — implemented exactly:

- Interface fields: `endpoint`, `region`, `bucket`, `accessKey`, `secretKey`, `forcePathStyle` (all readonly).
- `loadStorageConfig`: reads `S3_*` env vars; defaults region `us-east-1`, forcePathStyle `false`; parses `true`/`1`/`yes` (case-insensitive) for forcePathStyle; required vars = endpoint, bucket, accessKey, secretKey; endpoint validated as http/https URL.
- Missing/empty required var → `StorageError('config_error')` with content-free message (category string only; no var name leaked).
- Secret safety: `accessKey`/`secretKey` defined via `Object.defineProperty` as `enumerable: false, configurable: false, writable: false`; object `Object.freeze`'d. Verified by test: `JSON.stringify(config)` contains neither secret value, while direct `.accessKey`/`.secretKey` access still returns the value for the SDK.
- `toSafeLoggable` redacts `endpoint`/`bucket`/`accessKey`/`secretKey` to `'***'`, keeps `region`, stringifies `forcePathStyle`.

**§1.6 StorageError** — implemented exactly:

- 7 categories: `object_not_found | upload_failed | checksum_mismatch | access_denied | invalid_key | provider_error | config_error`.
- `StorageError extends Error`; `message` = category string; optional `cause`.
- `toStorageError(e)`: StorageError passthrough (same instance); classifies by AWS SDK `name` and `$metadata.httpStatusCode` only (`NoSuchKey`/`NotFound`/404 → `object_not_found`; `AccessDenied`/403 → `access_denied`; name contains `Timeout`/`Network` → `provider_error`; else `provider_error`). The normalized result carries only the category — the raw SDK error's `message`/`request`/`response`/credentials are not propagated (verified by tests asserting the original message never appears in `StorageError.message`).

---

## 4. Assumptions

1. **vitest v4 pool rework.** The task brief and design-notes §1.1/§8.1 specify `pool: 'forks', singleFork: true`. In vitest **v4.1.10** (the version pinned in this repo), `singleFork` and `poolOptions` were removed ("All previous `poolOptions` are now top-level options"). The v4-correct equivalent — `pool: 'forks', isolate: false, fileParallelism: false` — is used instead to preserve the sequential single-fork intent for T02's future MinIO testcontainers. The actual `@kms/database` vitest config (the cited precedent) sets only `pool: 'forks'`. T02 may revisit if it needs stricter isolation.

2. **`toStorageError` cause propagation.** Design-notes §1.6 states "the category is the only thing that propagates" while the `StorageError` class carries an optional `cause` for debugging. Resolution: the `StorageError` constructor still accepts a `cause` for direct construction in internal layers, but `toStorageError` (the normalization/sanitization boundary) does **not** forward the raw SDK error as `cause` for non-StorageError inputs — it returns `new StorageError(category)`. StorageError inputs pass through with their existing `cause` intact. This matches the test contract (message is category-only; original message never leaks) and is the most secure reading. If a future task needs the raw SDK error retained for structured server-side logging, it should capture it before calling `toStorageError` (the service-layer category→`ErrorCode` mapping per §3.5 drops it regardless).

3. **`-0` chunkIndex.** `Number.isInteger(-0)` is `true` and `-0 < 0` is `false`, so `-0` is accepted and rendered as `0` in the key (template-literal stringification of `-0` is `"0"`). Covered by a test asserting `/0.webm`.

---

## 5. Unresolved findings

None. All spec sections (1.1, 1.3, 1.4, 1.6) are implemented and verified; typecheck is clean; all 94 unit tests pass.
