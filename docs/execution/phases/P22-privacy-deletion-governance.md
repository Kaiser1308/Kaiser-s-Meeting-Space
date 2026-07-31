---
phase: P22
title: Privacy, consent, retention, and deletion governance
packet_status: ACCEPTED
depends_on: [P21]
requirements: [FR-7, NFR-Privacy, NFR-Security]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

The personal user sees and can prove the consent, provider-disclosure, retention, recovery, export, and deletion policy applied to each meeting. Soft deletion is reversible during the approved window; permanent deletion idempotently removes database rows, object storage, exports, provider-held artifacts where supported, and local caches, while backup aging is tracked truthfully.

# Authoritative context

Read `docs/product/PRD.md` sections 4-7, `docs/product/USER_FLOWS.md` sections 1, 6, and 7, `docs/architecture/DATA_MODEL.md`, `docs/security/SECURITY_AND_PRIVACY.md`, `docs/operations/DEPLOYMENT_AND_RUNBOOK.md`, ADR-002, P20 evidence, and P21 threat-model/security evidence.

# Preconditions and external prerequisites

- P21 is `VERIFIED`; no critical/high security finding remains.
- P00 has approved exact soft-delete window, backup-expiry target, consent text owner, privacy jurisdiction, and provider-disclosure policy.
- Test PostgreSQL/object storage, mobile/desktop private storage, and configured provider deletion/export APIs are available.
- If legal/product policy approval or a provider's documented deletion capability is unavailable, implement and verify code paths that do not depend on it, then finish `BLOCKED` against the affected acceptance IDs. Never invent legal approval or provider deletion confirmation.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P21        | Verified outputs and invariants consumed by this packet. | `../evidence/P21/EVIDENCE.md` | VERIFIED          |

# Scope firewall

## In scope

Versioned policy/consent records, provider disclosures, data inventory/export, soft delete/restore, permanent deletion orchestration, local-cache cleanup, provider cleanup tracking, tombstones, backup-aging verification, user-facing status, and privacy tests.

## Out of scope

Enterprise retention/legal holds, team administrators, litigation discovery, anonymous analytics expansion, new providers, and production backup infrastructure implementation (P25).

## Allowed paths

`packages/domain/src/privacy/`, `packages/database/src/privacy/`, privacy/deletion migrations, `apps/api/src/modules/privacy/`, `apps/worker/src/deletion/`, mobile/desktop account/recently-deleted surfaces, privacy fixtures/tests, and focused privacy/operations docs.

## Forbidden paths

Capture/transcription/minutes algorithms, broad authentication redesign, unrelated UI, and direct destructive scripts outside the deletion worker/repository boundary.

## Extension seams

Retention policy and external-processor cleanup use versioned capability interfaces so future jurisdictions, workspaces, or legal holds can add policy without weakening personal-owner authorization.

# Contracts and invariants

- `PrivacyPolicySnapshotV1` records policy version, consent-copy version, retention class, recovery deadline, provider disclosures, locale, and acceptance timestamp; it contains no meeting content.
- `DeletionRequestV1` requires `ownerId`, `meetingId`, `requestedAt`, `policyVersion`, `idempotencyKey`, and recent reauthentication evidence for permanent deletion.
- `DeletionState = soft_deleted | queued | deleting | awaiting_backup_expiry | complete | failed_retryable | failed_terminal`.
- `ProcessorDeletionResult` records processor, capability, request reference/hash, status, and timestamp without provider credentials or content.
- Source evidence is immutable until the authorized permanent-deletion workflow; generic repositories still cannot delete it.
- A deletion tombstone retains only opaque IDs, policy version, safe counts, completion state, and timing required to prove deletion.

# File and ownership map

| Path                                                | Responsibility                                            | Task owner           |
| --------------------------------------------------- | --------------------------------------------------------- | -------------------- |
| `packages/domain/src/privacy/`                      | Policy, consent, inventory, and deletion contracts        | Policy package       |
| `packages/database/src/privacy/` and migrations     | Tombstones, policy snapshots, and deletion repositories   | Persistence package  |
| `apps/api/src/modules/privacy/`                     | Owner-authorized privacy/export/delete/restore API        | API package          |
| `apps/worker/src/deletion/`                         | Idempotent deletion saga and processor cleanup            | Deletion package     |
| `apps/mobile/` and `apps/desktop/` privacy surfaces | Disclosure, Recently Deleted, progress, and local cleanup | Client package       |
| `tests/privacy/`                                    | Cross-store, two-user, retry, and backup-aging matrix     | Independent reviewer |

# Ordered task packets

## P22-T01 - Versioned privacy policy, consent, and processor disclosure

Define runtime schemas and persistent snapshots; render current consent/provider disclosures before recording and when provider policy changes. Add failing contract/UI tests for missing version, unapproved processor, locale fallback, and silent cross-provider fallback. Run domain contract and client component suites; evidence: `evidence/P22/policy-consent-report.json`.

## P22-T02 - Data inventory and portable account/meeting export

Implement owner-scoped inventory endpoints that enumerate data classes, versions, storage locations by abstract class, providers, retention state, and export eligibility without returning internal object paths. Test two-user denial, pagination, deleted state, and content-free logs. Evidence: `evidence/P22/inventory-contract-report.json`.

## P22-T03 - Soft delete and restore window

Implement optimistic, idempotent soft delete/restore transitions and Recently Deleted UI. Start with failing state/property and E2E tests for duplicate requests, restore-at-boundary, expired window, offline cached state, and concurrent processing. Ensure processing/jobs stop publishing new derived artifacts after soft delete. Evidence: `evidence/P22/soft-delete-matrix.json`.

