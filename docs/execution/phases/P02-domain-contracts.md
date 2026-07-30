---
phase: P02
title: Canonical runtime domain contracts and state machine
packet_status: ACCEPTED
depends_on: [P01]
requirements: [FR-1, FR-2, FR-3, FR-4, FR-5, ADR-001, ADR-002, ADR-004]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

`@kms/domain` is the runtime-validated single source for personal meeting, capture, source/derived artifact, job, error, command/event, and state semantics. All legal/illegal transitions and integrity boundaries are exhaustively tested; prototype names cannot silently diverge.

# Authoritative context

Read PRD, User Flows, Data Model, API Contracts, System Architecture, Glossary, ADR-001/002/004/005/006, P00 capture profile, and P01 test evidence.

# Preconditions and external prerequisites

P01 is `VERIFIED`. No database, HTTP, UI, native audio, or provider account is needed. If authoritative docs conflict, stop the affected task for an ADR/doc correction within P02 only when contract clarification is in scope.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P01        | Verified outputs and invariants consumed by this packet. | `../evidence/P01/EVIDENCE.md` | VERIFIED          |

# Scope firewall

**Allowed:** focused files under `packages/domain/src/`, domain fixtures/tests, package exports, and contract documentation.

**Forbidden/out:** persistence, API routes, provider SDKs, client UI, capture implementation, broad generated API clients, and future team/RBAC entities.

**Extension seams:** discriminated/versioned envelopes and capability types permit additive states/providers without untyped switches.

# Contracts and invariants

- `MeetingLanguage = "vi" | "en"`; `MeetingMode = "meeting_only" | "meeting_translate"`; translation target is derived.
- Meeting states cover draft/checking/recording/paused/recovery/finalizing/processing/partial/ready/deleted semantics exactly once.
- Integer milliseconds, RFC3339 UTC persistence timestamps, and monotonic capture ranges have distinct branded schemas.
- Final source audio/transcript objects have append/finalize APIs but no generic update API; revisions and derived artifacts are versioned.
- Commands/events use versioned envelopes, stable IDs, optimistic version, idempotency/dedupe metadata, actor/owner context, and safe error catalog.

# File and ownership map

| Path                              | Responsibility                                           | Owner           |
| --------------------------------- | -------------------------------------------------------- | --------------- |
| `packages/domain/src/meeting/`    | settings, states, commands, state machine                | Meeting/capture |
| `packages/domain/src/audio/`      | sources, chunks, manifests, intervals, gaps              | Meeting/capture |
| `packages/domain/src/transcript/` | segments, revisions, speakers, projections, completeness | Transcript      |
| `packages/domain/src/minutes/`    | templates, minutes, citations, brand/export              | Minutes         |
| `packages/domain/src/jobs/`       | job/event/envelope metadata                              | State/error     |
| `packages/domain/src/errors/`     | stable provider-neutral errors                           | State/error     |
| `packages/domain/src/index.ts`    | reviewed public exports only                             | Main agent      |

# Ordered task packets

## P02-T01 - Meeting and capture schemas

Write Zod/fixture/property tests for language/mode/settings/sources, chunk IDs/order/formats/checksums, pause/gap/monotonic ranges, capture profile, manifest versions, invalid units/ranges, and unknown fields/versions. Implement schemas and inferred branded types in meeting/audio modules. Evidence: `evidence/P02/capture-contract.json`.

## P02-T02 - Transcript, translation, evidence, and completeness schemas

Test source final/interim separation, immutable segment identity/sequence/time, revision ancestry, speaker mapping, translation lineage, evidence same-meeting/range rules, gaps, and completeness states. Implement runtime types without provider payload leakage. Evidence: `transcript-contract.json`.

## P02-T03 - Minutes, template, action, brand, export, and job schemas

Test version/provenance requirements, `needs_confirmation`, citation types, document/template/brand/export pins, job state/progress/attempt/cancel metadata, and invalid/unversioned derived artifacts. Implement focused modules. Evidence: `derived-contract.json`.

## P02-T04 - Pure meeting state machine

