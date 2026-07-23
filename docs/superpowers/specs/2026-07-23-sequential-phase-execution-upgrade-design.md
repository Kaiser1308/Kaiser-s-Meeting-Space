# Sequential Phase Execution Upgrade Design

**Status:** Proposed for owner approval
**Owner:** Product and Engineering
**Date:** 2026-07-23
**Applies to:** `docs/execution/`

## 1. Goal

Upgrade the existing P00-P28 execution system so a new agent can execute exactly
one phase per conversation, hand off cleanly, and start the next eligible phase
without inventing dependency exceptions or reconciling contradictory state.

The upgrade changes execution control and planning documentation only. It does
not implement, verify, or advance any product task.

## 2. Current failure modes

The current system has four control-plane defects:

1. Phase entry requires every direct dependency to be `VERIFIED`, while some
   early phases contain manual or full-product acceptance gates that can only be
   exercised after dependent phases create devices, clients, or routes. P04 is
   therefore `IMPLEMENTED`, but P05 and P06 need its already-proven server-side
   identity and authorization capabilities.
2. Lifecycle state is duplicated in packet frontmatter, `MASTER_PLAN.md`,
   `PROGRESS.md`, `STATUS.md`, and evidence. These copies have drifted.
3. `PHASE_PROMPTS.md` manually duplicates the workflow. P00 and P01 contain the
   hard subagent gate twice, while P27 and P28 omit it.
4. Packets name verification categories but do not provide a consistent exact
   command contract. Agents must infer commands and expected signals.

## 3. Considered approaches

### 3.1 Renumber and split phases

Move P04 device and full-route gates into new phases and make each phase fully
verifiable before dependents start.

This produces pure lifecycle semantics but destabilizes 29 accepted packet IDs,
213 task IDs, 170 acceptance IDs, traceability, and existing evidence. It is
rejected for this upgrade.

### 3.2 Capability-scoped dependency readiness

Keep the phase graph and distinguish:

- lifecycle evidence proving the entire phase;
- dependency evidence proving the exact interfaces and invariants consumed by a
  dependent phase.

This is the selected approach. It preserves stable IDs and makes the existing
P04-to-P05 relationship explicit without weakening P04's remaining gates.

### 3.3 Owner exceptions

Allow an owner to authorize any `IMPLEMENTED` dependency.

This matches the current P05 run record but is not deterministic or safe enough
for sequential agents. It is rejected. Owner approval may supply a missing
external prerequisite, but it may not waive an acceptance criterion or create
an undocumented dependency contract.

## 4. State and source-of-truth model

### 4.1 Document state

Phase packet frontmatter describes the packet, not execution:

```yaml
packet_status: ACCEPTED
```

`status: NOT_STARTED` is removed from phase packets because it duplicates runtime
state.

### 4.2 Runtime lifecycle

`docs/execution/PROGRESS.md` is the only canonical lifecycle ledger:

`NOT_STARTED -> IN_PROGRESS -> IMPLEMENTED -> VERIFIED -> RELEASED`

`BLOCKED` remains a terminal result for a run, not a permanent phase lifecycle
state. Evidence files explain why the strongest achieved lifecycle state is
truthful.

`MASTER_PLAN.md` owns only the stable catalog and dependency graph. It does not
declare a current phase. `STATUS.md` owns capability descriptions and links to
the canonical ledger; it does not independently select the active phase.

### 4.3 Dependency readiness

Every non-root packet adds a `Dependency gate` table:

| Dependency | Required capability | Required evidence | Minimum lifecycle |
| ---------- | ------------------- | ----------------- | ----------------- |

The default minimum lifecycle remains `VERIFIED`. A packet may consume a
capability from an `IMPLEMENTED` dependency only when all of the following are
true:

1. The capability is named in the dependent packet before execution.
2. Its contract, security, integrity, and regression evidence are directly
   linked.
3. Every unsatisfied acceptance criterion is orthogonal to the consumed
   capability.
4. The exception is validated by the execution-plan validator.
5. The dependent phase does not claim or imply that the dependency itself is
   `VERIFIED`.

P05 and P06 will explicitly consume P04's authenticated owner context, JWT
verification, owner-isolation policy, and safe API conventions. P04 OS-keychain
device evidence and the eventual full-product route matrix remain unsatisfied
P04 gates and later release blockers.

## 5. One-conversation execution contract

Each conversation receives only:

