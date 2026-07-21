# Execution Plan Hub

**Status:** Accepted execution framework
**Owner:** Product and Engineering
**Last reviewed:** 2026-07-21

This directory converts the accepted product and architecture documentation into phase-sized production implementation packets. One new conversation receives one packet and executes only that phase.

## Start here

1. [Execution Protocol](EXECUTION_PROTOCOL.md)
2. [Master Plan](MASTER_PLAN.md)
3. [Progress Ledger](PROGRESS.md)
4. [Requirement Traceability](TRACEABILITY.md)
5. [Copy-Paste Phase Prompt](AGENT_PROMPT.md)
6. [Ready-to-Copy Prompts for P00-P28](PHASE_PROMPTS.md)
7. The requested packet in [`phases/`](phases/)

The phase agent must also read every authoritative document named by its packet.

## Two-layer execution

- The phase packet fixes outcome, scope, contracts, task IDs, work packages, tests, debugging behavior, and acceptance gates.
- The run record under `evidence/Pxx/` captures current repository paths, versions, allocation, commands, results, and external evidence.
- Runtime adaptation may resolve compatible paths; it cannot broaden scope or weaken a contract/gate.

## Truth model

`NOT_STARTED -> IN_PROGRESS -> IMPLEMENTED -> VERIFIED -> RELEASED`

Use `BLOCKED` only for a concrete external prerequisite with reproduction and an exact owner action. `IMPLEMENTED` means code is ready but a required real environment gate remains. `VERIFIED` requires every binary acceptance ID to have direct evidence. `RELEASED` is reserved for P27.

Conversation text is not evidence. `PROGRESS.md`, `STATUS.md`, `TRACEABILITY.md`, and `evidence/Pxx/` must agree.

## Phase discipline

- Direct dependencies must already be `VERIFIED`.
- Future work discovered during execution is recorded, not implemented.
- No mock satisfies a required real provider/device/signing/deployment gate.
- No agent claims unavailable manual tests passed.
- The main agent owns integration, full verification, ledger updates, and the final handoff.
- Stop after the requested phase.

## Templates

- [Phase packet](templates/PHASE_TEMPLATE.md)
- [Runtime run record](templates/RUN_TEMPLATE.md)
- [Evidence](templates/EVIDENCE_TEMPLATE.md)
- [Handoff](templates/HANDOFF_TEMPLATE.md)

## Maintaining the plan

A new capability requires requirement/ADR review, a direct dependency update, traceability entries, a dedicated phase packet, evidence targets, and validation of all links and IDs. Do not hide expansion inside an already verified phase.
