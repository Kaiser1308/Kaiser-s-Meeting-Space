---
phase: P18
title: Detailed evidence-linked minutes and fixed evaluation gates
packet_status: ACCEPTED
depends_on: [P17]
requirements: [FR-5, NFR-Reliability, NFR-Privacy]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Five data-defined, independently versioned meeting templates generate immutable detailed drafts from a pinned transcript projection. Full-input coverage, citations, unsupported claims, decisions/actions/owners/dates, uncertainty, quality, cost, and latency are measured against a fixed synthetic Vietnamese/English corpus before any provider/model/prompt config can activate.

# Authoritative context

Read PRD FR-5 and five personal templates, User Flows Create Minutes, AI/Speech validation/evaluation, Data Model Minutes/Evidence, P14 completeness, P16 projection, P17 provider/validation/provenance evidence, and Test Strategy scenarios 11-12.

# Preconditions and external prerequisites

P17 is `VERIFIED`; approved provider/model access, fixed synthetic/consented vi/en corpus, human evaluation rubric/reviewer, and budget are available. Thresholds must be recorded before tuning. Missing real provider or reviewer blocks live quality acceptance.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P17        | Verified outputs and invariants consumed by this packet. | `../evidence/P17/EVIDENCE.md` | VERIFIED          |

# Scope firewall

**Allowed:** `packages/minutes/` template/output/context/evaluation modules, immutable draft lifecycle/API/jobs, prompt/schema artifacts under P17 registry, synthetic corpus/scorecards.

**Forbidden/out:** rich editor, branding/export, automatic publication, real meeting corpus, executive summary as replacement, guessing uncertain owners/dates/decisions, and tuning on release test answers without versioned train/eval separation.

**Extension seams:** templates are data/schema driven; evaluation metrics accept new templates/providers without altering source contracts.

# Contracts and invariants

- Template IDs: team, one_to_one, direct_report, leadership, recurring_review; each pins schema/prompt/rubric version.
- Output includes context, chronological/topic discussion, viewpoints/proposals/agreements/unresolved items, decisions, actions/owners/dates, risks/follow-ups, citations, and `needs_confirmation`.
- Draft pins meeting, P16 projection, P14 completeness, template/detail/output language, provider/model/prompt/schema/config, input hash, usage, evaluation result.
- Context assembly accounts for every eligible segment/range; chunk/map/reconcile preserves segment boundaries/overlap metadata and reports omissions.
- Unsupported material claim/broken citation is a release failure; unknown owner/date/decision stays unknown.

# File and ownership map

| Path                               | Responsibility                          | Owner      |
| ---------------------------------- | --------------------------------------- | ---------- |
| `packages/minutes/src/templates/`  | five schemas/configs/rubrics            | Templates  |
| `packages/minutes/src/context/`    | projection assembly/chunk-map-reconcile | Pipeline   |
| `packages/minutes/src/evaluation/` | deterministic metrics/scorecards        | Evaluation |
| API/worker minutes modules         | request/job/draft versions/provenance   | Pipeline   |
| `tests/fixtures/minutes-eval/`     | frozen vi/en corpus/expected facts      | Evaluation |

# Ordered task packets

## P18-T01 - Five versioned data-driven templates

Define template metadata, required/optional sections, detail levels, output language, fields, evidence/confirmation rules, prompt/schema/rubric refs, and migration/compatibility. Tests instantiate all five without code switches and reject duplicate/unversioned/invalid templates. Evidence: `evidence/P18/template-contract.json`.

## P18-T02 - Detailed output schema and claim semantics

Define runtime schema for comprehensive discussion/decision/action/risk/follow-up/evidence/uncertainty and conversion to future editor document. Tests reject missing provenance, invented required owner/date, broken citation shapes, duplicate IDs, oversize/depth, and unsupported section content. Evidence: `minutes-output-schema.json`.

## P18-T03 - Fixed synthetic bilingual evaluation corpus

Create versioned vi/en meetings covering long discussion, disagreement, corrections, ambiguous owners/dates, names/numbers, pauses/gaps, multi-speaker, incomplete transcript, and adversarial instructions. Corpus validation tests require immutable hashes, expected topics/actions/decisions/unsupported traps/evidence ranges, consent-safe metadata, and separate tuning/holdout sets. Evidence: `corpus-manifest.json`.

