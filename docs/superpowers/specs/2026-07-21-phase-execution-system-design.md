# Phase Execution System Design

**Status:** Approved design
**Owner:** Product and Engineering
**Approved:** 2026-07-21
**Applies to:** `docs/execution/`

## 1. Purpose

Kaiser's Meeting Space needs an execution system that lets a new agent receive one phase in one conversation and drive that phase to an evidence-backed terminal state without drifting into dependencies or later work. The system must cover the complete path from the current prototype to a production-qualified personal release that remains practical to extend.

The execution system is documentation and process infrastructure. Creating or maintaining it does not implement a product phase. Product behavior changes only when the corresponding phase packet is executed.

## 2. Design goals

The system must:

- Make one conversation responsible for exactly one phase.
- Give an agent enough context, boundaries, tasks, tests, debugging guidance, and evidence requirements to work autonomously.
- Preserve accepted product, architecture, security, and data-integrity decisions.
- Adapt to the repository state produced by earlier phases without allowing scope changes.
- Use subagents for independent, non-overlapping work packages and require the main agent to integrate and verify.
- Distinguish implementation from verification and prevent false-green claims.
- Support a production-grade personal release before optional or organizational expansion.
- Stop truthfully when required hardware, credentials, signing identity, legal approval, or external service state is unavailable.

## 3. Selected approach

Use a two-layer adaptive execution packet system.

### 3.1 Authoritative phase packet

Each file in `docs/execution/phases/` is the stable source of truth for one phase. It fixes the phase outcome, dependency evidence, scope, invariants, intended file ownership, public interfaces, ordered task IDs, test obligations, failure behavior, work packages, acceptance gates, and handoff boundary.

An executing agent may refine how a task maps to the current repository, but it may not rename tasks, broaden scope, weaken gates, or implement another phase. A material architectural change requires an accepted ADR and synchronized execution-plan update within the authorized phase scope.

### 3.2 Runtime execution record

At the start of a phase conversation, the main agent creates a run record under `docs/execution/evidence/Pxx/` from current repository truth. It records:

- Starting commit or tree and all pre-existing dirty files.
- Dependency states and evidence links.
- Toolchain, service, provider, operating-system, and device versions.
- Exact file paths resolved from the current repository.
- The phase task checklist and subagent allocation.
- Commands, exit codes, test counts, reports, defects, and root-cause fixes.
- Manual, device, provider, security, migration, rollback, and recovery evidence.
- Residual risk and the final phase state.

This record may adapt paths and commands to the implementation produced by earlier phases. It cannot change the authoritative phase outcome or acceptance criteria.

## 4. Sources of truth

The coordination documents have non-overlapping responsibilities:

| Document                               | Responsibility                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `docs/execution/EXECUTION_PROTOCOL.md` | Mandatory workflow, debugging discipline, state rules, and global invariants        |
| `docs/execution/MASTER_PLAN.md`        | Canonical phase catalog, direct dependency graph, release boundary, and phase links |
| `docs/execution/PROGRESS.md`           | Current state plus append-only execution history                                    |
| `docs/execution/TRACEABILITY.md`       | Requirement and invariant mapping to implementation, verification, and evidence     |
| `docs/execution/AGENT_PROMPT.md`       | Copy-paste instruction for assigning exactly one phase                              |
| `docs/execution/phases/Pxx-*.md`       | Authoritative scope and executable packet for a phase                               |
| `docs/execution/evidence/Pxx/`         | Run-specific facts and direct verification artifacts                                |
| `docs/STATUS.md`                       | Current implemented capability state, never target intent                           |

Conflict precedence remains:

`accepted ADR -> focused product/architecture/security documents -> requested phase packet -> superseded consolidated plan -> prototype code`

Repository truth determines what currently exists. Higher-precedence documents determine intended behavior when the requested phase is authorized to create it.

## 5. Phase packet contract

Every phase packet must contain the following sections.

### 5.1 Identity and observable outcome

Frontmatter declares a unique phase ID, title, state, direct dependencies, requirement IDs, and risk. The outcome describes user-visible or operationally observable behavior and defines what completion means.

### 5.2 Authoritative context and preconditions

The packet names every document and ADR that must be read completely. Preconditions list required dependency evidence, services, toolchains, providers, credentials, hardware, platform versions, and approvals. A dependency that is not `VERIFIED` blocks execution unless the packet explicitly permits a narrower planning-only prerequisite.

### 5.3 Scope firewall

The packet states:

