# Copy-Paste Phase Prompt

Replace `[PXX]` and `[PHASE_FILE]`, then send this prompt in a new conversation. Do not attach another phase.

For prompts with every phase ID, filename, dependency, outcome, and boundary already filled in, use [Ready-to-Copy Phase Prompts](PHASE_PROMPTS.md).

```text
Execute exactly phase [PXX] from:
docs/execution/phases/[PHASE_FILE]

Target the strongest truthful terminal state: VERIFIED when every gate has direct evidence; otherwise IMPLEMENTED or BLOCKED as defined by the execution protocol. Do not stop after writing code.

Mandatory workflow:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for the packet's independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, MASTER_PLAN.md, PROGRESS.md, the requested phase packet, and every document in its Authoritative context.
3. Treat the current repository, Git state, migrations, tests, and dependency evidence as current truth. Inventory and preserve all pre-existing user changes; never reset or discard them.
4. Validate every direct dependency against the requested packet's Dependency
   gate. VERIFIED remains the default. IMPLEMENTED is allowed only for a named
   consumed capability with direct evidence and orthogonal unsatisfied
   acceptance gates. Never upgrade or waive the dependency's lifecycle state.
   If the gate fails, report the exact blocker and stop. Never implement a
   previous or later phase to make this phase appear green.
5. Keep the phase's task IDs, acceptance IDs, scope firewall, public contracts, invariants, and non-goals unchanged. A material architecture change requires an accepted ADR and synchronized packet update within this phase's authorized scope.
6. Create the runtime run record from docs/execution/templates/RUN_TEMPLATE.md. Resolve intended paths against repository truth, lock the task checklist, and allocate only non-overlapping work packages.
7. HARD SUBAGENT GATE: For every task that can be delegated, dispatch a fresh implementer subagent with a task-scoped prompt and exclusive file ownership. Do not implement that delegated task directly in the main conversation unless it is genuinely serial or cannot be isolated; record the reason.
7A. REQUIRED ROLE MATRIX: Use distinct subagent roles in every phase: (a) one design/architecture subagent before task execution to map contracts, boundaries, risks, and sequencing; (b) one fresh implementer subagent per delegated task; (c) one separate reviewer subagent after every task; (d) a fresh fix subagent for Critical/Important findings when independently delegable; and (e) one final whole-phase reviewer before handoff. For documentation-only phases, the design/architecture subagent must explicitly record “no architecture change” with its boundary analysis. Never merge these roles or count self-review as independent review.
8. Per-task loop is mandatory: implementer subagent follows inspect -> failing narrow test/check -> expected failure -> smallest coherent change -> narrow pass -> regression -> self-review, then returns the command, exit code, test count, changed files, and concerns. The main agent inspects the actual diff and runs the narrow task test/check; a subagent claim is not evidence.
9. After every implementer task, dispatch a separate reviewer subagent for specification compliance and code quality/security. If the reviewer reports Critical or Important findings, the main agent must fix the root cause (using a fresh fix subagent when independent), rerun the covering tests, and send the result back for re-review. A task cannot be marked complete without implementer evidence, test/check evidence, reviewer disposition, and main-agent integration verification.
10. Subagents may edit only their exclusive paths. The main agent integrates, resolves cross-task conflicts, owns the complete phase gate, and performs the final whole-phase review before handoff.
11. Run every automated, manual, platform, device, provider, security, privacy, integrity, resilience, performance, migration, rollback, and regression gate required by the packet. A command running zero intended tests is a failure.
12. Never use real meeting content, commit secrets, log content, weaken assertions/thresholds, fake hardware/provider/signing/manual evidence, or make recording depend on network/AI availability.
13. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and docs/execution/evidence/[PXX]/ only after direct verification. Only P27 may mark a capability RELEASED.
14. If a real credential, device, signing identity, approval, or external service state is unavailable, preserve verified work and report BLOCKED with reproduction, attempts, affected task/acceptance IDs, and one exact owner action.
15. Finish with the HANDOFF_TEMPLATE: outcome/state, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes, residual risks, and the single newly unblocked phase. Stop; do not execute the next phase.
```

## Assignment examples

```text
Execute exactly phase P01 from:
docs/execution/phases/P01-quality-foundation.md
```

```text
Execute exactly phase P12 from:
docs/execution/phases/P12-windows-audio-capture.md
```