## P22-T04 - Authorized permanent-deletion command

Require owner scope, recent reauthentication, explicit confirmation, policy snapshot, and idempotency key. Atomically create a tombstone and deletion job; do not synchronously erase partial stores from the API request. Test replay, stale auth, wrong owner, active export, and race with restore. Evidence: `evidence/P22/delete-command-report.json`.

## P22-T05 - Idempotent cross-store deletion saga

Implement ordered, restart-safe deletion of exports/derived objects, source objects, database children, provider-held artifacts where supported, and final metadata while preserving the minimal tombstone. Persist per-step status before advancing. Inject failure before/after every store operation; prove retry reaches one canonical result and never deletes another meeting. Evidence: `evidence/P22/deletion-fault-matrix.json`.

## P22-T06 - Local cache and multi-client cleanup

Deliver deletion events to authenticated clients; remove cached audio/metadata only after matching owner/meeting/tombstone and preserve unrelated recovery sessions. Test offline client reconnect, reused local identifiers, app reinstall, missing files, and failed secure erase disclosure. Evidence: `evidence/P22/local-cleanup-matrix.json`.

## P22-T07 - Backup-aging and processor-completion ledger

Add a verifier that tracks the policy deadline and confirms synthetic deleted records age out of documented backup/object versions without reading content. Record processors that cannot offer deletion confirmation as disclosed residual state. Test clock boundaries, delayed backup expiry, provider retry, and content-free reports. P25 supplies production backup execution; this task proves the contract/harness. Evidence: `evidence/P22/backup-aging-contract.json`.

## P22-T08 - Integrated privacy and deletion drill

Run one synthetic meeting through consent, provider use, data inventory, soft delete, restore, permanent delete, worker restart, local-client reconnect, and aging simulation. Review all user copy, logs, traces, tombstones, objects, and database rows. Fix root causes and rerun the entire drill. Evidence: `evidence/P22/EVIDENCE.md` plus machine-readable drill report.

# Subagent work packages

| Package           | Task IDs | Exclusive paths              | Depends on    | Review gate                 | Output                 |
| ----------------- | -------- | ---------------------------- | ------------- | --------------------------- | ---------------------- |
| Policy/API        | T01-T04  | domain privacy + API privacy | P21 contracts | spec/auth review            | contracts/routes/tests |
| Deletion saga     | T05,T07  | worker + DB privacy          | T04           | restart/idempotency review  | saga/harness           |
| Client cleanup    | T03,T06  | mobile/desktop privacy UI    | T01,T04       | privacy UX review           | UI/local cleanup       |
| Independent drill | T08      | tests/evidence only          | all tasks     | cross-store/security review | final report           |

# Failure and debugging matrix

| Failure                                    | Classification | Expected behavior                                           | Content-free diagnostics     | Recovery/regression      |
| ------------------------------------------ | -------------- | ----------------------------------------------------------- | ---------------------------- | ------------------------ |
| Worker dies between object and DB deletion | persistence    | Resume from recorded step; no resurrection                  | deletion ID, step, attempt   | crash at every boundary  |
| Provider lacks deletion API                | provider       | Disclose limitation and track policy; do not claim deletion | provider capability/status   | capability contract test |
| Restore races permanent deletion           | concurrency    | One version-checked transition wins                         | tombstone/version IDs        | concurrent property test |
| Offline device retains cache               | state          | Cleanup on authenticated reconnect; UI remains truthful     | device pseudonym, meeting ID | reconnect E2E            |
| Backup deadline missed                     | environment    | Alert and block completion claim                            | policy version/deadline      | aging drill              |

# Integrated verification

## Automated commands

Run `pnpm test:contract -- --project privacy`, `pnpm test:integration -- --project deletion`, `pnpm test:security -- --suite privacy`, client deletion E2E suites, `pnpm test:resilience -- --suite deletion`, and `pnpm verify`. Every command must execute intended tests and exit 0.

## Manual/platform/provider matrix

Review consent/disclosure/delete copy in Vietnamese and English on supported Windows and Android. Exercise every configured external processor with synthetic data; mark unavailable real capabilities as blockers.

## Security, privacy, and data-integrity review

Prove recent reauthentication, two-user denial, minimal tombstone data, no content in diagnostics, no source deletion outside the saga, and no undeclared processor transfer.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P22/EVIDENCE.md` |

# Acceptance gate

- [ ] P22-A01 - Every meeting has a resolvable policy/consent/provider-disclosure snapshot.
- [ ] P22-A02 - Soft delete/restore is idempotent and boundary-correct.
- [ ] P22-A03 - Permanent deletion removes every intended active-store artifact exactly once and preserves only the approved tombstone.
- [ ] P22-A04 - Offline client caches and external-processor cleanup are truthful and tracked.
- [ ] P22-A05 - Backup-aging contract/drill proves the approved deadline or records a release-blocking external gap.
- [ ] P22-A06 - Two-user, reauthentication, logging, and race tests pass with no critical/high finding.

# Migration, rollout, and rollback

Deploy policy/tombstone schema and read paths before enabling deletion commands. Start with soft delete; enable permanent deletion only after restore and fault drills. Roll back command intake while allowing already-created deletion jobs to finish; never restore data after an authorized irreversible step.

# Required documentation updates

Update privacy/security policy, data model, API contracts, user flows, operations retention table, `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`, and P22 evidence.

# Conversation boundary

Do not implement enterprise legal hold/admin retention, new providers, production backup infrastructure, or destructive paths outside the authorized deletion workflow. Stop before P23.

# Handoff record

Use `templates/HANDOFF_TEMPLATE.md`. Unblock P23 only; do not start it.