```text
Execute exactly phase PXX from:
docs/execution/phases/<packet>.md
```

The generic workflow lives once in `AGENT_PROMPT.md`. Ready-to-copy prompts are
generated artifacts and contain:

- phase ID and packet path;
- observable outcome;
- direct dependency gate summary;
- phase-specific boundary;
- a reference to the single generic mandatory workflow.

No generated phase prompt may redefine the role matrix or workflow. This removes
workflow drift while retaining convenient copy-paste prompts.

The conversation stops after the phase handoff. It never starts the next phase.

## 6. Command contract

Every packet gains an exact phase-gate command table:

| Gate | Command | Intended signal | Evidence |
| ---- | ------- | --------------- | -------- |

Repository-wide commands use the accepted root scripts:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:contract`
- `pnpm verify`

Commands that require a later-created package, physical device, provider,
signing identity, or production environment are marked `external` and name the
required environment plus the exact acceptance signal. They are not reported as
passing until run there.

Task-level narrow commands are resolved during preflight because intended paths
may not exist until earlier phases execute. The run record must capture the exact
resolved command, expected non-zero test count, initial failing signature, final
passing result, duration, and artifact.

## 7. Generated prompts and automated validation

Add two repository scripts:

1. `scripts/generate-phase-prompts.mjs`
   - reads the 29 packet files;
   - extracts phase ID, title, outcome, dependency gate, and handoff boundary;
   - renders `PHASE_PROMPTS.md` from one fixed template;
   - supports `--check` to fail when the committed artifact is stale.
2. `scripts/validate-execution-plan.mjs`
   - requires exactly P00-P28;
   - validates unique ordered phase, task, and acceptance IDs;
   - checks dependency symmetry and acyclicity;
   - requires all packet sections and dependency-gate rows;
   - checks relative Markdown links;
   - rejects ambiguous marker terms outside explicitly allowed historical
     evidence;
   - checks one prompt block per phase and no duplicated workflow definition;
   - validates exact command tables;
   - checks canonical lifecycle consistency between `PROGRESS.md`, evidence
     presence, and capability links.

Root package scripts expose:

```text
pnpm execution:generate
pnpm execution:check
```

`pnpm execution:check` runs in the normal verification workflow and CI.

## 8. Migration of current repository truth

The control plane is reconciled without claiming new product verification:

- P00-P03 remain `VERIFIED`.
- P04 remains `IMPLEMENTED`.
- P05 becomes `IN_PROGRESS`, with T01 and T02 complete and T03-T07 open, based
  only on existing run records and task reports.
- `MASTER_PLAN.md` drops the stale `Current phase: P00` field.
- `STATUS.md` describes object storage as partially implemented and links to the
  P05 run record.
- P05 and P06 receive explicit P04 capability-scoped dependency gates.
- Historical evidence is not rewritten. A reconciliation entry is appended to
  `PROGRESS.md`.

No existing product file, migration, test result, or historical evidence claim
is changed by this upgrade.

## 9. Safety and compatibility

- Stable phase, task, acceptance, requirement, and ADR IDs remain unchanged.
- No acceptance criterion is deleted, weakened, or marked passed.
- Existing evidence remains immutable; only new reconciliation evidence is
  added.
- The generator is deterministic and makes no network calls.
- The validator is read-only.
- Existing dirty and untracked user files are preserved.
- Product code and P05 implementation remain outside this upgrade.

## 10. Acceptance criteria

The upgrade is complete when:

1. All 29 packets use `packet_status: ACCEPTED` and have valid dependency gates.
2. `PROGRESS.md` is the only current lifecycle source and truthfully records P05
   at 2/7 tasks.
3. P05 entry is permitted by an explicit, evidence-linked P04 capability gate,
   while P04 remains `IMPLEMENTED`.
4. Generated prompts contain exactly one block for every P00-P28 phase and no
   duplicated workflow or missing phase-specific boundary.
5. Every packet has an exact phase-gate command contract.
6. `pnpm execution:generate --check` and `pnpm execution:check` pass.
7. Existing repository verification still recognizes the new execution checks.
8. `git diff --check` reports no whitespace error in files changed by this
   upgrade.

## 11. Non-goals

- Executing or completing P05.
- Re-running or upgrading historical phase evidence.
- Renumbering phases or changing product architecture.
- Waiving physical-device, provider, signing, legal, privacy, deployment, or
  release evidence.
- Cleaning or committing unrelated working-tree changes.
