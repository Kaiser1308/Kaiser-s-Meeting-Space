---
phase: P17
title: Capability-based generative AI platform and validation boundary
status: NOT_STARTED
depends_on: [P06, P14, P16]
requirements: [FR-5, ADR-003, NFR-Security, NFR-Privacy]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Generative work runs as owner-scoped durable jobs through capability-based server-only adapters with explicit provider/model policy, budgets/cancellation, immutable prompt/schema/config registry, strict structured-output and citation validation, and versioned drafts. Provider failure or malformed output cannot publish or change meeting evidence.

# Authoritative context

Read AI/Speech Providers generative/routing/validation/evaluation/privacy, Security secure AI handling, API jobs/minutes/providers, ADR-002/003/005, P06/P14/P16 evidence, and current `packages/ai` prototype as non-authoritative migration input.

# Preconditions and external prerequisites

P06/P14/P16 are `VERIFIED`; P00-approved first generative provider, secret/region/retention/training policy, model allowlist, cost/concurrency caps, and synthetic structured-output fixtures are available. Live provider acceptance requires authorized access.

# Scope firewall

**Allowed:** rewrite `packages/ai/` into core/provider adapters, provider registry/config, AI workers/API, schema/repair/citation validation, prompt registry, usage policy, conformance/security/fault tests.

**Forbidden/out:** five minutes templates/evaluation (P18), editor/export, client keys, autonomous tools/actions, source mutation, automatic cross-provider fallback, unvalidated JSON/text publication, and provider SDK types outside adapters.

**Extension seams:** providers register capabilities/adapters; domain/job code selects by policy without provider switch statements.

# Contracts and invariants

- Registry exposes configured/healthy capability, structured output, context/output limits, residency/training disclosure, cost units, model lifecycle; never credentials.
- Normalized request pins owner/meeting, transcript projection/completeness, task/schema/prompt/config versions, provider/model, budget, idempotency, and cancellation.
- Adapter returns unknown structured output + usage/provider metadata or safe error; validation boundary owns parsing/repair/schema/citation.
- Every evidence ref resolves same meeting/projection/segment/time and optional quote hash; invalid reference prevents advancement.
- Prompt/schema/config artifacts are immutable/versioned/hash-addressed; cross-provider regeneration is explicit new job/version/disclosure.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| `packages/ai/src/core/` | capabilities/registry/request/result/conformance | AI core |
| provider adapter directory | SDK/secret/request/response isolation | Adapter |
| `packages/ai/src/validation/` | parse/repair/schema/citation | Validation |
| AI worker/API/provider modules | durable job/policy/usage/version | Orchestration |
| prompt/schema/config registry | immutable artifacts/hashes | Validation |
| AI security/conformance tests | fuzz/fault/secret/IDOR/live | Independent reviewer |

# Ordered task packets

## P17-T01 - Capability registry and model lifecycle

Define/runtime-test provider/model/capability/residency/retention/training/context/structured/cost/health config and explicit selection policy. Reject unconfigured/deprecated/unapproved combinations before data leaves service. Evidence: `evidence/P17/provider-registry.json`.

## P17-T02 - Normalized adapter contracts and conformance

Define request/result/usage/error/cancel/health interfaces plus deterministic conformance tests for valid/malformed/rate/timeout/partial/cancel/oversized outputs. Compile-time and runtime tests ensure SDK types/raw bodies cannot escape. Evidence: `ai-conformance.json`.

## P17-T03 - Deterministic mock and first production adapter

Replace prototype with deterministic structured mock and approved production adapter using secret references, timeouts, bounded same-provider retry, cancellation, structured mode where supported, and safe errors. Run mock/live conformance. Evidence: `provider-adapter-report.json`.

## P17-T04 - Durable owner-scoped AI orchestration

Register job type/handler/API with P06 idempotency, owner/projection/completeness/provider policy, budget estimate/enforcement, concurrency, cancel, retry, and guarded result commit. Test duplicate/late/cancel/crash/two-user/budget and source unchanged. Evidence: `ai-job-report.json`.

## P17-T05 - Strict structured output and bounded repair

Create versioned JSON schemas and parser/normalizer/repair loop with fixed max attempts, size/depth limits, escaped rendering, and no unsafe casts. Fuzz malformed JSON/prototype pollution/instruction-like strings/oversize and prove invalid output never publishes. Evidence: `structured-validation.json`.

## P17-T06 - Same-meeting citation validator

Validate projection/version, segment identity, source/current policy, time range, quote hash, gap/interim/deleted derived target, and owner/meeting scope. Property/adversarial tests cover cross-meeting, stale revision, boundary/overlap, missing audio. Evidence: `citation-validator.json`.

## P17-T07 - Immutable prompt/schema/config/provenance registry

Implement reviewed artifacts with semantic version/hash, compatibility, activation/rollback, provider/model parameters and output draft provenance. Test mutation/hash mismatch/unknown version/concurrent activation and historical resolution. Evidence: `prompt-registry.json`.

## P17-T08 - Explicit provider switch and security/fault qualification

Implement explicit retry-with-provider as new job/version with disclosure/budget, then run outage/rate/malformed/secret injection/cancel/replay/IDOR/bundle/log scans on mock/live provider. Evidence: `evidence/P17/EVIDENCE.md`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Core/adapter | T01-T03 | AI core/provider | P06 | capability/secret review |
| Orchestration | T04,T08 API/job | worker/API | T01-T03 | auth/idempotency/budget review |
| Validation/registry | T05-T07 | validation/prompts/schemas | P14,P16 | injection/citation/provenance review |
| Independent security/live | T08 tests | tests/evidence | all | red-team/provider review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Malformed output | provider | Validation failure; never publish | fuzz/live fixture |
| Provider outage/rate | provider | Bounded retry/delayed; source unaffected | fault test |
| Invalid citation | security | Reject or typed needs-confirmation only per downstream schema | property test |
| Provider switch | state | New explicit version/job/disclosure; old remains | switch test |
| Budget exceeded | state | Stop before call or safely cancel; no hidden spend | budget test |

# Integrated verification

Run registry/conformance/mock/live adapter, durable job retry/cancel/crash/auth, structured parser fuzz, citation property/security, registry provenance, secret/content/bundle/log scan, and `pnpm verify`.

# Acceptance gate

- [ ] P17-A01 - Domain/orchestration code depends only on capability-based provider-neutral contracts.
- [ ] P17-A02 - Provider secrets/raw payloads never reach clients/domain/bundles/logs/telemetry.
- [ ] P17-A03 - Only schema-valid and citation-valid versioned drafts can advance.
- [ ] P17-A04 - Provider/model/prompt/schema/config changes create explicit immutable provenance and rollback path.
- [ ] P17-A05 - AI retries/cancel/failure/budget cannot alter meeting evidence/finalization/current transcript.
- [ ] P17-A06 - Owner/provider disclosure/region/retention/two-user controls and live conformance pass.

# Migration, rollout, and rollback

Mock in CI; one allowlisted staging provider. Kill switch stops new calls/jobs and retains drafts. Historical prompt/schema/provider versions remain resolvable.

# Required documentation updates

AI/provider architecture, API provider/job contracts, Security processor registry, Operations budgets/kill switch, Status/Traceability/Progress, and P17 evidence.

# Handoff record

Unblock P18 only.