- In-scope behavior.
- Explicit non-goals.
- Allowed and forbidden paths.
- Contracts that may be added or changed.
- Invariants that cannot be weakened.
- Extension seams that preserve future options without implementing future features.

Discoveries outside the firewall go into the handoff or backlog. They are not implemented opportunistically.

### 5.4 File and interface map

Before tasks, the packet maps intended files or focused directories to one responsibility each. Interfaces consumed from earlier phases and interfaces produced for later phases use stable names, parameter and result types, versioning rules, error behavior, authorization requirements, and compatibility expectations.

For later phases, intended paths and signatures are exact architectural targets. The runtime record reconciles them with repository truth before editing and documents any compatible path resolution. It may not silently change the public contract.

### 5.5 Ordered task packets

Every task has a stable `Pxx-Tnn` ID and an independently reviewable outcome. A task includes:

- Behavior and failure handling.
- Exact intended files and exclusive ownership boundaries.
- Interfaces consumed and produced.
- Synthetic fixtures and test cases.
- A test-driven loop: add a failing test, confirm the expected failure, implement the smallest coherent production change, run the narrow test, diagnose root causes, add regression coverage, run related tests, and checkpoint the change.
- Exact command contracts, expected success or failure signal, and evidence destination.
- A task-level definition of done.

Setup, configuration, migration, documentation, and cleanup belong to the task whose deliverable requires them. Tasks are not split into administrative fragments that have no independently testable result.

### 5.6 Subagent work packages

Only independent packages with non-overlapping file ownership may run concurrently. Each package declares inputs, allowed paths, dependencies, output, and review gate. A fresh implementer handles a bounded package. Higher-risk packages receive an independent review.

Review occurs in this order:

1. Specification and phase-scope compliance.
2. Code quality, security, reliability, and maintainability.

Subagents report findings and evidence. They do not integrate competing edits, update execution ledgers, or declare the phase state. The main agent owns integration, final verification, and state updates.

### 5.7 Failure and debugging matrix

The packet lists expected failures, truthful user/system behavior, content-free diagnostics, recovery, and required regression coverage. Failures are classified as contract, state, persistence, concurrency, timing, provider, platform, security, or environment failures.

Agents must reproduce with synthetic fixtures, identify the root cause, and preserve immutable evidence. They may not remove assertions, lower thresholds, hide errors, add blind retries, mutate source evidence, or substitute a mock for a required production/device/provider gate.

### 5.8 Integrated verification and acceptance

The phase gate includes:

- Static, unit, integration, contract, end-to-end, resilience, performance, and security commands that apply to the phase.
- Related regression suites.
- Manual, platform, device, and provider matrices.
- Data-integrity, privacy, authorization, migration, rollback, and recovery checks.
- Binary `Pxx-Ann` acceptance criteria with evidence destinations.

A command that runs zero tests fails unless the packet explicitly expects zero. Skipped critical scenarios, stale reports, conversation summaries, and subagent claims are not evidence.

### 5.9 Evidence, rollout, and handoff

The packet defines migration order, feature controls, rollout, rollback, documentation updates, and required handoff fields. The conversation ends after reporting the outcome, changed files, contracts and migrations, commands and exit codes, test counts, manual/device/provider evidence, defects and root causes, residual risk, and newly unblocked phase. It never begins the next phase.

## 6. Execution state machine

Each phase conversation follows:

`PREFLIGHT -> PLAN_LOCKED -> TASK_EXECUTION -> INTEGRATION -> PHASE_GATE -> VERIFIED | IMPLEMENTED | BLOCKED`

The repository-wide lifecycle remains:

`NOT_STARTED -> IN_PROGRESS -> IMPLEMENTED -> VERIFIED -> RELEASED`

`BLOCKED` is a truthful terminal result for the run, not a substitute for incomplete engineering.

- `IMPLEMENTED` means the code and available development gates pass, but at least one required external verification gate has not run.
- `VERIFIED` means every binary acceptance criterion has direct evidence in its required environment.
- `BLOCKED` means a concrete external dependency cannot be supplied or replaced within scope. The record must include reproduction, attempted alternatives, preserved work, and the exact owner action required.
- `RELEASED` is assigned only through the production qualification and rollout evidence defined by P27.

## 7. Global invariant checks

Every applicable task and every phase gate rechecks these properties:

