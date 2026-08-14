# P17 Generative AI Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI prototype with a capability-based, owner-scoped, budgeted, schema/citation-validating platform that cannot mutate meeting evidence.

**Architecture:** Split `@kms/ai` into provider-neutral core, isolated adapters, validation, and immutable artifact registries. P06 durable jobs own retries/cancellation; only validated versioned drafts cross from adapters into downstream storage.

**Tech Stack:** TypeScript/Zod, Fastify, Drizzle/PostgreSQL, BullMQ, Vitest/fast-check, server-side provider SDK or fetch adapter selected after approval.

## Global Constraints

- Execute only P17 and stop before P18.
- Consume P14/P16 at `IMPLEMENTED` only through the deferred ledger; provider authorization is never deferred.
- Domain/jobs/API code imports no provider SDK/raw payload type.
- Secrets remain server-side references and never enter clients, bundles, logs, telemetry, or database plaintext.
- Invalid schema/citation output never publishes; cross-provider retry is explicit new work/version.
- Generative jobs cannot update source audio, raw transcript, finalization, or current transcript evidence.

## File Map

- Replace `packages/ai/src/index.ts` with focused exports from `src/core/`, `src/adapters/`, `src/validation/`, and `src/registry/`; retain compatibility only where tests prove required.
- Create `packages/database/src/schema/ai.ts`, repository `repositories/ai.ts`, migration `0011_ai_platform.sql`, and tests.
- Create `packages/jobs/src/ai/{handler,policy}.ts` and tests; register in job registry.
- Create `apps/api/src/modules/ai/{dto,service,routes,index}.ts` and tests; extend safe provider/job routes.
- Store reviewed artifacts under `packages/ai/src/artifacts/{prompts,schemas,configs}/` with a generated hash manifest.
- Evidence destination: `docs/execution/evidence/P17/`.

### Task 1: P17-T01 — Capability registry and model lifecycle

**Interfaces:** Produce `ProviderRegistry`, `ProviderCapabilityV1`, `ModelPolicyV1`, and `selectProvider(request): ApprovedProviderSelection`.

- [ ] Write failing tests for unconfigured, unhealthy, deprecated, wrong region/retention/training policy, unsupported structured output/context, budget, and unapproved model combinations.
- [ ] Run `pnpm --filter @kms/ai test:unit` and capture failures from the current prototype boundary.
- [ ] Implement strict runtime registry/config schemas and explicit selection policy that rejects before content leaves the service.
- [ ] Run AI tests/typecheck and safe `/providers` API contract tests.
- [ ] Record `provider-registry.json`; commit `feat(p17): add AI capability registry`.

### Task 2: P17-T02 — Normalized adapter contract and conformance

**Interfaces:** Produce `GenerativeProvider.generate(input): Promise<unknown>`, `cancel`, `healthcheck`, normalized usage, and safe errors.

- [ ] Write a reusable conformance suite for valid/malformed/rate/timeout/partial/cancel/oversized output and raw-payload rejection.
- [ ] Run it against the current `OpenAiCompatibleProvider` and confirm contract gaps fail.
- [ ] Implement core contracts and an adapter boundary whose only successful payload is `unknown` plus safe provider metadata.
- [ ] Run compile-time API checks and runtime conformance; scan imports to prove SDK types stay under adapters.
- [ ] Record `ai-conformance.json`; commit `refactor(p17): isolate AI adapters`.

### Task 3: P17-T03 — Deterministic mock and approved production adapter

**Interfaces:** Produce `DeterministicGenerativeProvider` and one approved adapter with structured mode, timeout, bounded same-provider retry, cancellation, and secret references.

- [ ] Add failing deterministic/live fixtures for success, malformed JSON, rate, timeout, cancellation, usage, and redacted errors.
- [ ] Run mock conformance before implementation and capture failure.
- [ ] Implement deterministic mock and approved adapter; if provider is not approved, implement only the generic adapter seam and record the authorization blocker.
- [ ] Run mock tests always and live tests only with authorized credentials; inspect bundles/logs for secrets/provider bodies.
- [ ] Record `provider-adapter-report.json`; commit `feat(p17): add validated AI adapters`.

### Task 4: P17-T04 — Durable owner-scoped orchestration

