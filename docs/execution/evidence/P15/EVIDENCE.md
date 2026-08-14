# P15 Evidence

- Phase/state: P15 — IMPLEMENTED under the deferred end-to-end qualification policy
- Run record: `RUN-20260811-2200.md`
- Direct test matrix: 16 P15 tests across 8 files, plus 1 database schema test
- Typechecks: translation, database, jobs, API, mobile, and desktop all exit 0
- Automated quality: scoped format, lint, diff check, execution-plan validation, and migration static checks pass

## Acceptance mapping

| Acceptance | Evidence | State |
| --- | --- | --- |
| P15-A01 source is never replaced and every version has lineage | Strict input/result lineage, source hash recomputation, append-only `translation_versions`, immutable trigger, read-model tests | IMPLEMENTED |
| P15-A02 only explicit vi/en opposite direction in `meeting_translate` | Contract and policy tests reject same language, wrong target, and meeting-only mode | IMPLEMENTED |
| P15-A03 provisional and final states are distinct and accessible | Read-model ordering/promotion tests; mobile accessibility label and desktop view-model tests | IMPLEMENTED |
| P15-A04 provider/model/config/prompt/source/usage provenance | `TranslationResultV1Schema`, database columns, repository, adapter tests | IMPLEMENTED |
| P15-A05 fixed live bilingual quality/cost/latency/failure thresholds | Frozen synthetic mock corpus passes; approved live provider/key and reviewed corpus are unavailable | OPEN / DEFERRED |
| P15-A06 auth/budget/disclosure/cross-provider and leakage controls | Pre-provider policy tests, server-only secret resolver, safe error schema, no implicit fallback | IMPLEMENTED; live authorization OPEN |

## Artifacts

- `packages/translation/`: contracts, policy, adapters, read model, evaluation corpus
- `packages/database/src/schema/translation.ts`: version/current projection tables
- `packages/database/src/repositories/translation.ts`: owner/idempotent persistence
- `packages/database/drizzle/0010_translation_versions.sql`: additive migration and immutable-version trigger
- `packages/jobs/src/translation/`: authorization-first job handler
- `apps/api/src/modules/translation/`: owner-scoped source/hash-verified route/service
- `apps/mobile/src/features/translation/`: provisional/final accessible projection
- `apps/desktop/src/translation-view-model.ts`, `apps/desktop/src/TranslationPane.tsx`: source/provisional/final projection and accessible pane
- `tests/fixtures/translation-eval/manifest.json`: synthetic corpus manifest

## Qualification boundary

P15 consumes P14 at `IMPLEMENTED` under the deferred ledger and therefore cannot
be promoted to `VERIFIED`. `pnpm verify`, real PostgreSQL/Redis integration,
approved live provider calls, live quality/cost/latency, device/reader/
two-hour, and full security/resilience/performance gates remain OPEN. No real
meeting content, provider result, credential, or manual/device PASS is claimed.

### Review follow-up verification

The read-only review gaps were fixed: idempotency is checked before provider
execution; version/current-pointer persistence is transactional with stale-write
protection; source range and authorization audit fields are persisted; migration
constraints bind source segment, meeting, and owner; the compatible adapter
requires HTTPS; final promotion validates revision/range/hash/target; and the
mobile recording screen plus desktop pane expose the translation surface.
Six package/app typechecks and scoped formatting passed after these changes.
The full workspace Vitest invocation collected the P15 tests successfully; its
overall exit was nonzero only because unrelated Docker/Testcontainers, Expo path,
and workspace-alias suites failed.

P15 handoff is complete; stop before P16.

### 2026-08-12 continuation

- Re-ran the focused matrix: translation 5 files/12 tests, jobs 2/2, database
  schema 1/1, mobile 1/1, and desktop 1/1 all passed. The first local attempt
  hit sandbox access denial for the portable `C:\q3` dependency junctions;
  rerunning with workspace runtime permission passed.
- Translation, database, jobs, API, and mobile typechecks passed. Desktop's
  typecheck remains blocked by the pre-existing P16 file
  `transcript-review-view-model.ts` importing undeclared `@kms/domain`; no P16
  source was changed.
- Fixed a P15-T04 persistence defect: `confidence` and safe `error` were in
  `TranslationResultV1` but were dropped by PostgreSQL storage/read mapping.
  Added bounded storage/mapping and migration fields. Database typecheck,
  schema test, job regression, execution-plan validation, formatting, and
  `git diff --check` passed.
- Independent review residuals remain OPEN: projection/revision verification,
  atomic pre-provider idempotency, durable-job route execution, production
  provider authorization, legacy persistence bypass, cancellation/cost
  reporting, and provisional event identity. These prevent VERIFIED; mock
  tests are not live-provider evidence.
- P15 remains `IMPLEMENTED`; approved provider/key, live quality/cost/latency,
  real-service integration, full E2E/device, and inherited deferred rows remain
  OPEN.