Create a complete transition table and failing tests for every command/state pair, optimistic version, terminal/deletion/recovery paths, repeated idempotent commands, and unchanged input on failure. Implement a pure reducer returning transition/events or typed error. Property tests prove no undocumented transition. Evidence: `state-machine-report.json`.

## P02-T05 - Stable error catalog

Define codes with HTTP/category/retryability/public localization key/safe details schema; map illegal transition, validation, conflict, auth, storage, provider, rate, resource, and unsupported version failures. Tests reject duplicate codes, raw provider bodies, content/secret fields, and non-exhaustive switches. Evidence: `error-catalog.json`.

## P02-T06 - Versioned command and event envelopes

Define `CommandEnvelopeV1` and `DomainEventEnvelopeV1` with message/correlation/causation/owner/entity/version/idempotency/timestamp metadata. Test serialization round-trip, unknown version, duplicate/dedupe equality, clock/unit separation, and TS exhaustiveness. Evidence: `envelope-contract.json`.

## P02-T07 - Public surface, migration fixtures, and exhaustive regression

Replace conflicting prototype enums/imports with canonical exports without implementing behavior. Add valid/invalid fixture corpus, compile-time assertions, schema snapshots, property/mutation coverage, and consumer typecheck. Search maintained code for deprecated names. Evidence: `domain-migration-report.md`.

# Subagent work packages

| Package            | Tasks   | Exclusive paths                    | Depends on | Review gate                      |
| ------------------ | ------- | ---------------------------------- | ---------- | -------------------------------- |
| Meeting/capture    | T01,T04 | meeting/audio/state tests          | P01        | invariant/state coverage         |
| Transcript/derived | T02,T03 | transcript/minutes schemas         | P01        | immutability/lineage review      |
| Errors/envelopes   | T05,T06 | errors/jobs/events                 | P01        | version/redaction review         |
| Main integration   | T07     | package exports/consumer migration | all        | public API/exhaustiveness review |

# Failure and debugging matrix

| Failure                         | Classification | Expected behavior                                                                      | Recovery/regression        |
| ------------------------------- | -------------- | -------------------------------------------------------------------------------------- | -------------------------- |
| Unknown schema/envelope version | contract       | Stable unsupported-version error; no partial parse                                     | version fixture            |
| Illegal transition              | state          | Pure typed failure, no mutation/event                                                  | full state-command table   |
| Cross-meeting/invalid evidence  | security       | Reject before persistence/provider use                                                 | adversarial evidence tests |
| Duplicate event/idempotency     | state          | Deterministic dedupe identity                                                          | property/replay tests      |
| Prototype consumer breaks       | contract       | Explicit compile-time migration, no compatibility alias that preserves wrong semantics | consumer typecheck         |

# Integrated verification

Run domain unit/property/mutation coverage, contract fixture snapshots, repository typecheck, consumer contract tests, deprecated-name search, and `pnpm verify`. State/integrity validators require 100% branches and every intended suite must run tests.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P02/EVIDENCE.md` |

# Acceptance gate

- [ ] P02-A01 - Runtime schemas and inferred types are the single reviewed public source.
- [ ] P02-A02 - Every documented legal/illegal transition and recovery/idempotency path is tested.
- [ ] P02-A03 - Immutable source and versioned derived boundaries are mechanically represented.
- [ ] P02-A04 - Error/envelope/version contracts are exhaustive, safe, and provider-neutral.
- [ ] P02-A05 - State/integrity validators meet 100% branch coverage with property/mutation evidence.
- [ ] P02-A06 - All current consumers typecheck against canonical names; conflicting public prototype types are absent.

# Migration, rollout, and rollback

Breaking prototype types are allowed before release but require explicit migration notes. Do not retain ambiguous aliases. Schema versions are additive or rejected explicitly.

# Required documentation updates

Data Model, API Contracts, Glossary, current capability status, traceability/progress, and P02 evidence.

# Conversation boundary

Domain contracts only. Do not implement database, HTTP routes, client UI, native capture, or provider SDK behavior. Stop before P03.

# Handoff record

Unblock P03 only (P07 still awaits P05) and stop.
