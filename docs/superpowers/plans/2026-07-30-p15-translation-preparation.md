# P15 Translation Preparation and Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a provider-neutral, versioned Vietnamese-English translation pipeline that can only run for a completed `meeting_translate` meeting and never mutates its source transcript.

**Architecture:** P15 is a derived-artifact pipeline layered on P14's immutable final projection. A new `@kms/translation` package owns strict versioned contracts and provider isolation; API/jobs/persistence own policy, durable work, atomic version selection, and owner isolation; desktop/mobile render source and provisional/final translations as distinct states. Existing P02/P03 `translation_segments` prototypes are not authoritative for P15: migrate additively to an immutable version/lineage representation only after P14's final interfaces are verified.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm workspace, Drizzle/PostgreSQL, Fastify API, durable jobs/outbox/SSE, React/Electron, React Native.

## Global Constraints

- Execute P15 only after `P14` is `VERIFIED` and `docs/execution/evidence/P14/EVIDENCE.md` exists with direct acceptance evidence.
- Translation is allowed only for `MeetingMode = meeting_translate`; source is exactly `vi | en` and target is the opposite language.
- Translation is derived, versioned, owner-scoped, immutable, and must never overwrite source segment, source revision, P14 projection, recording, or completeness.
- A translation input pins source segment/projection/revision/text SHA-256, language pair, provider policy, and idempotency key.
- Provider SDK payloads and client-side keys are forbidden outside an adapter; safe diagnostics/logs contain neither meeting content nor secrets.
- No automatic cross-provider fallback. Explicit cross-provider retry creates a new job/version and requires disclosure/budget approval.
- Realtime results are provisional/non-authoritative and non-persistent; final results are durable derived versions only after P14 allows downstream work.
- Use synthetic or explicitly consented vi/en corpus only. Freeze quality/cost/latency thresholds before provider tuning.
- Preserve all existing user changes. Do not update `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`, P15 evidence, or lifecycle state until direct verification during the actual P15 run.
- Do not implement P16, mixed-language detection, arbitrary language pairs, minutes, source editing/replacement, client provider keys, or implicit cloud fallback.

---

## 0. Execution-entry gate and reproducible environment

**Files:**

- Read: `docs/execution/EXECUTION_PROTOCOL.md`
- Read: `docs/execution/PROGRESS.md`, `docs/execution/MASTER_PLAN.md`, `docs/execution/phases/P15-translation.md`
- Read: `docs/execution/evidence/P14/EVIDENCE.md` (must exist)
- Create: `docs/execution/evidence/P15/RUN-YYYYMMDD-HHMM.md` from `docs/execution/templates/RUN_TEMPLATE.md`

- [ ] **Step 1: Re-run mandatory preflight without modifying product files.**

  Run:

  ```powershell
  git status --short --branch
  git diff --stat
  git log -5 --oneline
  ```

  Record every dirty/untracked path as pre-existing or current-run. Do not reset, clean, or stage it.

- [ ] **Step 2: Prove P14 dependency and external release inputs.**

  Require direct P14-A01..A06 mapping in `docs/execution/evidence/P14/EVIDENCE.md`, and check the ledger says `P14 VERIFIED`. Require P00 approval for first translation provider, disclosed region/retention terms, a server-side secret reference, account budget policy, and frozen synthetic/consented vi/en corpus. If one is missing, record the exact blocker; do not start P15 or claim live quality acceptance.

- [ ] **Step 3: Pin compatible toolchain before dependency installation.**

  `package.json` requires `pnpm@10.14.0`; do not use the currently discovered pnpm `11.9.0` to update dependencies or the lockfile. Install/select Node and Corepack pnpm 10.14.0, then verify:

  ```powershell
  node --version
  pnpm --version
  pnpm install --frozen-lockfile
  pnpm execution:check
  ```

  Expected: pnpm reports `10.14.0`; install does not modify `pnpm-lock.yaml`; execution-plan check exits 0. Record Windows/Node/pnpm/Rust/provider/device versions in the run record.

- [ ] **Step 4: Lock task order, ownership, and review roles.**

  Dispatch a read-only design/architecture reviewer first. Then allocate only the non-overlapping packages below: Contract/Adapter (T01/T03), Policy/Persistence (T02/T04), Client/Evaluation (T05/T06). Serialise T02 after T01; T04 after T01/T02; T05/T06 after T02/T04. Use a fresh implementer and a distinct two-stage reviewer for each task. The main agent integrates and owns evidence/ledger documents.

