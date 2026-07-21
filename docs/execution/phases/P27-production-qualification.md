---
phase: P27
title: Production qualification, beta rollout, and personal release
status: NOT_STARTED
depends_on: [P26]
requirements: [PRD-Release-Acceptance, NFR-Reliability, NFR-Security, NFR-Privacy]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

One immutable release candidate passes the complete current production matrix, deploys through the approved pipeline, serves the intended personal user through signed channels, survives canary/beta monitoring and rollback exercises, and has zero unresolved critical/high data-loss or security defects. Only this phase may set the personal release to `RELEASED`.

# Authoritative context

Read the complete PRD, User Flows, Test Strategy, Security/Privacy, Deployment Runbook, all accepted ADRs, `STATUS.md`, `TRACEABILITY.md`, and evidence summaries P00-P26. Recheck direct raw artifacts for critical gates rather than trusting summaries alone.

# Preconditions and external prerequisites

- P26 is `VERIFIED`; every P00-P26 ledger entry and required evidence file is internally consistent.
- Approved production account, DNS/TLS, IdP, provider contracts/regions, budgets, privacy/consent text, signing identities, internal/beta distribution access, support owner, and go/no-go authority are available.
- A fixed release candidate commit and artifact manifest is frozen; no unreviewed change may enter after qualification starts.
- Missing legal/business/provider/store/production approval yields `BLOCKED`; it cannot be replaced by staging evidence.

# Scope firewall

## In scope

Evidence audit, release-candidate freeze, clean staging rehearsal, full supported release matrix, production deployment, synthetic canary, signed-channel beta rollout, monitoring/support watch, rollback exercise, known-limitations and final release record.

## Out of scope

New features, optional P28, new platforms/providers, architecture changes, scope reduction, cosmetic redesign, and unresolved critical/high risk acceptance.

## Allowed paths

Release manifests/workflows/config, qualification tests/evidence, bounded release-blocking fixes with regression, user-facing release/privacy/limitations docs, and ledgers/status.

## Forbidden paths

Feature expansion, threshold/assertion reduction, critical test quarantine, use of real meeting content in automation, unapproved provider/region changes, and mutable rebuild of promoted artifacts.

## Extension seams

The release record pins interfaces/configs while allowing later versions through new phases and migration-compatible releases; it does not freeze the architecture permanently.

# Contracts and invariants

- `ProductionReleaseRecordV1` pins release ID, source commit, artifact hashes/signatures, schema/prompt/provider policy versions, environment/config digest, qualification report, approvals, rollout windows, known limitations, and rollback target.
- The promoted artifact is byte-identical to the signed, qualified artifact.
- Production smoke/canary uses synthetic meetings only and content-free assertions.
- Go/no-go criteria are binary; no critical/high data-loss/security finding can be accepted.
- Rollout pauses automatically/on-call action when integrity, auth, crash, finalization, deletion, or SLO thresholds breach.

# File and ownership map

| Path | Responsibility | Task owner |
|---|---|---|
| release manifest/config | Frozen RC and production record | Release package |
| qualification harness/evidence | Full matrix and raw artifact audit | Quality package |
| deployment/rollout workflows | Promotion, canary, staged release, rollback | Operations package |
| release/privacy/limitations docs | User and support readiness | Product/support package |
| affected product paths | Only regression-backed release blockers | Owning implementer |
| `docs/execution/evidence/P27/` | Final evidence and approvals | Independent reviewer |

# Ordered task packets

## P27-T01 - Audit phase evidence and freeze the release candidate

Validate P00-P26 dependencies, task/acceptance completion, raw critical artifacts, open defects/risks, migrations, SBOMs, signatures, policies, support matrix, and external approvals. Generate/freeze `ProductionReleaseRecordV1`; fail on missing/stale/mismatched evidence. Evidence: `evidence/P27/evidence-audit.json`.

## P27-T02 - Clean production-like staging rehearsal

From a clean checkout build the frozen artifacts, deploy via P25, migrate seeded N-1 state, install signed clients, configure real staging providers, run synthetic smoke, roll back, redeploy, and prove artifact/config identity. Evidence: `evidence/P27/staging-rehearsal.json`.

## P27-T03 - Full critical user-journey and fault matrix

Rerun Vietnamese/English meeting-only/translation flows on supported Windows/Android/iOS: start, 2h capture, pause, network/provider loss, device interruption, crash recovery, sync, finalization/backfill, review/correction, detailed minutes, rewrite, branding/export, library/search, soft delete/restore/permanent delete. Evidence: `evidence/P27/release-matrix.json`.

## P27-T04 - Final security, privacy, supply-chain, and data-integrity gate

