# Execution Protocol

**Status:** Accepted
**Owner:** Engineering
**Last reviewed:** 2026-07-21

This protocol is mandatory for every phase in `docs/execution/phases/`. A phase packet fixes scope and acceptance. This protocol fixes how the work is executed and proven.

## 1. Conversation contract

- One conversation executes exactly one requested phase.
- Use `superpowers:subagent-driven-development` when independent work packages exist; otherwise use `superpowers:executing-plans` in the main conversation.
- Before implementation, use `superpowers:test-driven-development`. For every unexpected failure, use `superpowers:systematic-debugging`. Before any completion claim, use `superpowers:verification-before-completion`.
- Read the complete phase packet and every document in its **Authoritative context**. Do not rely on summaries from an earlier conversation.
- Do not implement a dependency, a successor, or a convenient adjacent feature. Record discovered future work in the handoff.
- Stop after the phase handoff. Never begin the newly unblocked phase.

## 2. State model

Repository phase state advances only as follows:

`NOT_STARTED -> IN_PROGRESS -> IMPLEMENTED -> VERIFIED -> RELEASED`

`BLOCKED` records a run that cannot proceed because of a concrete external requirement.

| State         | Required meaning                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `NOT_STARTED` | No phase task has been accepted as complete.                                                                                  |
| `IN_PROGRESS` | Preflight passed and at least one phase task is active.                                                                       |
| `IMPLEMENTED` | In-scope code and all available development gates pass, but a required external/manual gate remains unverified.               |
| `VERIFIED`    | Every binary acceptance criterion has direct evidence from the required environment.                                          |
| `RELEASED`    | P27 rollout and monitoring evidence prove availability to the intended personal user.                                         |
| `BLOCKED`     | A named credential, device, approval, service state, or dependency is unavailable and no truthful in-scope substitute exists. |

Conversation text, code existence, compilation alone, a mock of a required real integration, and another phase's umbrella command are not verification evidence.

## 3. Preflight and plan lock

Complete these steps before editing product files:

1. Run `git status --short --branch`, `git diff --stat`, and `git log -5 --oneline`. If the repository has no commit, record that fact instead of inventing a SHA.
2. Inventory all dirty and untracked files. Attribute files created by the current run separately; preserve every pre-existing user change.
3. Read `AGENTS.md`, this protocol, `PROGRESS.md`, `MASTER_PLAN.md`, the requested phase packet, and all authoritative documents it names.
4. Evaluate every direct dependency against the requested packet's
   **Dependency gate**. `VERIFIED` is the default. `IMPLEMENTED` is allowed only
   when the packet names the exact consumed capability, links direct contract,
   security, integrity, and regression evidence, and proves every unsatisfied
   dependency acceptance criterion is orthogonal, or when the dependency is
   explicitly admitted by the deferred integrated-qualification policy in
   section 3.2. Never upgrade or waive the dependency's lifecycle state. A
   stale ledger, missing evidence, or undocumented exception blocks execution.
5. Record exact Node, pnpm, Rust, OS, SDK, container, database, provider, browser, application, and device versions required by the packet.
6. Resolve the packet's intended paths against current repository structure. A compatible path move is recorded in the run record; a contract or boundary change requires an ADR/packet update.
7. Convert the unchanged task IDs into a runtime checklist. Record task order, exact narrow-test commands, and evidence destinations.
8. Allocate only the packet's work packages. Confirm exclusive file ownership and dependency order before dispatch.
9. Create `docs/execution/evidence/Pxx/RUN-YYYYMMDD-HHMM.md` from `templates/RUN_TEMPLATE.md` and set the ledger to `IN_PROGRESS` only after preflight succeeds.

The runtime checklist is now locked. It may gain regression cases discovered while debugging, but it may not gain features or weaken gates.

### 3.1 Canonical state and packet state

- `PROGRESS.md` is the only canonical runtime lifecycle source.
- Phase packet frontmatter uses `packet_status: ACCEPTED`; it never duplicates
  `NOT_STARTED`, `IN_PROGRESS`, `IMPLEMENTED`, `VERIFIED`, or `RELEASED`.
- `MASTER_PLAN.md` owns the stable dependency graph, not the current phase.
- `STATUS.md` describes capabilities and links to the ledger; it does not select
  the active phase.
