# Agent Execution Rules

This repository is governed by `docs/execution/`.

When asked to execute a phase:

1. Read `docs/execution/EXECUTION_PROTOCOL.md`, `PROGRESS.md`, the requested phase packet and every authoritative document it names.
2. Execute only that phase. Do not implement a dependency or next phase to make progress appear green.
3. Inspect current files and Git state before editing. Preserve user changes; never reset or discard them.
4. Use subagents only for independent work packages with non-overlapping file ownership. The main agent integrates and verifies.
5. For every task: implement, run the narrow test, debug the root cause and rerun. Then run the complete phase gate.
6. Audio/source transcript are immutable after finalization. Derived artifacts are versioned. Recording must not depend on network/AI availability.
7. Never use real meeting content, commit secrets, log content, fake device/provider behavior or claim unavailable manual tests passed.
8. Update `STATUS.md`, `execution/TRACEABILITY.md`, `execution/PROGRESS.md` and phase evidence only after direct verification.
9. A phase is `VERIFIED` only when every binary gate has evidence. Stop after handoff; never start the next phase.

Conflict precedence:

`accepted ADR → focused product/architecture/security docs → requested phase packet → superseded consolidated plan → prototype code`.
