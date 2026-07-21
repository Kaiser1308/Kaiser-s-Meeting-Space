# Ready-to-Copy Phase Conversation Prompts

**Status:** Accepted execution aid
**Owner:** Product and Engineering
**Last reviewed:** 2026-07-21

Use exactly one prompt below per new conversation. Start with P00 and proceed only when the next phase's direct dependencies are recorded as VERIFIED in PROGRESS.md. Do not combine prompts. P28 is optional and may be executed after P14 without delaying P21-P27.

## P00 — design closure

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P00 from:
docs/execution/phases/P00-design-closure.md

Required outcome:
Close product, platform, capture, privacy, provider, infrastructure, and repository-baseline decisions with traceable evidence.

Direct dependencies that must already be VERIFIED with evidence: None.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P00/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P00-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P00-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Documentation/governance only. Do not implement product code, install or upgrade dependencies, provision paid resources, or create a partial baseline commit. Stop before P01.
~~~

## P01 — quality foundation

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P01 from:
docs/execution/phases/P01-quality-foundation.md

Required outcome:
Build deterministic workspace scripts, typed configuration, isolated test services, mandatory CI/security gates, and false-green protection.

Direct dependencies that must already be VERIFIED with evidence: P00.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P01/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P01-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P01-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Engineering foundation only. Do not implement domain, persistence, authentication, recording, provider, or product UI behavior. Stop before P02.
~~~

## P02 — domain contracts

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P02 from:
docs/execution/phases/P02-domain-contracts.md

Required outcome:
Create canonical runtime schemas, state machine, error catalog, and versioned command/event contracts.

Direct dependencies that must already be VERIFIED with evidence: P01.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P02/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P02-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P02-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Domain contracts only. Do not implement database, HTTP routes, client UI, native capture, or provider SDK behavior. Stop before P03.
~~~

## P03 — persistence

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P03 from:
docs/execution/phases/P03-persistence.md

Required outcome:
Implement PostgreSQL migrations and owner-ready integrity-preserving repositories using real PostgreSQL tests.

Direct dependencies that must already be VERIFIED with evidence: P02.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P03/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P03-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P03-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Persistence only. Do not implement HTTP authentication, S3 bytes, Redis workers, clients, providers, or source mutation APIs. Stop before P04.
~~~

## P04 — auth authorization

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P04 from:
docs/execution/phases/P04-auth-authorization.md

Required outcome:
Implement personal OIDC/PKCE identity, secure token handling, API conventions, and complete owner authorization.

Direct dependencies that must already be VERIFIED with evidence: P03.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
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
~~~

## P05 — object storage chunks

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P05 from:
docs/execution/phases/P05-object-storage-chunks.md

Required outcome:
Implement the immutable S3-compatible audio chunk protocol, signed URLs, checksum completion, and manifest reconciliation.

Direct dependencies that must already be VERIFIED with evidence: P03 and P04.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P05/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P05-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P05-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Object-storage protocol only. Do not implement capture, transcription, finalization/backfill, local cleanup, or permanent deletion. Stop before P07.
~~~

## P06 — jobs outbox events

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P06 from:
docs/execution/phases/P06-jobs-outbox-events.md

Required outcome:
Implement durable jobs, transactional outbox, bounded retry/cancellation, one canonical result, and resumable owner-scoped SSE.

Direct dependencies that must already be VERIFIED with evidence: P03 and P04.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P06/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P06-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P06-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Use deterministic mock handlers only. Do not implement speech, translation, generative AI, export behavior, or production dashboards. Stop after P06.
~~~

## P07 — local recovery engine

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P07 from:
docs/execution/phases/P07-local-recovery-engine.md

Required outcome:
Implement the platform-neutral atomic manifest, bounded upload queue, reconciliation, Recovery Inbox, and safe cleanup eligibility.

Direct dependencies that must already be VERIFIED with evidence: P02 and P05.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P07/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P07-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P07-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Reference/fake adapters only. Do not implement microphone/WASAPI capture, app UI styling, speech, minutes, or automatic source deletion. Stop before P08/P11.
~~~

## P08 — mobile start flow

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P08 from:
docs/execution/phases/P08-mobile-start-flow.md