## 1. Required file map (validate against post-P14 tree)

| Path                                                                            | Change                                 | Responsibility                                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/translation/package.json`                                             | Create                                 | Workspace package metadata, exports, test/typecheck scripts                                  |
| `packages/translation/src/core/{schemas,provider,errors,hash,conformance}.ts`   | Create                                 | Strict V1 input/output/capability/error contracts; safe hashing and fixtures                 |
| `packages/translation/src/adapters/{deterministic-mock,<approved-provider>}.ts` | Create                                 | CI mock and server-only production adapter                                                   |
| `packages/domain/src/transcript/*`                                              | Modify only after impact analysis      | Re-export compatibility boundary or remove obsolete prototype translation types deliberately |
| `packages/database/src/schema/*`, `packages/database/drizzle/*`                 | Modify/Create                          | Additive immutable translation-version lineage storage, indexes, constraints, migration      |
| `packages/database/src/repositories/*`                                          | Modify                                 | Owner-scoped transactional write/read/current-pointer methods                                |
| `packages/jobs/src/*`                                                           | Modify/Create                          | Idempotent translation job, retry/cancel/rate/budget handling                                |
| `apps/api/src/modules/translation/*`                                            | Create                                 | Authenticated policy, job enqueue, status/current-version APIs, safe errors                  |
| `apps/api/src/app.ts`                                                           | Modify                                 | Register translation module after interface review                                           |
| `apps/desktop/src/*`, `apps/mobile/src/*`                                       | Modify                                 | Source-first provisional/final translation presentation and accessible states                |
| `packages/translation/test/*`, API/jobs/database/client test paths              | Create                                 | Contract, policy, lineage, fault, UI/a11y, corpus tests                                      |
| `docs/{architecture,product}/**`, `docs/execution/evidence/P15/**`              | Modify/Create during verified run only | Provider disclosure/versioning, flows, evidence and traceability                             |

Before editing any function/class/method, run the repository-required GitNexus upstream impact analysis and report direct callers, affected processes, and risk. The GitNexus MCP capability was unavailable during this preparation; the execution agent must restore/use it or document the approved project fallback before editing symbols.

### Task 1: P15-T01 — Provider-neutral translation contracts

**Files:**

- Create: `packages/translation/package.json`, `packages/translation/src/core/schemas.ts`, `provider.ts`, `errors.ts`, `hash.ts`, `conformance.ts`, and focused `*.test.ts`
- Modify: root workspace/test configuration only if the new package is otherwise undiscoverable
- Evidence: `docs/execution/evidence/P15/translation-contract.json`

**Interfaces:**

- Consumes: P14 final projection/segment/revision identifiers, source-text resolver, owner and completeness decision.
- Produces: `TranslationProvider`, `TranslationInputV1`, `TranslationVersionV1`, `TranslationCapabilitiesV1`, `TranslationSafeErrorV1`, `translate(input, signal)`, and deterministic conformance fixtures.

- [ ] Write invalid fixtures first for same/unknown language, missing source projection/revision, invalid SHA-256, raw SDK response/error, unversioned output, malformed usage/confidence/status/cancel, and content-bearing diagnostics.
- [ ] Run the focused Vitest command; verify failures are contract assertions, not package resolution failures.
- [ ] Implement strict Zod V1 schemas. Make input require `meetingId`, `ownerId`, source segment/projection/revision IDs, source hash, source/target languages, provider policy/version, idempotency key, and timestamp. Make output require provider/model/config/prompt version when applicable, source lineage/hash, status, usage, timestamps, derived text, and safe error only.
- [ ] Implement capability negotiation that accepts only `vi -> en` or `en -> vi`; expose no provider SDK type across the package boundary.
- [ ] Run unit + conformance tests and write test counts/result hashes to `translation-contract.json`.
- [ ] Submit specification-compliance then quality/security review; fix/retest/re-review all Important/Critical findings.

### Task 2: P15-T02 — Mode, language, completeness, owner, and budget policy

**Files:**

- Create/Modify: `apps/api/src/modules/translation/policy.ts`, `service.ts`, `routes.ts`, tests
- Modify: `packages/jobs/src/*` only for the typed enqueue interface
- Evidence: `docs/execution/evidence/P15/translation-policy.json`

**Interfaces:**

- Consumes: T01 contracts, authenticated owner context, P14 completeness/downstream eligibility, meeting settings snapshot, provider disclosure and budget policy.
- Produces: `createTranslationWork(input, actor): Promise<TranslationJobDecision>` that either returns an idempotent job decision or a safe typed rejection before any adapter call.

- [ ] Write policy tests covering `meeting_only`, wrong/same pair, fixed settings snapshot despite later settings changes, incomplete/review-required P14 state, missing provider disclosure/budget, duplicate event/idempotency replay, and two users with identical segment IDs.
- [ ] Run the specific policy test file and confirm each missing decision fails before a provider spy is invoked.
- [ ] Implement a pure policy decision that derives target from the start-time source language, enforces `meeting_translate`, verifies P14 eligibility, binds owner/provider/disclosure/budget, and returns the same result for the same idempotency key.
- [ ] Add authenticated Fastify route/service tests for owner scope and safe errors; never accept provider/model/key from client input.
- [ ] Run related API/job regression suites and emit `translation-policy.json` with command, exit code, test count, negative-provider-call proof, and fixture checksum.
- [ ] Complete independent auth/policy review before T04 begins.

### Task 3: P15-T03 — Deterministic mock and approved production adapter

**Files:**

- Create: `packages/translation/src/adapters/deterministic-mock.ts`, `<approved-provider>.ts`, tests/fixtures
- Modify: server-only config/secret-reference module as needed; no client package
- Evidence: `docs/execution/evidence/P15/adapter-conformance.json`

**Interfaces:**

- Consumes: T01 `TranslationProvider` contract and T02 resolved provider policy.
- Produces: deterministic mock and named approved adapter implementing `capabilities`, `healthcheck`, `translate`, and `cancel` through safe normalized results.

- [ ] Write adapter conformance fixtures for both directions and for timeout, bounded same-provider retry, rate limit, malformed response, cancellation, unsupported region/model/language, and safe-error redaction.
- [ ] Prove the deterministic mock fails fixture validation before implementation, then implement it with stable output derived only from synthetic input fixtures.
- [ ] Implement production adapter behind a server-side secret-store reference; validate all provider responses before returning normalized V1 output. Enforce timeout, cancellation propagation, rate/concurrency limits, and no implicit cross-provider fallback.
- [ ] Run contract fixtures against mock. Run live vi/en tests only with approved provider/region/retention disclosure and key; otherwise record precise blocker rather than a simulated pass.
- [ ] Scan source, built client artifacts, API responses, test reports, and logs for secret/content leakage; save command/result/checksum in adapter evidence.
- [ ] Complete provider/secret review before merging with T02/T04.

### Task 4: P15-T04 — Immutable versioned persistence and current projection

**Files:**

- Create: additive Drizzle migration/snapshot and translation-version schema/repository tests
- Modify: `packages/database/src/schema/*`, `packages/database/src/repositories/*`, translation worker/API persistence integration
- Evidence: `docs/execution/evidence/P15/translation-lineage.json`

**Interfaces:**

- Consumes: T01 `TranslationVersionV1`, T02 job decision and source identity, approved T03 adapter output.
- Produces: immutable `translation_versions` records and owner-scoped atomic current-version projection keyed by exact source segment/projection/revision/hash.

- [ ] Inspect current P02/P03 `translation_segments` and `translation_current` schema/repository call sites. Decide and document an additive migration path that preserves historical rows but does not mistake their incomplete lineage for P15 authority.
- [ ] Write database tests before migration for revision -> new eligible version, idempotent duplicate/retry, stale compare-and-swap current pointer, cross-meeting/owner rejection, source text/update/delete attempts, and provider/config/prompt/usage provenance requirements.
- [ ] Add schema/migration constraints and transactional repository write method: insert immutable version, conditionally advance current pointer using expected projection/revision/hash, return deterministic stale outcome, never update historical text.
- [ ] Run migration/integrity/repository tests in a real PostgreSQL environment; inspect constraints and immutable trigger behavior explicitly.
- [ ] Run API/job integration tests across crash/retry boundary and export exact lineage rows without translated content to `translation-lineage.json`.
- [ ] Complete lineage/immutability review before client work.

### Task 5: P15-T05 — Provisional realtime and authoritative final UX

**Files:**

- Modify: post-P14 desktop/mobile processing/transcript view components, state selectors, i18n labels, and focused tests
- Evidence: `docs/execution/evidence/P15/translation-ui-report.json`

**Interfaces:**

- Consumes: translation status/current-version API and P14 source/projection completeness state.
- Produces: source-first UI with explicit `provisional realtime` vs `authoritative final derived version`, provider disclosure, delay/partial/cancel/failure states, and accessible semantics.

- [ ] Identify exact client symbols and run GitNexus impact analysis before edits. Write UI tests for no translation pane in `meeting_only`, source always visible, provisional label/non-persistence, final version/provenance disclosure, reconnect, out-of-order status, source revision, delay, partial, cancel, provider failure, keyboard/focus/screen-reader labels, and contrast/localized copy.
- [ ] Run the focused tests and verify they fail for missing semantics rather than test harness problems.
- [ ] Implement presentation state only; clients must not call providers, store secrets, mutate source, or promote realtime output to final. Use server job/status data and preserve source as the primary readable record.
- [ ] Run desktop/mobile focused suites plus related transcript/processing UI regressions. Capture automated a11y output and known physical/manual matrix requirements in `translation-ui-report.json`.
- [ ] Complete independent UX/a11y review.

### Task 6: P15-T06 — Frozen bilingual scorecard and fault qualification

**Files:**

- Create: `packages/translation/test/evaluation/*`, synthetic/consented corpus manifest, evaluator, scorecard fixtures
- Modify/Create: P15 evidence summary during direct execution
- Evidence: `docs/execution/evidence/P15/EVIDENCE.md` and a versioned scorecard

**Interfaces:**

- Consumes: approved corpus manifest, T03 adapter, T04 immutable output lookup, configured thresholds.
- Produces: fail-closed scorecard for terminology, names, numbers, negation, omissions, alignment, latency, cost, unsupported configuration changes, and outage/rate/malformed/cancel cases.

- [ ] Freeze corpus manifest and thresholds before tuning. Store only consent/provenance/checksums plus allowed synthetic text; record provider/model/config/prompt versions and budgets.
- [ ] Write evaluator tests that fail if corpus checksum/approval is absent, output is simulated in a live gate, threshold is missing, language pair is unsupported, or scorecard claims success with a skipped case.
- [ ] Implement mock evaluation for deterministic CI and live evaluation that fails closed unless all approved credentials/terms/region/corpus inputs are present.
- [ ] Execute mock scorecard and outage/rate/malformed/cancel fault suite. Execute live vi->en and en->vi qualification if authorized; otherwise record exact prerequisite, acceptance IDs blocked, attempted safe alternative, and owner action.
- [ ] Run the P15 integrated gates in packet order: contract/adapter, policy/auth, lineage, worker retry/cancel, UI/a11y, bilingual evaluation, secret/content scans, then `pnpm verify` with non-zero intended test counts.
- [ ] Have a whole-phase reviewer independently map P15-A01..A06 to direct evidence and inspect the integrated diff.

## 2. Acceptance-to-evidence checklist

| Acceptance | Direct proof required                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| P15-A01    | Mutation-negative source tests; immutable version rows with source projection/revision/hash lineage                                             |
| P15-A02    | Policy matrix proving only `meeting_translate` and exact opposite `vi/en` direction create work                                                 |
| P15-A03    | Desktop/mobile source-first accessibility tests; provisional/final state and failure/reconnect matrix                                           |
| P15-A04    | Contract and DB lineage evidence for provider/model/config/prompt/source/usage/timestamps                                                       |
| P15-A05    | Frozen mock and authorized live scorecards for quality, cost, latency, provider faults, rate, malformed output, cancel; otherwise exact blocker |
| P15-A06    | Two-owner/auth/budget/disclosure/no-fallback tests and clean secret/content scans                                                               |

## 3. Completion and handoff

- [ ] Populate `docs/execution/evidence/P15/EVIDENCE.md` from its template only after direct command and external-gate results exist.
- [ ] Update `docs/execution/TRACEABILITY.md`, `docs/STATUS.md`, and append (never rewrite) `docs/execution/PROGRESS.md` only with verified, non-overstated results.
- [ ] Mark P15 `VERIFIED` only when every P15-A01..A06 has direct evidence. If real provider approval/key/corpus is unavailable, use `IMPLEMENTED` or `BLOCKED` with exact external requirement and owner action.
- [ ] Run GitNexus `detect_changes()` before any commit to verify expected symbols/execution flows only; run final code review and the packet's `pnpm verify` gate. Preserve all pre-existing changes.
- [ ] Handoff only P16 as newly unblocked, then stop.