- Owner approval may provide a missing credential, device, legal decision, or
  service state. It may not waive an acceptance gate or create an undocumented
  dependency contract.

### 3.2 Deferred end-to-end qualification policy

`DEFERRED_END_TO_END_QUALIFICATION` is a planning exception for the bounded
P10 through P20 implementation lane. It moves named long-running physical,
provider, and integrated end-to-end evidence into
`DEFERRED_END_TO_END_QUALIFICATION.md`; it does not waive, shorten, simulate,
or mark that evidence as passed.

- A P10 through P20 packet may consume a direct `IMPLEMENTED` dependency only
  when its packet links the ledger, identifies the consumed contract/capability,
  and records inherited deferred rows in its run record.
- The downstream phase may reach `IMPLEMENTED` only. An open inherited row is
  a hard ceiling: neither that phase nor the originating phase may claim
  `VERIFIED`.
- Security, owner isolation, consent, immutable source evidence, data-loss,
  migration, and provider-authorisation gates are never deferred. A missing
  real provider/model/device remains an explicit unavailable state.
- P21 through P27 and P28 use the default `VERIFIED` dependency rule. P27
  preflight must reject any open ledger row and rerun the integrated
  qualification before release.

## 4. Subagent allocation and review

- Use the `superpowers:subagent-driven-development` contract as a hard gate whenever the packet has independent work: dispatch a fresh implementer subagent per task, then a separate task-reviewer subagent after that task. Do not treat a single agent's self-review as the required independent review.
- Every phase also requires a distinct design/architecture subagent before task execution to map contracts, boundaries, risks, and sequencing. If the phase is documentation-only, that subagent records and justifies “no architecture change”; it is still a required role. Finish with a separate whole-phase reviewer. Do not merge design, implementation, and review roles.
- Give every implementer the phase ID, task IDs, allowed paths, consumed/produced interfaces, tests, and explicit non-goals.
- Do not give two active agents ownership of the same file, migration sequence, generated artifact, package index, or shared configuration.
- Serialise packages whose interfaces or migrations depend on each other.
- Subagents do not edit `STATUS.md`, `PROGRESS.md`, `TRACEABILITY.md`, phase state, or final evidence summaries.
- An implementer reports files changed, tests run, exact outputs, assumptions, and unresolved findings.
- Review each completed package in two stages:
  1. Specification compliance: requested behavior, phase boundary, invariants, and tests.
  2. Quality review: correctness, security, failure behavior, maintainability, and unnecessary scope.
- If a task reviewer reports Critical or Important findings, stop task completion, fix the root cause (dispatch a fresh fix subagent when the fix is independent), rerun the covering narrow/regression tests, and re-review the updated diff. Record the finding, fix, test command/output, and re-review disposition.
- The main agent inspects the actual diff, resolves integration, and reruns tests. A subagent's success claim is not evidence.

## 5. Task implementation loop

Perform this loop for every `Pxx-Tnn` task.

### 5.1 Inspect

- Read the current implementation, neighboring tests, generated contracts, migrations, configuration, and callers.
- Confirm the packet's consumed interfaces exist with the recorded version/signature.
- Identify the smallest coherent behavior that satisfies the task without creating a partial public contract.

### 5.2 Prove the gap

- Add or select a narrow automated test using synthetic/consented fixtures.
- Run the exact narrow command.
- Confirm it fails for the expected missing/incorrect behavior, not because of environment, syntax, import, or unrelated failures.
- Record command, exit code, test count, and the relevant failure signature in the run record.

Documentation-only tasks replace the failing test with a documented contradiction, broken-link, schema-validation, or acceptance-coverage check that is shown failing before correction.

### 5.3 Implement

- Make the smallest production-quality change that satisfies the test and packet contract.
- Validate every external boundary at runtime.
- Preserve backward compatibility/migration rules specified by the packet.
- Add no provider, framework, service, permission, destructive behavior, or telemetry field outside scope.

### 5.4 Verify narrowly

- Run the narrow test and confirm a non-zero intended test count.
- Run neighboring unit/contract/integration tests for modified interfaces.
- Inspect logs and reports for content, credentials, unexpected skips, retries, leaks, warnings, and open handles.

### 5.5 Debug root cause

