
Execute exactly phase P04 from:
docs/execution/phases/P04-auth-authorization.md

Required outcome:
Implement personal OIDC/PKCE identity, secure token handling, API conventions, and complete owner authorization.

Direct dependencies that must already be VERIFIED with evidence: P03.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
   HARD SUBAGENT GATE: For every task that can be delegated, you MUST dispatch a fresh implementer subagent with a task-scoped prompt. After it reports, the main agent MUST inspect the diff and run the narrow task test/check. Then dispatch a separate reviewer subagent for specification compliance and code quality. If the reviewer reports Critical or Important findings, the main agent MUST fix the root cause (using a fresh fix subagent when independent) and rerun the covering tests before re-review. A task is not complete without implementer evidence, test/check evidence, reviewer disposition, and main-agent integration verification.
   REQUIRED SUBAGENT ROLE MATRIX: Every phase MUST use all roles below and record each assignment/result in the phase run record: (a) one fresh design/architecture subagent before task execution to map contracts, boundaries, risks, and sequencing (for a documentation-only phase it must explicitly record and justify “no architecture change”); (b) one fresh implementer subagent per delegated task; (c) one separate reviewer subagent after every task; (d) a fresh fix subagent for Critical/Important findings when the fix is independently delegable; and (e) one final whole-phase reviewer before handoff. Do not merge roles into one agent or count self-review as independent review.
- [x] P05-T03: Idempotent chunk registration
  - [x] Add database repository helper additions (listOrphans, recordOrphan, getTimelineMarkers, getReconciliation)
  - [x] Define DTO schema response changes (reconciliation manifest)
- [x] P05-T04: Verified atomic completion
  - [x] Implement complete-chunk validation, SHA-256 stream checks, and status recording
- [x] P05-T05: Authoritative manifest and reconciliation view
  - [x] Implement ManifestService logic
  - [x] Expose routes for manifest view
- [x] P05-T06: Limits, conflicts, authorization, and orphan lifecycle record
  - [x] Wire limits and validation checks
  - [x] Ensure owner-isolation is correct
- [x] P05-T07: Real-storage adversarial qualification
  - [x] Write adversarial test suite
  - [x] Run full verification checks (API unit/conformance tests passed; container tests skipped pending local Docker startup)
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P04/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P04-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P04-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Identity and authorization only. Do not implement team/RBAC, production IdP provisioning, business features beyond protected probes, or provider credentials. Stop before P05/P06.