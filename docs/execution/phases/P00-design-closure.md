---
phase: P00
title: Design closure and repository baseline
packet_status: ACCEPTED
depends_on: []
requirements: [FR-1..7, NFR-All, PRD-Release-Acceptance, ADR-001..006]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

All decisions required to implement P01-P27 are accepted or explicitly provisional with an owner and release deadline. Maintained documents agree on product scope, supported platforms, capture profile, privacy/retention, identity/provider/infrastructure policy, and repository truth. The initial baseline preserves all pre-existing work and contains no product implementation introduced by this phase.

# Authoritative context

Read every maintained file under `docs/`, root governance files, package manifests/lockfile, current source/tests, and Git state. Read the complete Meetily review only as clean-room research. Precedence: accepted ADRs, focused product/architecture/security docs, this packet, consolidated plan, prototype code.

# Preconditions and external prerequisites

- Repository and `.git` are readable; current untracked/dirty files can be inventoried without reset.
- No cloud account, paid provider, credential, device, or production data is required.
- Product/legal decisions may use conservative provisional engineering defaults only when the owner, approval needed, and beta deadline are explicit.
- If the owner rejects a required default and provides no alternative, finish `BLOCKED` at the affected decision ID; do not invent approval.

# Dependency gate

| Dependency | Required capability                               | Required evidence | Minimum lifecycle |
| ---------- | ------------------------------------------------- | ----------------- | ----------------- |
| None       | Root phase; no dependency capability is consumed. | Not applicable    | VERIFIED          |

# Scope firewall

**In scope:** repository/doc/test inventory, decision reconciliation, support/capture/privacy/provider/infrastructure defaults, ADR creation/supersession, traceability, and reviewed initial baseline.

**Out of scope:** product code, dependency installation/upgrades, infrastructure provisioning, UI/code scaffolding, real provider/device tests, and any P01+ task.

**Allowed paths:** `docs/`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `.gitignore`, and Git metadata needed for the reviewed baseline.

**Forbidden paths:** implementation changes under `apps/` or `packages/`, generated dependencies, credentials, and destructive Git operations.

**Extension seams:** supported-platform, provider, retention, and infrastructure decisions state review triggers instead of pre-implementing future variants.

# Contracts and invariants

## Locked engineering defaults

- Personal release: Windows 11 23H2+ x64, Android 12+, iOS 17+; macOS system audio is post-beta.
- UI and meeting content support Vietnamese/English; meeting language is explicitly one of `vi | en`.
- Singapore/APAC is the deployment preference where selected services support it; every external processing region is disclosed.
- Soft delete defaults to 30 days; backup expiry target is 35 days after permanent deletion, subject to provider capability/legal approval.
- Cross-provider fallback is off. Provider allowlists and account budget/concurrency caps are mandatory before external beta.
- Microphone/system source tracks remain separate. `capture-profile-v1` is selected through a documented benchmark.

# File and ownership map

| Path                                    | Responsibility                                                     | Owner                     |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------- |
| `docs/product/`, `docs/ROADMAP.md`      | Product scope, flows, approvals, release outcomes                  | Product audit             |
| `docs/architecture/`, `docs/decisions/` | Technical defaults, capture profile, boundaries, review triggers   | Architecture/audio audit  |
| `docs/security/`, `docs/operations/`    | Consent, retention, provider, secret, environment, recovery policy | Security/operations audit |
| `docs/execution/` and `docs/STATUS.md`  | Phase alignment, traceability, repository truth                    | Main agent                |
| root governance/manifests               | Baseline/license/tooling inventory only                            | Repository audit          |

# Ordered task packets

## P00-T01 - Inventory repository truth and contradictions

Run `git status --short --branch`, `git log -5 --oneline`, `rg --files`, manifest/license inventory, current scripts/tests, and a maintained-doc status scan. Record every untracked/dirty file, prototype capability, absent production capability, false-green script, encoding/link issue, and doc/code conflict. The check must fail if any file is unclassified. Do not edit product code. Evidence: `docs/execution/evidence/P00/repository-audit.md`.

## P00-T02 - Accept support, language, and UX platform matrix

Reconcile PRD/User Flows/Roadmap/Tech Stack into one table covering Windows/Android/iOS minimums, hardware/application test classes, UI locales, meeting languages/modes, permissions, background limitations, and post-beta platforms. Add owner/review trigger for every provisional entry. Validate that every release matrix mentioned later has a supported target. Evidence: `support-matrix.md`.

## P00-T03 - Define and accept `capture-profile-v1`

Document container/codec, native and normalized sample rates, bit depth/channel policy, separate source tracks, benchmarked 5- or 10-second chunks, stable IDs, monotonic clock, pause/gap/drift semantics, buffer limits, fsync/checksum/atomic-manifest order, and derived mix. Verification reviews the synthetic benchmark procedure, decision rule, boundary coverage, and ADR consistency without fabricating measurements. Evidence: `capture-profile-v1.md`.

