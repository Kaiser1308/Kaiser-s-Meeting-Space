---
phase: P05
title: Object storage and idempotent audio chunk protocol
status: NOT_STARTED
depends_on: [P03, P04]
requirements: [FR-2, FR-7, ADR-001, ADR-002]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Authenticated owners register, directly upload, complete, inspect, and download immutable audio chunks through a vendor-neutral S3 boundary. Size/checksum/idempotency conflicts, missing/out-of-order ranges, signed URL scope, and orphan state are explicit and verified with real MinIO.

# Authoritative context

Read API Contracts audio section, Data Model AudioAsset, Security signed-URL controls, ADR-001/002, P00 capture profile, and P03/P04 evidence.

# Preconditions and external prerequisites

P03/P04 are `VERIFIED`; MinIO Testcontainer/local service and two synthetic owners are available. Production S3/R2 is not required and no capture client exists yet.

# Scope firewall

**Allowed:** `packages/storage/`, API audio/storage modules, manifest repository/service, signed URL policy, orphan records, real-storage contract/integration/security tests.

**Forbidden/out:** audio capture/mixing/transcription, finalization/backfill, local cleanup, permanent deletion execution, public buckets, API-proxied bytes where direct upload works, and vendor-specific domain types.

**Extension seams:** `ObjectStore` capability contract supports S3-compatible vendors and multipart only when threshold requires it.

# Contracts and invariants

- Storage keys derive server-side from opaque owner/meeting/source/chunk IDs; user paths are never accepted.
- `registerChunk`, `completeChunk`, and `getManifest` require owner context and idempotency.
- Same chunk ID/checksum replay returns canonical result; different checksum/shape returns `AUDIO_CHUNK_CONFLICT` and preserves original.
- Completion HEADs and validates exact object length/checksum metadata before atomic finalize; finalized metadata/object are immutable.
- Signed URLs bind one owner-authorized object, method, content constraints, and short expiry; internal keys are not returned.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| `packages/storage/src/object-store.ts` | provider-neutral put/head/get/delete/sign contract | Storage adapter |
| `packages/storage/src/s3/` | S3-compatible implementation | Storage adapter |
| `apps/api/src/modules/audio/` | register/complete/manifest/download routes/services | Manifest API |
| DB manifest repositories/migration additions | object/chunk state and orphan records | Manifest API |
| `tests/integration/object-storage/` | real MinIO protocol/security/fault matrix | Independent reviewer |

# Ordered task packets

## P05-T01 - Server-derived key and storage policy

Test path traversal, separators/Unicode, owner/meeting mismatch, key collision, and log/response exposure; implement opaque key derivation and bucket/class policy. Evidence: `evidence/P05/storage-key-report.json`.

## P05-T02 - Provider-neutral S3 adapter and signed URLs

Implement put/head/get/delete and scoped sign operations needed by the protocol with injected endpoint/region/credentials. Contract tests cover MinIO, expiry, method/object/content constraints, clock skew, missing object, timeout, and safe error normalization. Evidence: `s3-conformance.json`.

## P05-T03 - Idempotent chunk registration

Implement validated route/service/transaction for source, sequence, monotonic range, format, length, SHA-256, and idempotency. Test owner state, capture profile, duplicates/concurrency/out-of-order registration, limits, and signed response. Evidence: `register-matrix.json`.

## P05-T04 - Verified atomic completion

HEAD and verify the object, atomically finalize metadata, and return stable replay result. Inject loss after upload/before call, before/after DB commit, wrong size/hash, stale URL, and concurrent completion. Evidence: `complete-fault-matrix.json`.

## P05-T05 - Authoritative manifest and reconciliation view

Expose versioned expected/registered/uploaded/finalized chunks, sources, pauses/gaps, missing/out-of-order/conflict state, and reconciliation version without object paths. Test pagination/order and deterministic replay. Evidence: `manifest-contract.json`.

## P05-T06 - Limits, conflicts, authorization, and orphan lifecycle record

Enforce type/size/rate/concurrency limits, owner isolation, conflict preservation, expired URLs, private bucket, and orphan-candidate recording. Security tests exercise every limit boundary, two-owner attempt, conflict, expiry, and bucket-policy denial. Do not delete source yet; P22 owns policy. Evidence: `storage-security-report.json`.

## P05-T07 - Real-storage adversarial qualification

Against real MinIO run duplicate/out-of-order/missing/corrupt/expired/cross-user/path/multipart-if-enabled/failure tests; inspect canonical DB rows/objects and retry outcomes. Evidence: `evidence/P05/EVIDENCE.md`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Storage adapter | T01,T02 | storage package | P03/P04 | URL/key/credential review |
| Manifest API | T03-T06 | API audio + DB additions | T01,T02 | transaction/auth review |
| Adversarial reviewer | T07 | integration/security tests | all | independent integrity review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Same ID/same checksum | state | Same canonical response; no duplicate | replay/concurrency test |
| Same ID/different checksum | security | 409, immutable original | conflict test |
| Upload succeeds/call lost | timing | Retry HEAD/completion safely | crash-boundary test |
| Missing/wrong object | persistence | Pending/corrupt actionable state, no finalize | object fault test |
| URL stolen/expired | security | Only scoped action before expiry, otherwise deny | two-owner/time test |

# Integrated verification

Run storage contract tests, real MinIO integration/fault suite, API contract/authorization/rate tests, source mutation negatives, repository typecheck, and `pnpm verify`. Inspect objects and DB state after every injected failure.

# Acceptance gate

- [ ] P05-A01 - Direct upload/download never exposes master credentials, internal paths, or cross-owner access.
- [ ] P05-A02 - Checksum/idempotency/conflict/completion semantics pass real-storage concurrency/fault tests.
- [ ] P05-A03 - Manifest truthfully exposes every expected, missing, out-of-order, pause, gap, and conflict state.
- [ ] P05-A04 - Finalized source object and metadata cannot be overwritten or generically deleted.
- [ ] P05-A05 - Limits, signed URL expiry/scope, private bucket, and path abuse tests pass.

# Migration, rollout, and rollback

MinIO local/CI first; production vendor config is P25. Do not GC source objects before P22 policy. Schema changes use expand/contract.

# Required documentation updates

API audio contract, Data Model storage mapping, `.env.example`, Status/Traceability/Progress, and P05 evidence.

# Handoff record

Unblock P07 (P10/P12 remain dependent on later phases) and stop.
