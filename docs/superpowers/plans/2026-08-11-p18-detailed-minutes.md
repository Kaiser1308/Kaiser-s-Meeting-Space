# P18 Detailed Minutes and Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate immutable, evidence-linked detailed minutes for five versioned templates and gate configuration activation with a frozen bilingual evaluation corpus.

**Architecture:** Create a focused `@kms/minutes` package containing data-defined templates, strict output contracts, deterministic context assembly, and evaluation metrics. API/jobs pin P16 projection and P17 artifact versions; generation stores immutable drafts only after structure and citations validate.

**Tech Stack:** TypeScript/Zod, Vitest/fast-check, Fastify, Drizzle/PostgreSQL, BullMQ, `@kms/ai`, synthetic vi/en fixtures.

## Global Constraints

- Execute only P18 and stop before P19.
- Consume P17 at `IMPLEMENTED` through the deferred ledger; live provider/human-review requirements remain explicit gates.
- Template IDs are exactly `team|one_to_one|direct_report|leadership|recurring_review`.
- Unknown owner/date/decision/speaker remains `needs_confirmation`; generation may not guess.
- Unsupported material claims or broken citations prevent activation/publication.
- Evaluation holdout answers are immutable and separated from tuning fixtures; never use real meeting content.

## File Map

- Create `packages/minutes/package.json`, `tsconfig.json`, and `src/{templates,output,context,evaluation,index}/` with tests.
- Extend `packages/database/src/schema/minutes.ts` and `repositories/minutes.ts`; add migration `0012_minutes_drafts.sql` and integration tests.
- Create `packages/jobs/src/minutes/{handler,policy}.ts` and tests.
- Create `apps/api/src/modules/minutes/{dto,service,routes,index}.ts` and tests, replacing only prototype routes inside P18 scope.
- Create frozen fixtures under `tests/fixtures/minutes-eval/{manifest,vi,en}/`.
- Evidence destination: `docs/execution/evidence/P18/`.

### Task 1: P18-T01 — Five versioned templates

**Interfaces:** Produce `MinutesTemplateDefinitionV1`, `TemplateRegistry`, and data records for all five IDs with schema/prompt/rubric refs.

- [ ] Write failing tests that enumerate exactly five templates, instantiate each without code switches, and reject duplicate IDs, missing versions, invalid sections, unsupported language/detail, or unresolved artifact refs.
- [ ] Run `pnpm --filter @kms/minutes test:unit`; initially require failure because the package/registry is absent.
- [ ] Implement data-only definitions, compatibility rules, and registry lookup; avoid template-specific branching in pipeline code.
- [ ] Run package tests/typecheck and snapshot the normalized definitions.
- [ ] Record `template-contract.json`; commit `feat(p18): define minutes templates`.

### Task 2: P18-T02 — Detailed output and claim semantics

**Interfaces:** Produce `DetailedMinutesDraftV1Schema` with context, discussion, proposals, agreements, unresolved items, decisions, actions, risks, follow-ups, citations, and confirmation markers.

- [ ] Add failing schema/fuzz tests for missing provenance, duplicate IDs, invented required owner/date, broken citation shape, unsupported section data, unsafe strings, excessive size/depth, and editor-conversion round trip.
- [ ] Run the focused output suite and capture intended failures.
- [ ] Implement strict Zod schemas and stable IDs with a deterministic conversion seam for P19 `MinutesDocumentV1`.
- [ ] Run output tests, P17 validation/citation regressions, and typecheck.
- [ ] Record `minutes-output-schema.json`; commit `feat(p18): define detailed minutes output`.

### Task 3: P18-T03 — Frozen bilingual corpus

**Interfaces:** Produce a hash-addressed corpus manifest with tuning and holdout partitions, expected topics/actions/decisions/traps/evidence ranges, and consent-safe metadata.

- [ ] Write failing corpus-validator tests for missing hashes, duplicate cases, partition leakage, absent expected facts/ranges, unapproved metadata, and mutated fixtures.
- [ ] Run the validator before fixtures exist and capture failure.
- [ ] Add synthetic vi/en cases covering long discussion, disagreement, corrections, ambiguity, names/numbers, gaps, multiple speakers, incomplete transcript, and adversarial instructions.
- [ ] Run validation twice and confirm stable hashes; do not expose holdout answers to runtime prompts.
- [ ] Record `corpus-manifest.json`; commit `test(p18): freeze bilingual minutes corpus`.