## P18-T04 - Full-projection context assembly

Implement token estimation, direct full input when possible, deterministic chunk boundaries/overlap, map results, global reconcile, source ordering, and coverage ledger. Test context limit boundaries, empty/gap/large segments, lost/duplicate chunk, cancellation, and replay. Evidence: `context-coverage.json`.

## P18-T05 - Immutable draft generation lifecycle

Implement owner-authorized request/job/draft version/current selection with P14 completeness policy, P16 projection pin, P17 validation/provenance/budget/cancel, and no overwrite. Test repeated/regenerate/provider switch/partial approval/late result/two-user. Evidence: `draft-lifecycle.json`.

## P18-T06 - Deterministic coverage/factuality/citation metrics

Calculate topic/action/decision/temporal coverage, unsupported claim, citation validity, evidence span, confirmation precision, duplication, and completeness accounting. Freeze thresholds and test scorer against hand-authored perfect/broken outputs. Evidence: `evaluation-metrics.json`.

## P18-T07 - Uncertainty and conflict handling

Validate/route ambiguous/missing/conflicting owner/deadline/speaker/decision into `needs_confirmation` with cited alternatives where available. Adversarial tests ensure prompt/model cannot invent resolution or hide transcript gaps. Evidence: `uncertainty-report.json`.

## P18-T08 - Provider/model baseline and regression qualification

Run fixed corpus/holdout across approved configurations, record quality/coverage/factuality/citations/cost/latency/failures/human rubric, tune only versioned configs, and activate only passing config per template/language. Evidence: `evidence/P18/EVIDENCE.md` and machine scorecards.

# Subagent work packages

| Package           | Tasks       | Exclusive paths     | Depends on  | Review gate                          |
| ----------------- | ----------- | ------------------- | ----------- | ------------------------------------ |
| Templates/schema  | T01,T02     | templates/output    | P17         | requirement/schema review            |
| Corpus/evaluation | T03,T06,T07 | fixtures/evaluator  | T01,T02     | independent rubric/factuality review |
| Pipeline          | T04,T05     | context/API/worker  | T01,T02,P17 | coverage/idempotency review          |
| Baseline review   | T08         | tests/evidence only | all         | holdout/human review                 |

# Failure and debugging matrix

| Failure                    | Classification | Expected behavior                                | Recovery/regression |
| -------------------------- | -------------- | ------------------------------------------------ | ------------------- |
| Transcript incomplete      | state          | Block or prominently partial by policy/version   | incomplete corpus   |
| Context exceeds limit      | provider       | Deterministic map/reconcile with coverage ledger | limit boundary test |
| Unsupported claim/citation | security       | Validation/evaluation fails; no activation       | adversarial fixture |
| Missing owner/date         | contract       | Unknown/needs_confirmation, never guess          | rubric case         |
| Provider regression        | provider       | Config gate fails; prior version remains active  | holdout regression  |

# Integrated verification

Run template/output contracts, context property/fault, draft auth/job, evaluator unit/golden, fixed vi/en mock/live provider corpus, human holdout review, secret/content telemetry scan, cost/latency report, and `pnpm verify`.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P18/EVIDENCE.md` |

# Acceptance gate

- [ ] P18-A01 - Five templates are data-defined, independently versioned, and cover required detailed sections.
- [ ] P18-A02 - Frozen vi/en holdout meets predeclared coverage/completeness/quality thresholds.
- [ ] P18-A03 - Unsupported material claims and broken citations are zero in release corpus.
- [ ] P18-A04 - Every draft is immutable and retains complete input/template/provider/prompt/schema/config provenance.
- [ ] P18-A05 - Uncertain/conflicting owner/date/decision/speaker remains explicit and reviewable.
- [ ] P18-A06 - Provider configuration activation/rollback is gated by quality, cost, latency, and human review.

# Migration, rollout, and rollback

Activate one template/language/provider config at a time behind allowlist. Human review mandatory. Rollback selects prior config; drafts/history remain.

# Required documentation updates

PRD template details, Data Model/API draft/evaluation, AI evaluation governance, Status/Traceability/Progress, and P18 evidence.

# Conversation boundary

Do not implement rich editing, branding/export, automatic publication, real meeting corpus, guessed facts, or tune against release holdout answers. Stop before P19.

# Handoff record

Unblock P19 only.