Required outcome:
Implement mobile authentication, ordered pre-meeting setup, readiness, consent, accessibility, and Vietnamese/English localization.

Direct dependencies that must already be VERIFIED with evidence: P04 and P07.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P08/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P08-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P08-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Connect Start to a fake capture starter only. Do not implement audio bytes, background recording, upload/library, speech, or translation provider behavior. Stop before P09.
~~~

## P09 — mobile recording

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P09 from:
docs/execution/phases/P09-mobile-recording.md

Required outcome:
Implement Android/iOS local-first microphone recording, pause/resume/end, interruptions, durable chunks, and physical-device qualification.

Direct dependencies that must already be VERIFIED with evidence: P08.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P09/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P09-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P09-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Mobile microphone capture only. Do not implement upload/library, speech/translation, hidden background guarantees, or system audio. Stop before P10.
~~~

## P10 — mobile sync recovery

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P10 from:
docs/execution/phases/P10-mobile-sync-recovery.md

Required outcome:
Implement authenticated mobile sync, Recovery Inbox UI/actions, truthful local/cloud state, library, and source playback.

Direct dependencies that must already be VERIFIED with evidence: P05 and P09.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P10/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P10-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P10-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Do not implement transcript review, speech/backfill, minutes/export, or permanent deletion. Do not fake P14 processing completion. Stop after P10.
~~~

## P11 — desktop rust foundation

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P11 from:
docs/execution/phases/P11-desktop-rust-foundation.md

Required outcome:
Create a secure Electron process split and supervised versioned Rust runtime with IPC conformance, P07 storage, and deterministic simulator.

Direct dependencies that must already be VERIFIED with evidence: P07.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P11/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P11-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P11-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
No real WASAPI, speech/local AI, editor/export, broad native capability, production signing, or updater. Simulator evidence cannot claim real capture. Stop before P12.
~~~

## P12 — windows audio capture

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P12 from:
docs/execution/phases/P12-windows-audio-capture.md

Required outcome:
Implement Windows microphone/WASAPI loopback capture with separate immutable source tracks, bounded realtime behavior, recovery, and two-hour hardware evidence.

Direct dependencies that must already be VERIFIED with evidence: P05 and P11.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P12/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P12-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P12-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Windows capture only. Do not implement speech/providers, macOS/Linux, source-destructive DSP, automatic device switching, or production signing. Stop before P13.
~~~

## P13 — speech deepgram

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P13 from:
docs/execution/phases/P13-speech-deepgram.md

Required outcome:
Implement provider-neutral speech contracts, an owner-bound Deepgram broker/adapter, client derived streaming, and idempotent final events.

Direct dependencies that must already be VERIFIED with evidence: P06, P09, and P12.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P13/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P13-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P13-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Realtime speech only. Do not implement backfill/completeness, translation, minutes, local Whisper, client master credentials, or automatic provider fallback. Stop before P14.
~~~

## P14 — finalization backfill

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P14 from:
docs/execution/phases/P14-finalization-backfill.md

Required outcome:
Implement immutable finalization manifests, storage verification, file backfill, deterministic reconciliation, speaker mapping, and truthful completeness.

Direct dependencies that must already be VERIFIED with evidence: P06, P10, and P13.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P14/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P14-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P14-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Do not implement translation, transcript editing, minutes, source deletion/mutation, or hidden gap waivers. Stop before P15/P28.
~~~

## P15 — translation

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P15 from:
docs/execution/phases/P15-translation.md

Required outcome:
Implement versioned Vietnamese-English translation with separate realtime/final states, provenance, policy, and bilingual evaluation.

Direct dependencies that must already be VERIFIED with evidence: P14.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P15/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P15-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P15-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Translation only for explicit meeting_translate mode. Do not implement mixed-language detection, arbitrary pairs, minutes, source replacement, client keys, or implicit provider fallback. Stop before P16.
~~~

## P16 — transcript review

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P16 from:
docs/execution/phases/P16-transcript-review.md

Required outcome:
Implement transcript projections/revisions, speaker mappings, search, bookmarks, evidence seek, virtualization, accessibility, and replay.

Direct dependencies that must already be VERIFIED with evidence: P14 and P15.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P16/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P16-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P16-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Do not mutate source audio/events, implement minutes/export, add collaboration, hide gaps, or add a search service without evidence and ADR. Stop before P17.
~~~

