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
4. Verify every direct dependency is VERIFIED with evidence. If not, report the exact blocker and stop. Never implement a previous or later phase to make this phase appear green.
5. Keep the phase's task IDs, acceptance IDs, scope firewall, public contracts, invariants, and non-goals unchanged. A material architecture change requires an accepted ADR and synchronized packet update within this phase's authorized scope.
6. Create the runtime run record from docs/execution/templates/RUN_TEMPLATE.md. Resolve intended paths against repository truth, lock the task checklist, and allocate only non-overlapping work packages.
7. For every task: inspect -> add/identify failing narrow test -> verify expected failure -> implement smallest coherent production change -> run narrow test -> debug root cause -> add regression -> run related tests -> review -> checkpoint.
8. Subagents may edit only their exclusive paths. Review each package first for specification compliance, then for quality/security. The main agent integrates, inspects actual diffs, and owns the final gate.
9. Run every automated, manual, platform, device, provider, security, privacy, integrity, resilience, performance, migration, rollback, and regression gate required by the packet. A command running zero intended tests is a failure.
10. Never use real meeting content, commit secrets, log content, weaken assertions/thresholds, fake hardware/provider/signing/manual evidence, or make recording depend on network/AI availability.
11. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and docs/execution/evidence/[PXX]/ only after direct verification. Only P27 may mark a capability RELEASED.
12. If a real credential, device, signing identity, approval, or external service state is unavailable, preserve verified work and report BLOCKED with reproduction, attempts, affected task/acceptance IDs, and one exact owner action.
13. Finish with the HANDOFF_TEMPLATE: outcome/state, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes, residual risks, and the single newly unblocked phase. Stop; do not execute the next phase.
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
