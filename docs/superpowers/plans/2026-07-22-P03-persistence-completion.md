# P03 Persistence Phase — Completion Plan (T02–T07)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete remaining P03 tasks (T02–T07) to reach IMPLEMENTED state with all schema, repositories, integrity, and migration tests passing against real PostgreSQL.

**Architecture:** T01 scaffolding is complete (32/32 tests, 9 tables, 0000 migration). T02/T03/T04 add remaining schema files with disjoint ownership; T05 builds repositories on all schemas; T06 adds adversarial integrity tests; T07 qualifies migration/restore.

**Tech Stack:** Drizzle ORM 0.45.2, drizzle-kit 0.31.10, postgres (postgresjs) 3.4.9, Testcontainers 10.28.0, PostgreSQL 17-alpine, Vitest 4.1.10, TypeScript 5.9.x, Zod (from @kms/domain), Node v24.18.0, pnpm 10.14.0

## Global Constraints

- DESIGN.md at `packages/database/DESIGN.md` is the authoritative spec — every table, enum, constraint, trigger, repository method, and test scenario is specified there
- All pgEnums must be defined from P02 imports (no duplicated literals) — per DESIGN §1.4
- All user-data tables must have `owner_id text NOT NULL` with index — per DESIGN §4 convention
- `toDomain` parses every DB row through the corresponding P02 Zod schema before returning — per DESIGN §5.2
- DB triggers use custom SQLSTATE `P0311` for immutability violations — per DESIGN §6.1
- `mapDbError` strips message/detail/hint/where before logging — per DESIGN §5.2 / P03-A06
- No content/credentials in logs, errors, or test fixtures — per P03-A06 / global invariant
- Tests use real PostgreSQL (Testcontainers); mocks cannot satisfy acceptance — per packet
- Coverage thresholds start at 0 for @kms/database (ratchet later) — per DESIGN §10.5

---
