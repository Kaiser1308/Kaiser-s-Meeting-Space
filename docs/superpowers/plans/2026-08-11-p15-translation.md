# P15 Translation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned Vietnamese-English translation pipeline that keeps source transcript immutable and distinguishes provisional realtime text from authoritative final translations.

**Architecture:** Add a provider-neutral `@kms/translation` package, then connect it to owner-scoped durable jobs and append-only translation persistence. Clients consume a single read model that always exposes source alongside provisional or final derived versions.

**Tech Stack:** TypeScript 5.9, Zod, Fastify, Drizzle/PostgreSQL, BullMQ, Vitest/fast-check, React Native, React/Electron.

## Global Constraints

- Execute only P15 and stop before P16.
- Consume P14 at `IMPLEMENTED` only under the deferred ledger; inherited rows cap P15 at `IMPLEMENTED`.
- Language is exactly `vi|en`; target is the opposite language and only `meeting_translate` creates work.
- Translation is derived/versioned and never updates source transcript rows.
- Provider credentials remain server-only; cross-provider retry is explicit and creates a new version.
- Missing provider authorization blocks live acceptance, not deterministic mock/conformance work.

## File Map

- Create `packages/translation/package.json`, `tsconfig.json`, and `src/{index,core,adapters}/` with colocated tests.
- Extend `packages/database/src/schema/transcript.ts` and `repositories/transcript.ts`; add migration `0009_translation_versions.sql` and integration tests.
- Create `packages/jobs/src/translation/handler.ts` and tests; register via `packages/jobs/src/registry.ts`.
- Create `apps/api/src/modules/translation/{dto,service,routes,index}.ts` and tests; register in `apps/api/src/app.ts`.
- Create client features under `apps/mobile/src/features/translation/` and `apps/desktop/src/features/translation/`.
- Evidence destination: `docs/execution/evidence/P15/`.

### Task 1: P15-T01 — Provider-neutral contracts

**Interfaces:** Produce `TranslationInputV1Schema`, `TranslationResultV1Schema`, `TranslationCapabilitiesSchema`, `TranslationSafeErrorSchema`, and `TranslationProvider` with `translate`, `cancel`, and `healthcheck`.

- [ ] Write failing contract tests for language pair, source projection/revision/hash, range, status, usage, cancellation, safe errors, unknown fields, and content-bearing diagnostics.
- [ ] Run `pnpm --filter @kms/translation test:unit`; initially require failure because the package/interfaces are absent.
- [ ] Add the package and strict Zod contracts; ensure provider SDK/raw response types cannot cross `src/adapters/`.
- [ ] Run package tests/typecheck and root workspace discovery checks.
- [ ] Record `translation-contract.json`; commit `feat(p15): define translation contracts`.

### Task 2: P15-T02 — Mode, language, authorization, and budget policy

**Interfaces:** Produce `authorizeTranslation(input): AuthorizedTranslationInput` before any provider call.

- [ ] Add failing policy tests for meeting-only, same/wrong language, changed post-start settings, incomplete P14 state, duplicate event, missing disclosure/budget, and two owners.
- [ ] Run the focused policy suite and capture the expected failures.
- [ ] Implement a pure policy service plus API/job guard that derives the target and pins meeting policy/completeness/source version.
- [ ] Run domain, API authorization, and jobs policy tests; assert provider fake call count stays zero on rejection.
- [ ] Record `translation-policy.json`; commit `feat(p15): enforce translation policy`.

### Task 3: P15-T03 — Deterministic mock and production adapter

**Interfaces:** Produce `DeterministicTranslationProvider` and one approved adapter implementing the same conformance suite with timeout, bounded same-provider retry, cancel, region/health, and safe errors.

- [ ] Write one reusable conformance suite covering vi→en, en→vi, timeout, rate, malformed, partial, oversized, cancel, and usage metadata.
- [ ] Run the suite against a missing adapter and verify failure.
- [ ] Implement deterministic mock fixtures and the approved adapter behind server secret references; do not hardcode a provider when approval is absent.
- [ ] Run mock conformance always; run authorized live conformance only when secret/provider prerequisites exist and report unavailable truthfully.
- [ ] Record `adapter-conformance.json`; commit `feat(p15): add translation adapters`.

### Task 4: P15-T04 — Versioned translation persistence

**Interfaces:** Produce immutable `translation_versions` plus atomic `translation_current`; retry identity is owner/meeting/source-version/provider/config/idempotency.

- [ ] Add failing schema/repository tests for source revision, duplicate retry, stale current pointer, cross-owner/meeting references, and attempted source mutation.
- [ ] Run database unit/integration tests and capture missing migration/repository behavior.
- [ ] Extend existing translation tables additively, implement repository transactions, immutability constraints/triggers, and outbox events.
- [ ] Run migration upgrade/rollback-read tests and PostgreSQL integration.
- [ ] Record `translation-lineage.json`; commit `feat(p15): persist translation lineage`.

### Task 5: P15-T05 — Realtime and final translation UX

**Interfaces:** Clients consume `TranslationReadModel` with `source`, optional `provisional`, optional `currentFinal`, status, provider disclosure, and lineage IDs.

- [ ] Write failing mobile/desktop component tests for provisional/final distinction, reconnect/out-of-order events, final replacement of provisional only, source access, delayed/partial/cancel states, vi/en copy, keyboard/screen-reader labels.
- [ ] Run focused client tests and capture intended failures.
- [ ] Implement hooks/views with explicit provisional styling/semantics and immutable final version selection; never persist provisional output as authoritative.
- [ ] Run client tests/typechecks and accessibility assertions.
- [ ] Record `translation-ui-report.json`; commit `feat(p15): present provisional and final translation`.

### Task 6: P15-T06 — Evaluation, faults, and handoff

**Interfaces:** Produce a frozen bilingual corpus manifest and scorecard for terminology, names, numbers, negation, omissions, alignment, latency, cost, outage, rate, malformed output, and cancellation.

- [ ] Add corpus validator/evaluator tests with predeclared thresholds and immutable fixture hashes under `tests/fixtures/translation-eval/`.
- [ ] Run mock/fault qualification, API/jobs/database/client regressions, secret/content scans, and package typechecks.
- [ ] Run authorized live vi→en/en→vi only when provider approval exists; never convert a missing key into a pass.
- [ ] Run `pnpm verify`, record exact results, and keep P15-A05/A06 open if live prerequisites are absent.
- [ ] Update P15 evidence/status/traceability/progress from direct results, run GitNexus change detection before commits, and stop before P16.

## Final Review Checklist

- [ ] P15-A01 through P15-A06 map to tests/evidence or explicit blockers.
- [ ] Source rows cannot be updated through translation code paths.
- [ ] Provider output is runtime validated and diagnostics are content-free.
- [ ] Realtime and final states are visibly and semantically distinct.
- [ ] Deferred rows cap lifecycle at `IMPLEMENTED`.