## P17 — ai provider platform

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P17 from:
docs/execution/phases/P17-ai-provider-platform.md

Required outcome:
Implement the capability-based generative provider registry, durable jobs, validation/citation boundary, prompt registry, budgets, and explicit provider switching.

Direct dependencies that must already be VERIFIED with evidence: P06, P14, and P16.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P17/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P17-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P17-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
AI platform only. Do not implement the five minutes templates/editor/export, client keys, autonomous tools/actions, source mutation, or unvalidated publication. Stop before P18.
~~~

## P18 — detailed minutes evaluation

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P18 from:
docs/execution/phases/P18-detailed-minutes-evaluation.md

Required outcome:
Implement five data-defined detailed minutes templates, immutable drafts, full-context accounting, uncertainty handling, and fixed bilingual quality gates.

Direct dependencies that must already be VERIFIED with evidence: P17.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P18/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P18-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P18-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Do not implement rich editing, branding/export, automatic publication, real meeting corpus, guessed facts, or tune against release holdout answers. Stop before P19.
~~~

## P19 — minutes editor

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P19 from:
docs/execution/phases/P19-minutes-editor.md

Required outcome:
Implement the safe structured minutes editor, conflict-safe autosave, citations, immutable history/restore, and AI rewrite proposals.

Direct dependencies that must already be VERIFIED with evidence: P18.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P19/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P19-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P19-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Do not implement export/branding, real-time collaboration, transcript/source mutation, arbitrary HTML/scripts, silent AI edits, or last-write-wins. Stop before P20.
~~~

## P20 — branding export library

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P20 from:
docs/execution/phases/P20-branding-export-library.md

Required outcome:
Implement safe brand presets, reproducible pinned exports in all required formats, secure downloads, and the complete personal meeting library.

Direct dependencies that must already be VERIFIED with evidence: P10 and P19.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P20/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P20-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P20-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Do not implement permanent deletion policy, public/team sharing, mutable-version exports, arbitrary renderer network/filesystem access, or new search infrastructure. Stop before P21.
~~~

## P21 — application security

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P21 from:
docs/execution/phases/P21-application-security.md

Required outcome:
Harden and independently verify application, native IPC, untrusted inputs, secrets, authorization, dependencies, SBOM, and supply chain.

Direct dependencies that must already be VERIFIED with evidence: P20.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P21/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P21-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P21-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Security remediation only. Do not add features/providers/formats, replace architecture broadly, weaken tests, log content, or accept unresolved critical/high findings. Stop before P22.
~~~

## P22 — privacy deletion governance

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P22 from:
docs/execution/phases/P22-privacy-deletion-governance.md

Required outcome:
Implement consent/provider disclosure, data inventory, soft delete/restore, permanent deletion saga, local cleanup, and backup-aging governance.

Direct dependencies that must already be VERIFIED with evidence: P21.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P22/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P22-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P22-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Do not implement enterprise legal hold/admin retention, new providers, production backup infrastructure, or destructive paths outside the authorized deletion workflow. Stop before P23.
~~~

## P23 — observability support

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P23 from:
docs/execution/phases/P23-observability-support.md

Required outcome:
Implement content-free telemetry, correlation, dashboards/SLOs, alerts, support bundles, canaries, and incident exercises.

Direct dependencies that must already be VERIFIED with evidence: P22.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P23/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P23-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P23-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Do not add content analytics, product tracking, new logging vendors, production deployment, or instrumentation that can block recording. Stop before P24.
~~~

## P24 — resilience performance a11y

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P24 from:
docs/execution/phases/P24-resilience-performance-a11y.md

Required outcome:
Qualify the feature-complete product through two-hour, fault, performance, accessibility, localization, and supported-platform matrices.

Direct dependencies that must already be VERIFIED with evidence: P23.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P24/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P24-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P24-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Qualification and regression-backed release-blocker fixes only. Do not add features/platforms, redesign architecture/UI, lower thresholds, quarantine critical tests, or include optional P28. Stop before P25.
~~~

## P25 — deployment backup dr

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P25 from:
docs/execution/phases/P25-deployment-backup-dr.md

Required outcome:
Implement and verify production-shaped deployment, migrations, secrets, backups, restore, disaster recovery, and rollback.

