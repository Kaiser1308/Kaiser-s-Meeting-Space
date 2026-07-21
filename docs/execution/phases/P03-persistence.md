---
phase: P03
title: PostgreSQL schema, migrations, and integrity-preserving repositories
status: NOT_STARTED
depends_on: [P02]
requirements: [FR-3, FR-5, FR-7, NFR-Reliability, ADR-002, ADR-005]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

PostgreSQL persists the complete personal meeting model with deterministic Drizzle migrations, owner-ready transactional repositories, optimistic concurrency, append/finalize source APIs, versioned derived artifacts, and restore-tested expand/contract evolution using real PostgreSQL.

# Authoritative context

Read Data Model, System Architecture storage/state sections, API Contracts, ADR-002/005, P01 Testcontainers evidence, and all P02 schemas/evidence.

# Preconditions and external prerequisites

P02 is `VERIFIED`; real PostgreSQL Testcontainers run locally/CI. No auth provider, object storage bytes, Redis, UI, or provider is required.

# Scope firewall

**Allowed:** new `packages/database/`, Drizzle config/schema/migrations/repositories, database test helpers/fixtures, and focused model/migration docs.

**Forbidden/out:** HTTP/auth middleware, S3 operations, Redis workers, clients, provider calls, production DB provisioning, generic source update/delete APIs, and team/RBAC schema.

**Extension seams:** repositories require explicit owner context and transaction interfaces; future workspace scope can be added by new ADR/migration without bypassing current ownership.

# Contracts and invariants

- SQL tables/constraints correspond to P02 runtime schemas; application parse occurs at DB boundary.
- `OwnerContext { ownerId }` is mandatory for every user-data repository method even before authentication is implemented.
- Source repositories expose create/append/finalize/read, not generic update/delete; permanent deletion uses a separate authorized repository capability introduced in P22.
- Derived records are immutable snapshots/current pointers with optimistic versions and provenance.
- Migrations are ordered, transactional where supported, backward compatible for N-1 deploy, and verified by restore rather than destructive production down-migration.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| `packages/database/src/schema/` | focused Drizzle tables/constraints/relations | Schema |
| `packages/database/drizzle/` | ordered SQL migrations and metadata | Schema |
| `packages/database/src/repositories/` | owner-ready transactional interfaces | Repository |
| `packages/database/src/client.ts` | connection/transaction boundary | Repository |
| `packages/database/test/` | real PostgreSQL migration/integrity/concurrency tests | Integrity reviewer |

# Ordered task packets

## P03-T01 - Identity, meeting, capture, and audio metadata schema

Write failing real-DB tests, then add users/external identities, meetings, participants, capture intervals, sources, chunks/manifests/assets, gaps, and markers with enums/check/range/FK/unique indexes matching P02. Test invalid language/state/time/order/checksum and duplicate chunk identity. Evidence: `evidence/P03/core-schema.json`.

## P03-T02 - Transcript, revision, speaker, translation, and completeness schema

Add source segments/events, revisions/projection pointers, speaker mappings, translations, gaps, and completeness with same-meeting/range/lineage constraints and immutable source triggers/permissions where applicable. Test cross-meeting citations/revisions and source updates. Evidence: `transcript-schema.json`.

## P03-T03 - Minutes, templates, evidence, brand, export schema

Add templates/versions, minutes documents/versions/content/sections, action items, evidence references, brand presets/assets, exports/manifests with complete provenance/version pins and optimistic current pointers. Test invalid pins, cross-meeting refs, and overwrite attempts. Evidence: `derived-schema.json`.

## P03-T04 - Jobs, outbox, idempotency, deletion, and safe audit schema

Add jobs/attempts/progress, outbox/events, idempotency records, deletion tombstones/steps, and allowlisted audit metadata with lease/dedupe/expiry indexes. This is storage shape only; processing behavior remains P06/P22. Test uniqueness, lease ranges, and prohibited content fields. Evidence: `operational-schema.json`.

## P03-T05 - Transactional owner-ready repositories

Implement focused repositories for meetings, manifests, transcript, minutes, jobs metadata, and pagination with `OwnerContext`, explicit transaction, optimistic versions, append/finalize APIs, stable cursor order, and P02 parsing. Tests cover CRUD within allowed semantics, wrong owner indistinguishability, stale version, page boundaries, and rollback. Evidence: `repository-contract.json`.

## P03-T06 - Database-enforced integrity and immutability

Add direct SQL/adversarial tests for every unique/FK/check/range/owner/source boundary, concurrent duplicate insert, raw update/delete attempt, and transaction failure. Ensure errors map to stable database categories without leaking SQL/content. Evidence: `integrity-matrix.json`.

## P03-T07 - Migration, compatibility, concurrency, and restore qualification

Test empty-to-current migration twice, N-1-to-current expand/contract compatibility, interrupted/resumed backfill pattern, concurrent writers, rollback of a failed transaction, schema drift, backup/restore of synthetic rows/constraints/counts/checksums, and clean teardown. Evidence: `migration-restore-report.json`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Core/transcript schema | T01,T02 | corresponding schema/migrations | P02 | data-model/immutability review |
| Derived/operational schema | T03,T04 | corresponding schema/migrations | P02 | provenance/content-free review |
| Repositories | T05 | repository files | schema tasks | owner/transaction review |
| Integrity qualification | T06,T07 | DB tests/evidence | all | independent migration/data-loss review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Migration interrupted | persistence | Transaction rollback or resumable explicit step | boundary migration test |
| Stale optimistic version | concurrency | Conflict and unchanged row | concurrent update test |
| Source mutation/delete | security | DB/repository reject; transaction unchanged | raw SQL negative test |
| Duplicate provider/chunk event | state | Unique/dedupe maps to canonical idempotent read | concurrent insert test |
| Restore count passes but constraints fail | persistence | Restore fails qualification | post-restore constraint suite |

# Integrated verification

Run database unit/contract tests, real PostgreSQL integration project, migration empty/N-1/restore commands, concurrency/property suite, schema drift snapshot, repository owner matrix, repository typecheck, and `pnpm verify`. Mocks cannot satisfy database acceptance.

# Acceptance gate

- [ ] P03-A01 - Empty and N-1 databases reach current schema deterministically with compatible sequencing.
- [ ] P03-A02 - All P02 source/derived/operational entities and integrity constraints exist.
- [ ] P03-A03 - Every user-data repository requires owner scope and passes two-owner/concurrency/conflict tests.
- [ ] P03-A04 - Finalized source evidence cannot be generically updated or deleted.
- [ ] P03-A05 - Synthetic backup/restore preserves rows, relations, manifests, checksums, and constraints.
- [ ] P03-A06 - Safe DB errors/logs contain no SQL secrets or meeting content.

# Migration, rollout, and rollback

Use expand/migrate/contract. Never rely on destructive down migration in production. Backfills are resumable and audit counts/IDs only.

# Required documentation updates

Data Model physical mapping, Development migration commands, Status, Traceability, Progress, and P03 evidence.

# Handoff record

Unblock P04 only; P05/P06 still require P04. Stop.