**Interfaces:** Produce AI job request/result persistence pinned to owner, meeting, P16 projection, P14 completeness, provider/model, prompt/schema/config, budget, idempotency, and cancellation.

- [ ] Write failing jobs/API/database tests for duplicates, late results, cancel/crash/retry, two owners, stale projection, incomplete input, and budget/concurrency limits.
- [ ] Run focused tests and confirm missing durable orchestration behavior.
- [ ] Add schema/repository/migration, job handler, and API routes; validate ownership/policy before enqueue and before guarded result commit.
- [ ] Run PostgreSQL/Redis integration, API authorization, job fault, and source-mutation-negative suites.
- [ ] Record `ai-job-report.json`; commit `feat(p17): orchestrate durable AI jobs`.

### Task 5: P17-T05 — Structured validation and bounded repair

**Interfaces:** Produce `validateStructuredOutput(unknown, artifactRef)` and bounded `repairStructuredOutput` with fixed attempts/size/depth limits.

- [ ] Add failing parser/fuzz cases for invalid JSON, duplicate/prototype keys, prototype pollution, instruction-like strings, unsafe HTML, excessive size/depth, and repeated failed repairs.
- [ ] Run focused validation tests and confirm the prototype can admit invalid output.
- [ ] Implement parse/normalize/schema validation and fixed repair loop; escape at render boundaries and return typed safe failures.
- [ ] Run fuzz/property tests with deterministic seeds and assert invalid output creates no publishable draft.
- [ ] Record `structured-validation.json`; commit `feat(p17): validate AI structured output`.

### Task 6: P17-T06 — Same-meeting citation validator

**Interfaces:** Produce `validateEvidenceRefs(refs, projection): CitationValidationResult` checking owner, meeting, projection/version, segment, time range, quote hash, gap/interim/deleted target.

- [ ] Add failing property/adversarial tests for cross-owner/meeting, stale revision, missing segment/audio, overlap boundary, invalid quote hash, gap/interim/deleted targets.
- [ ] Run the focused suite and capture missing/incorrect rejection behavior.
- [ ] Implement pure validation plus repository resolution with no provider/network access.
- [ ] Run citation tests, P16 evidence regressions, and two-user integration.
- [ ] Record `citation-validator.json`; commit `feat(p17): validate AI citations`.

### Task 7: P17-T07 — Immutable prompt/schema/config registry

**Interfaces:** Produce hash-addressed artifacts with semantic version, compatibility, activation/rollback, provider/model parameters, and historical resolution.

- [ ] Add failing tests for mutation/hash mismatch, unknown version, concurrent activation, incompatible schema/prompt, rollback, and historical draft resolution.
- [ ] Run registry tests and capture absent registry behavior.
- [ ] Implement immutable artifacts, generated hash manifest, additive persistence/current pointers, and activation transaction.
- [ ] Run registry, migration, reproducibility, and generated-file consistency checks.
- [ ] Record `prompt-registry.json`; commit `feat(p17): version AI artifacts`.

### Task 8: P17-T08 — Provider switch, security, and handoff

**Interfaces:** Explicit retry-with-provider creates a distinct job/version/disclosure/budget record; never automatic fallback.

- [ ] Add API/job tests for explicit switch, missing disclosure, budget denial, provider outage/rate, malformed output, cancellation, replay, IDOR, and prior-version preservation.
- [ ] Run mock fault campaigns, live conformance when authorized, bundle/log/secret scans, and `pnpm verify`.
- [ ] Map P17-A01 through P17-A06 to evidence; keep live/provider acceptance open when authorization is unavailable.
- [ ] Update evidence/status/traceability/progress only from direct results; open inherited rows cap phase at `IMPLEMENTED`.
- [ ] Run GitNexus change detection before commits and stop before P18.

## Final Review Checklist

- [ ] Provider SDK/raw payload types cannot escape adapter directories.
- [ ] Invalid structure or citation cannot publish.
- [ ] Every draft resolves immutable provider/model/prompt/schema/config/input provenance.
- [ ] Retry/cancel/budget/provider switching cannot mutate source evidence.
- [ ] Secret, content, two-owner, and live-provider gates are truthful.
