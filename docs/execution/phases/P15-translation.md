---
phase: P15
title: Versioned Vietnamese-English translation pipeline
status: NOT_STARTED
depends_on: [P14]
requirements: [FR-3, ADR-003, ADR-004]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Meetings explicitly started in translation mode produce Vietnamese-to-English or English-to-Vietnamese derived segments with provider/model/config provenance, visibly distinct ephemeral realtime and authoritative final states, fixed-corpus quality/cost/latency evidence, and no mutation/replacement of source transcript.

# Authoritative context

Read PRD FR-1/FR-3, User Flows live/completion, AI/Speech Providers translation policy, ADR-003/004, P02 language/mode/translation contracts, and P14 completeness/source projection evidence.

# Preconditions and external prerequisites

P14 is `VERIFIED`; P00-approved first production translation provider, region/retention disclosure, server secret, budget, and fixed synthetic vi/en evaluation corpus are available. If provider approval/key is absent, mock/conformance work may complete but live quality acceptance remains blocked.

# Scope firewall

**Allowed:** `packages/translation/`, translation jobs/adapter/persistence/API, mobile/desktop source+translation display, evaluation fixtures/reports.

**Forbidden/out:** auto/mixed-language detection, arbitrary language pairs, source transcript changes, minutes, client provider keys, implicit cross-provider fallback, and treating realtime translation as authoritative.

**Extension seams:** capability-based `TranslationProvider` and versioned projection support future providers without changing domain lineage.

# Contracts and invariants

- Source language is fixed meeting `vi|en`; target is exactly the other; only `meeting_translate` creates work.
- `TranslationInputV1` pins source segment/projection/revision, text hash, languages, provider policy, and idempotency.
- `TranslationVersionV1` records provider/model/config/prompt-if-LLM, source version/hash, status, usage, timestamps, and derived text.
- Source revisions create new eligible translation versions; older versions remain queryable.
- Failure/delay/cancel never changes recording/finalization/source completeness.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| `packages/translation/src/core/` | capability/input/output/errors/conformance | Contract |
| provider adapter directory | production provider isolation | Adapter |
| worker/API/persistence translation modules | jobs/versioned storage/current projection | Pipeline |
| mobile/desktop translation views | ephemeral/final/source separation | Client |
| translation evaluation tests | bilingual fixed corpus/fault/cost/latency | Independent reviewer |

# Ordered task packets

## P15-T01 - Provider-neutral translation contracts

Add runtime and adapter conformance tests for language pair, segment/range/source hash, output/usage/confidence/status/cancel/safe errors/capabilities. Reject same/unknown language, raw SDK types, unversioned output, and content-bearing diagnostics. Evidence: `evidence/P15/translation-contract.json`.

## P15-T02 - Mode/language/downstream policy enforcement

Enforce work creation only for `meeting_translate`, derived opposite target, P14 allowed completeness, owner/provider disclosure/budget, and idempotency. Test meeting-only, wrong pair, changed settings after start, incomplete policy, duplicate event, and two users before provider call. Evidence: `translation-policy.json`.

## P15-T03 - Deterministic mock and first production adapter

Implement deterministic CI mock plus approved provider with server-only secret, timeout/retry/rate/cancel, capability/region/health, response validation, and safe error mapping. Contract fixtures plus authorized live tests cover vi->en/en->vi. Evidence: `adapter-conformance.json`.

## P15-T04 - Versioned derived persistence and projection

Persist translation versions linked to exact source/projection/revision/hash and provider/config; atomically select current version without overwriting history. Test source revision, duplicate/retry, stale current pointer, cross-meeting/owner, and source update attempts. Evidence: `translation-lineage.json`.

## P15-T05 - Ephemeral realtime and authoritative final UX

Display realtime translation as provisional and non-persistent/replaceable, final generation after P14 as authoritative derived version, with delayed/partial/cancel/provider disclosure and source always accessible. Test reconnect/out-of-order/revision/failure/a11y. Evidence: `translation-ui-report.json`.

## P15-T06 - Bilingual evaluation and fault qualification

Freeze thresholds before tuning for terminology, names, numbers, negation, omissions, segment alignment, latency, cost, and unsupported change; run fixed corpus against mock/live provider and outage/rate/malformed/cancel. Evidence: `evidence/P15/EVIDENCE.md` plus scorecard.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Contract/adapter | T01,T03 | translation core/adapter | P14 | provider/secret review |
| Policy/persistence | T02,T04 | worker/API/DB | T01 | auth/lineage review |
| Client/evaluation | T05,T06 | views/tests/evidence | T02-T04 | bilingual/UX review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Provider fails | provider | Source continues; delayed/retry/cancel visible | outage test |
| Source revised | state | Old translation retained; new version eligible/current | lineage test |
| Wrong language/mode | contract | Reject before provider | policy matrix |
| Names/numbers/negation altered | provider | Evaluation gate fails or visible review status | corpus regression |
| Cross-provider retry | security | Explicit new job/version/disclosure only | policy test |

# Integrated verification

Run translation contract/adapter, policy/auth, persistence lineage, worker retry/cancel, client UI/a11y, fixed bilingual mock/live evaluation, secret/content scans, and `pnpm verify`.

# Acceptance gate

- [ ] P15-A01 - Translation never replaces/mutates source transcript and every version has complete lineage.
- [ ] P15-A02 - Only the explicit `vi`/`en` opposite direction in translation mode is processed.
- [ ] P15-A03 - Realtime and final translation states are visually/semantically distinct and accessible.
- [ ] P15-A04 - Every output records provider/model/config/prompt-if-applicable/source version/usage.
- [ ] P15-A05 - Fixed live bilingual quality/cost/latency/failure thresholds pass or exact external blocker is recorded.
- [ ] P15-A06 - Auth/budget/disclosure/cross-provider rules pass without secret/content leakage.

# Migration, rollout, and rollback

Enable by account/provider allowlist and budget. Rollback stops new translation jobs and preserves all versions/source. No cloud fallback from a local policy without explicit action.

# Required documentation updates

Provider capabilities/disclosure, Data Model/API translation versioning, User Flows states, Status/Traceability/Progress, and P15 evidence.

# Handoff record

Unblock P16 only.