Rerun two-user route/object/job/export tests, secret/content scans, dependency/SAST/SBOM review, IPC/tamper/signature tests, processor disclosure/consent, deletion and backup-aging checks, and source/derived mutation negatives against the frozen RC. Evidence: `evidence/P27/final-assurance-report.json`.

## P27-T05 - Production deployment and synthetic canary

Promote the immutable RC through approved production workflow, verify migrations/health/telemetry/alerts, then run a synthetic meeting canary through deletion. Record release IDs and aggregate outcomes only. Stop/rollback on any gate breach. Evidence: `evidence/P27/production-canary.json`.

## P27-T06 - Staged signed-client beta rollout

Release to the approved smallest internal/personal cohort, run signed-client compatibility/smoke tests, verify signatures/channel versions/API compatibility, monitor crash-free sessions and capture/finalization/recovery/provider/export/deletion SLOs, and expand only after the defined observation window. Evidence: `evidence/P27/beta-rollout.json`.

## P27-T07 - Operational watch, support, incident, and rollback exercise

Run operational exercise tests for alert acknowledgement, safe support bundle, provider kill switch, worker backlog recovery, desktop update pause, mobile feature flag, service rollback, and restore escalation. Confirm owners/contact paths and known-limitations copy. Evidence: `evidence/P27/operational-watch.md`.

## P27-T08 - Independent go/no-go and release state transition

An independent reviewer checks the frozen record against every PRD release criterion and acceptance artifact, confirms zero unresolved critical/high defects, validates external approvals and observation window, and signs go/no-go. On go, update capability states to `RELEASED`; on no-go, preserve state and exact blockers. Evidence: `evidence/P27/EVIDENCE.md`.

# Subagent work packages

| Package | Task IDs | Exclusive paths | Depends on | Review gate | Output |
|---|---|---|---|---|---|
| Evidence/release | T01 | release manifest + audit | P26 | independent evidence review | frozen RC |
| Quality/assurance | T02-T04 | qualification tests/evidence | T01 | full matrix/security review | rehearsal/matrix |
| Operations/rollout | T05-T07 | production/rollout config | T02-T04 | approval/SLO review | production evidence |
| Independent go/no-go | T08 | evidence/ledgers only | all | final authority review | release decision |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Content-free diagnostics | Recovery/regression |
|---|---|---|---|---|
| RC changes after freeze | contract | Invalidate qualification and restart audit | old/new release hashes | immutability check |
| Production canary/SLO fails | environment/state | Pause rollout and rollback/repair | release/safe error/SLO | canary regression |
| Critical journey intermittently fails | timing | No release; isolate and fix root cause | scenario/device/timestamps | stress regression |
| External approval missing | environment | Block exact release gate | approval type/owner | rerun after approval |
| Critical/high finding | security | No risk acceptance for release; remediate | finding ID/class | full assurance rerun |

# Integrated verification

Run clean `pnpm verify:release`, all static/unit/property/contract/integration/E2E/security/resilience/performance suites, Rust release checks, signed package/update matrix, migration/backup/restore/deletion drills, full manual device/provider/a11y matrix, staging rehearsal, production canary, and rollout monitoring. All artifacts must match the frozen release ID.

# Acceptance gate

- [ ] P27-A01 - Evidence audit maps every PRD release criterion and P00-P26 acceptance gate to current direct artifacts.
- [ ] P27-A02 - Frozen RC passes clean staging rehearsal, rollback, and full supported journey/fault matrix.
- [ ] P27-A03 - Final assurance has zero unresolved critical/high data-loss or security finding and no secret/content leak.
- [ ] P27-A04 - Production deployment/canary passes with correct migrations, telemetry, alerts, backup, and deletion behavior.
- [ ] P27-A05 - Signed-client staged rollout meets the accepted observation window and SLO thresholds.
- [ ] P27-A06 - Support, incident, rollback, privacy, provider, signing, and business approvals are present.
- [ ] P27-A07 - Independent go/no-go signs the immutable release record before any `RELEASED` state update.

# Migration, rollout, and rollback

Use the P25 pipeline and P26 channels without rebuilding. Roll out to the smallest cohort, observe, then expand. Pause/rollback on integrity/auth/crash/finalization/deletion/SLO breach. Application rollback must preserve schema/client compatibility and local source evidence; provider/optional work uses kill switches.

# Required documentation updates

Update `STATUS.md` to `RELEASED` only on signed go, `PROGRESS.md`, `TRACEABILITY.md`, changelog/release notes, supported versions/known limitations, operations contacts/runbooks, privacy/provider disclosures, and P27 evidence.

# Handoff record

Use `templates/HANDOFF_TEMPLATE.md`. Report release/no-go and stop. P28 remains optional and is not automatically started.