Direct dependencies that must already be VERIFIED with evidence: P24.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P25/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P25-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P25-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Backend/platform delivery only. Do not implement desktop/mobile distribution, P26 signing/updater, Kubernetes without ADR, product features, or commit secrets. Stop before P26.
~~~

## P26 — packaging signing updates

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P26 from:
docs/execution/phases/P26-packaging-signing-updates.md

Required outcome:
Produce signed Windows/Android/iOS artifacts, verified Electron/Rust bundles, controlled update channels, and interruption-safe upgrade evidence.

Direct dependencies that must already be VERIFIED with evidence: P25.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P26/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P26-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P26-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Packaging/signing/update only. Do not add features, macOS builds, backend deployment, marketing/store-launch content, expose signing keys, or erase local evidence. Stop before P27.
~~~

## P27 — production qualification

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P27 from:
docs/execution/phases/P27-production-qualification.md

Required outcome:
Freeze and qualify one immutable release candidate, deploy production, run canary/beta rollout, monitor, rehearse rollback, and make independent go/no-go.

Direct dependencies that must already be VERIFIED with evidence: P26.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P27/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P27-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P27-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
No new features, P28, new platform/provider, threshold reduction, test quarantine, mutable rebuild, or release with critical/high findings. Only this phase may mark RELEASED; stop after the release/no-go handoff.
~~~

## P28 — local ai import extension

Copy the entire block into one new conversation:

~~~text
Execute exactly phase P28 from:
docs/execution/phases/P28-local-ai-import-extension.md

Required outcome:
Optionally implement verified local speech model lifecycle and immutable audio import through the existing evidence/finalization pipeline.

Direct dependencies that must already be VERIFIED with evidence: P14.

Target the strongest truthful terminal state: VERIFIED when every acceptance gate has direct evidence; otherwise IMPLEMENTED or BLOCKED exactly as defined by docs/execution/EXECUTION_PROTOCOL.md. Do not stop merely because code was written.

Mandatory execution rules:
1. Invoke and follow superpowers:using-superpowers. Use superpowers:subagent-driven-development for independent work packages, superpowers:test-driven-development for implementation, superpowers:systematic-debugging for every unexpected failure, and superpowers:verification-before-completion before any completion claim.
2. Read completely before editing: AGENTS.md, docs/execution/EXECUTION_PROTOCOL.md, docs/execution/MASTER_PLAN.md, docs/execution/PROGRESS.md, this phase packet, and every document named in its Authoritative context.
3. Inspect current Git/source/migrations/tests/evidence. Inventory and preserve every pre-existing dirty or untracked file; never reset or discard user work.
4. If any direct dependency is not VERIFIED or lacks evidence, report the exact blocker and stop. Never implement another phase to make this phase green.
5. Create docs/execution/evidence/P28/RUN-YYYYMMDD-HHMM.md from RUN_TEMPLATE.md. Resolve current paths, lock the unchanged task checklist, and allocate only non-overlapping packet work packages.
6. Execute every P28-Tnn task using: inspect -> failing narrow test/check -> confirm expected failure -> smallest coherent production change -> narrow pass -> root-cause debug -> regression -> related tests -> specification review -> quality/security review -> checkpoint.
7. The main agent owns integration and the complete phase gate. A subagent report is not evidence. A command running zero intended tests is a failure.
8. Never use real meeting content, commit secrets, log content, fake provider/device/signing/manual evidence, weaken assertions/thresholds, mutate finalized source evidence, or make recording depend on network/AI.
9. Update STATUS.md, TRACEABILITY.md, PROGRESS.md, and evidence only after direct verification. Map every P28-Ann criterion to a real test/scenario/artifact.
10. Finish with HANDOFF_TEMPLATE.md: outcome/state, satisfied and unsatisfied acceptance IDs, changed files, contracts/migrations, commands + exit codes + test counts, manual/device/provider evidence, defects/root causes/regressions, residual risks, exact owner action if blocked, and newly unblocked phase.

Phase-specific boundary:
Optional extension only. Do not weaken or block P27, promise unsupported diarization, add mixed-language detection, run arbitrary models, silently use cloud, import video, or overwrite existing source. Stop after the optional-release handoff.
~~~