## P00-T04 - Accept privacy, consent, retention, and telemetry defaults

Create a decision register for consent copy/version owner, provider disclosure, soft delete, local cache, permanent deletion, provider deletion capability, backup aging, data export, incident retention, telemetry allowlist, jurisdiction/legal approvals, and deadlines. Verification maps every PRD/Security/Data Model/Operations/P22 policy item to one register row and fails on an unowned decision. Evidence: `privacy-approval-register.md`.

## P00-T05 - Accept infrastructure, identity, provider, and cost policy

Define infrastructure classes/region preference, OIDC issuer/audience/PKCE/JWKS/secure-storage contract, secret ownership, S3/PostgreSQL/Redis/telemetry classes, Deepgram and generative/translation allowlists, residency/training review, explicit cross-provider switching, budgets/concurrency, production account/signing owners, RPO/RTO, and selection triggers. Vendors remain replaceable behind accepted contracts. Evidence: `platform-approval-register.md`.

## P00-T06 - Reconcile maintained docs and create reviewed baseline

Update all affected docs/ADRs/roadmap/status/traceability/phase metadata atomically. Run the doc validation gate below and independently review `git diff`/untracked inventory for accidental product edits or secrets. If no commit exists, stage the complete reviewed baseline—not a partial subset—and create the initial commit only after the owner-approved inventory matches. Evidence: `docs/execution/evidence/P00/baseline-report.md` with tree/commit and preserved changes.

# Subagent work packages

| Package                   | Task IDs | Exclusive paths                 | Review gate                    | Output                     |
| ------------------------- | -------- | ------------------------------- | ------------------------------ | -------------------------- |
| Repository/product audit  | T01,T02  | product/roadmap/status evidence | completeness review            | repository/support reports |
| Architecture/audio audit  | T03      | architecture/ADR evidence       | realtime/data-loss review      | capture profile            |
| Security/operations audit | T04,T05  | security/operations evidence    | privacy/secret/provider review | approval registers         |
| Main integration          | T06      | shared docs/governance/Git      | independent diff/link review   | accepted baseline          |

# Failure and debugging matrix

| Failure                         | Classification | Expected behavior                                                         | Diagnostics/recovery             |
| ------------------------------- | -------------- | ------------------------------------------------------------------------- | -------------------------------- |
| Maintained docs conflict        | contract       | Resolve by precedence and ADR; never silently choose                      | cite both locations and decision |
| Required approval absent        | environment    | Conservative provisional default only with owner/deadline, else `BLOCKED` | approval register                |
| User changes overlap            | state          | Preserve and separate current edits; no reset                             | dirty-file inventory/diff        |
| Initial commit would omit files | persistence    | Stop and reconcile full reviewed baseline                                 | staged-vs-inventory check        |
| Link/encoding validator fails   | contract       | Locate source and fix maintained doc                                      | exact file/line/report           |

# Integrated verification

- `git status --short --branch` and, after approved baseline, `git log -1 --oneline`/`git show --stat --oneline HEAD`; every file matches inventory.
- Run the repository's link/UTF-8/phase-metadata validator; expected zero broken links, replacement characters, duplicate IDs, missing phase files, or dependency mismatches.
- Search maintained docs for conflicting `mixed` language, source mutation, streaming-only recording, client provider keys, Electron-only native capture, and skipped production-hardening claims.
- Independent manual map of every PRD open approval to a safe default, owner, required approval, and deadline.

| Gate                  | Command                                              | Intended signal                                                                 | Evidence                   |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `node scripts/execution/validate-execution-plan.mjs` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P00/EVIDENCE.md` |

# Acceptance gate

- [ ] P00-A01 - Complete repository baseline/tree and all pre-existing changes are recorded and reviewed.
- [ ] P00-A02 - Support/capture/privacy/retention/identity/provider/infrastructure decisions are accepted or provisionally owned with deadlines.
- [ ] P00-A03 - Focused docs, ADRs, master plan, progress, traceability, and status are consistent and link-valid.
- [ ] P00-A04 - No product code, dependency upgrade, paid resource, credential, or fabricated benchmark/approval was introduced.

# Migration, rollout, and rollback

Documentation changes revert by focused commit. Accepted decisions are superseded by a new ADR, never rewritten to hide history. The initial baseline is not rewritten after later phase work.

# Required documentation updates

All changed authoritative docs, `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`, and `evidence/P00/`.

# Conversation boundary

Documentation/governance only. Do not implement product code, install or upgrade dependencies, provision paid resources, or create a partial baseline commit. Stop before P01.

# Handoff record

Use `templates/HANDOFF_TEMPLATE.md`. Unblock P01 only.