### Task 4: P18-T04 — Full-projection context assembly

**Interfaces:** Produce `assembleMinutesContext(projection, limits): ContextPlan` with direct-full or deterministic chunk/map/reconcile plan and a coverage ledger.

- [ ] Add failing property tests for exact context boundaries, empty/gap/large segments, deterministic overlap, lost/duplicate chunk, cancellation, shuffled reads, and replay.
- [ ] Run context tests and confirm accounting failures.
- [ ] Implement token estimation, segment-preserving chunks, stable overlap, map IDs, global reconcile inputs, and exact eligible-range accounting.
- [ ] Run seeded property tests and assert every eligible segment appears once in direct input or coverage ledger.
- [ ] Record `context-coverage.json`; commit `feat(p18): assemble complete minutes context`.

### Task 5: P18-T05 — Immutable draft lifecycle

**Interfaces:** Produce owner-authorized request/job/draft/current operations pinned to P14 completeness, P16 projection, template/detail/language, and P17 provenance/budget.

- [ ] Add failing API/jobs/database tests for repeat/regenerate, provider switch, incomplete approval, late result, cancellation, stale projection, two owners, and attempted overwrite.
- [ ] Run focused suites and capture missing durable behavior.
- [ ] Extend schema/repository/migration, implement job/API orchestration, validate output/citations before immutable insert, and atomically select current draft.
- [ ] Run PostgreSQL/Redis integration, authorization, idempotency, and source-mutation-negative tests.
- [ ] Record `draft-lifecycle.json`; commit `feat(p18): persist immutable minutes drafts`.

### Task 6: P18-T06 — Deterministic evaluation metrics

**Interfaces:** Produce scorer metrics for topic/action/decision/temporal coverage, unsupported claims, citation validity/span, confirmation precision, duplication, and completeness accounting.

- [ ] Write golden scorer tests using hand-authored perfect, omitted, duplicated, unsupported, and broken-citation outputs; record numeric thresholds before tuning.
- [ ] Run scorer tests and confirm the missing evaluator fails.
- [ ] Implement deterministic metrics with machine-readable per-case and aggregate scorecards.
- [ ] Run evaluator twice on the same inputs and compare stable results.
- [ ] Record `evaluation-metrics.json`; commit `feat(p18): score minutes quality`.

### Task 7: P18-T07 — Uncertainty and conflicts

**Interfaces:** Produce validation that routes ambiguous/missing/conflicting owner, deadline, speaker, and decision to cited `needs_confirmation` alternatives.

- [ ] Add failing adversarial cases where prompts/outputs invent resolution, suppress a gap, select one disagreement silently, or omit confirmation.
- [ ] Run focused uncertainty tests and capture acceptance gaps.
- [ ] Implement post-validation rules and typed rejection/confirmation results using P16 disagreement/gap evidence.
- [ ] Run output, citation, evaluator, and adversarial regressions.
- [ ] Record `uncertainty-report.json`; commit `feat(p18): preserve minutes uncertainty`.

### Task 8: P18-T08 — Baseline qualification and handoff

**Interfaces:** Produce per-template/language/provider/model/config scorecards and activation records; only passing reviewed configurations can become active.

- [ ] Run mock corpus and fault suites, then authorized provider configurations against tuning and holdout partitions with quality/citation/cost/latency/failure metrics.
- [ ] Obtain independent human rubric evidence where available; a missing provider/reviewer remains an explicit blocker.
- [ ] Run API/jobs/database/AI regressions, secret/content scans, and `pnpm verify`.
- [ ] Map P18-A01 through P18-A06; activate no configuration with unsupported material claims or broken citations.
- [ ] Update evidence/status/traceability/progress, run GitNexus change detection, and stop before P19.

## Final Review Checklist

- [ ] All five templates are data-defined and independently versioned.
- [ ] Full-input coverage is explicitly accounted for.
- [ ] Drafts and configuration activation retain complete provenance.
- [ ] Unknown facts remain confirmation items.
- [ ] Holdout/provider/human gates are truthful and inherited rows cap verification.