- Meeting language is explicitly `vi` or `en`; personal v1 has no automatic mixed-language mode.
- Durable local audio write and atomic manifest update precede upload acknowledgement.
- Microphone and system tracks remain separate immutable evidence; mixes are derived.
- Recording does not depend on network, speech, translation, or generative AI availability.
- Final source audio and transcript are immutable; corrections are attributable projections or revisions.
- Translation and generative outputs are separate, versioned, validated derived artifacts.
- Every mutation is authenticated, owner-scoped, and idempotent when retryable.
- Provider credentials remain in approved server secret storage or OS keychain references.
- PostgreSQL and object manifests are authoritative; Redis is not.
- Expensive work uses durable asynchronous jobs.
- Logs and telemetry exclude meeting titles, audio, transcript, translation, minutes, object URLs, and credentials.
- New frameworks, providers, services, or material boundaries require an ADR and synchronized phase-plan update.

## 8. Phase and release structure

The execution catalog contains 29 phases:

| Train                    | Phases  | Outcome                                                                                             |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------- |
| Decision closure         | P00     | Accepted defaults, reconciled documentation, and traceable baseline                                 |
| Trusted foundation       | P01-P07 | Quality system, contracts, persistence, identity, storage, durable jobs, and local recovery         |
| Reliable capture clients | P08-P12 | Mobile capture/sync and Electron-Rust Windows capture                                               |
| Evidence pipeline        | P13-P16 | Speech, finalization, translation, and transcript review                                            |
| Derived intelligence     | P17-P20 | Provider platform, evaluated minutes, editor, branding, export, and library                         |
| Production qualification | P21-P27 | Security, privacy, observability, resilience, deployment, signed distribution, and release evidence |
| Optional extension       | P28     | Local AI and immutable audio import                                                                 |

P20 is feature-complete, not production-ready. P27 is the only phase that may mark the personal release `RELEASED`. P28 is optional and cannot delay or weaken P27.

The canonical dependency graph must be identical in `MASTER_PLAN.md`, phase frontmatter, `PROGRESS.md`, and `TRACEABILITY.md`. Only direct dependencies are listed. A phase packet may cite transitive evidence for risk review, but it must not create contradictory dependency metadata.

## 9. Extensibility boundary

The personal release exposes stable seams for provider adapters, identity policy, storage, capture sources, job types, document templates, renderers, and telemetry exporters. Those seams must be capability-based, runtime validated, versioned where externally consumed, and deny-by-default at security boundaries.

Team workspaces and RBAC, macOS system audio, calendar and email integrations, shared knowledge search, collaboration, and enterprise retention are outside P00-P28. Adding one requires product requirements, an ADR when the boundary is material, new traceability entries, a dependency edge, a dedicated phase packet, and evidence targets. It must not be inserted silently into an existing verified phase.

## 10. Deliverables

The planning work will:

1. Reconcile and strengthen `EXECUTION_PROTOCOL.md`, `MASTER_PLAN.md`, `PROGRESS.md`, `TRACEABILITY.md`, `AGENT_PROMPT.md`, and `STATUS.md`.
2. Rewrite P00-P21 as executable adaptive packets.
3. Create complete P22-P28 packets.
4. Add templates for phase packets, run records, evidence, and handoffs.
5. Add a repeatable validation checklist for dependency symmetry, unique task and acceptance IDs, valid links, required sections, placeholder text, evidence targets, and phase-size review.
6. Keep all execution documentation in English.

This work does not run P00 or any product implementation phase.

## 11. Plan quality gate

The execution documentation is complete only when:

- Every PRD requirement, NFR, accepted ADR, and critical test scenario maps to implementation and verification phases.
- Every catalog entry has an existing packet and every packet appears once in the catalog and progress ledger.
- Direct dependencies are acyclic and identical across all sources of truth.
- Task and acceptance IDs are unique and ordered.
- Every task has bounded ownership, interface information, failure behavior, a test cycle, and evidence output.
- Every phase has explicit automated, manual/platform, security/data-integrity, rollout/rollback, and handoff sections.
- No packet contains `TBD`, `TODO`, `implement later`, ambiguous "appropriate" work, or an unsupported claim that a future environment will pass.
- Interface names and state semantics are consistent between producing and consuming phases.
- P27 covers every production release criterion; P28 remains optional.
- A new agent can identify what to read, what to change, how to test, how to debug, when to stop, and what evidence permits a state transition without relying on prior conversation history.

## 12. Approved decisions

- Preserve and upgrade the existing P00-P28 structure instead of replacing it.
- Use the two-layer adaptive packet design.
- Keep one conversation responsible for one phase.
- Write execution documentation in English.
- Use subagent-driven execution with non-overlapping ownership and independent review.
- Permit truthful `BLOCKED` outcomes when real external prerequisites are unavailable.
- Target a production-qualified personal release at P27 and keep P28 optional.