If any test fails:

1. Reproduce with the smallest deterministic synthetic fixture.
2. Classify the failure as contract, state, persistence, concurrency, timing, provider, platform, security, or environment.
3. Inspect state, safe IDs, timestamps, buffer counters, attempts, transitions, manifests, checksums, or query plans as applicable. Never log meeting content.
4. State one falsifiable root-cause hypothesis and test it.
5. Add a regression test when feasible.
6. Fix within task scope and rerun from the failing narrow test through related regression.

Never delete/skip a critical test, lower a threshold, weaken an assertion, add blind retries, mutate source evidence, or replace a required real gate with a mock to obtain green output.

### 5.6 Task checkpoint

A task is complete only when its behavior, failure paths, narrow tests, related regression, documentation/migrations, and evidence entry are complete. Check off the task ID in the run record and create a focused commit when repository/phase conditions permit. Do not mark phase acceptance yet.

## 6. Integrated phase gate

Every packet defines an exact command table. A task-specific command whose path
does not exist until an earlier phase executes is resolved during preflight and
recorded with its expected failure signature and non-zero intended test count.
External device, provider, signing, deployment, or production commands name the
required environment and acceptance signal and remain unverified until run
there.

After all tasks integrate, run the packet's gate in this order:

1. Format and generated-file consistency.
2. Static analysis and type checks.
3. Unit and property tests.
4. Contract tests.
5. Real-service integration and migration tests.
6. Relevant desktop/mobile/API end-to-end tests.
7. Security, privacy, and data-integrity checks.
8. Resilience and fault-injection scenarios.
9. Performance/long-session benchmarks.
10. Required manual, device, provider, signing, deployment, rollback, and recovery matrix.
11. Repository-wide regression command defined by the packet.

For each command record the exact command, exit code, intended and executed test counts, environment, duration, and artifact path. A command that runs zero tests is a failure unless the packet explicitly declares zero as expected. A skipped critical scenario prevents `VERIFIED`.

## 7. Global invariants

- Meeting language is exactly `vi | en`; personal v1 has no automatic mixed-language mode.
- Durable local audio write and atomic manifest update precede upload acknowledgement.
- Microphone/system tracks are separate immutable evidence; mixes are derived.
- Recording never depends on network, speech, translation, or generative AI availability.
- Final source audio and transcript are immutable; corrections are revisions/projections.
- Translation never replaces source text.
- Generative AI publishes only derived, versioned, schema-validated, citation-validated artifacts.
- All mutations are authenticated, owner-scoped, and idempotent where retryable.
- Provider credentials remain server secret-store or OS-keychain references.
- Expensive work is asynchronous through durable jobs.
- Redis is not authoritative; PostgreSQL and object manifests are.
- Logs/telemetry contain no audio, transcript, translation, minutes, meeting title, object URL, or credential.
- Tests use synthetic or explicitly consented fixtures only.
- No new framework, provider, service, privilege, or material boundary without an ADR and phase-plan update.

## 8. Evidence and handoff

Only after direct verification:

1. Complete `docs/execution/evidence/Pxx/EVIDENCE.md` using `templates/EVIDENCE_TEMPLATE.md`.
2. Map every `Pxx-Ann` acceptance ID to a test/scenario and artifact.
3. Update `TRACEABILITY.md` test/evidence cells.
4. Update `STATUS.md` capability state without overstating target behavior.
5. Append a run entry to `PROGRESS.md`; never rewrite earlier run history.
6. Set the phase to `VERIFIED` only if every criterion has evidence. Otherwise use `IMPLEMENTED` or record `BLOCKED` truthfully.
7. End with: outcome, changed files, contracts/migrations, commands and exit codes, test counts, manual/device/provider matrix, defects/root causes, residual risk, owner action if blocked, and the single phase newly unblocked.

## 9. Blocked-run standard

A blocked handoff must name:

- The exact unavailable external requirement.
- The task and acceptance IDs it prevents.
- Reproduction and safe alternatives attempted.
- Work completed and verified before the block.
- Files/evidence preserved.
- One concrete action and acceptance signal required from the project owner.

Difficulty, uncertainty, long runtime, failing tests, or beneficial clarification are not external blockers. Continue root-cause work while meaningful in-scope progress remains.
