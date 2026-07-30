---
phase: P25
title: Production deployment, migration, backup, restore, and disaster recovery
packet_status: ACCEPTED
depends_on: [P24]
requirements: [NFR-Reliability, NFR-Security, NFR-Observability, FR-7]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

The API, workers, PostgreSQL, object storage, queue, telemetry, and provider configuration deploy reproducibly to staging and the selected production environment with validated secrets, backward-compatible migrations, encrypted backups, point-in-time/object recovery, tested rollback, and measured RPO/RTO.

# Authoritative context

Read `docs/operations/DEPLOYMENT_AND_RUNBOOK.md`, System Architecture, Tech Stack, Security/Privacy, Development Guide, ADR-005, P22 deletion/backup-aging evidence, P23 observability evidence, and P24 qualification evidence.

# Preconditions and external prerequisites

- P24 is `VERIFIED` with zero critical/high release-blocking defects.
- P00 has accepted infrastructure classes, cloud region, identity provider, secret manager, DNS/TLS owner, provider allowlist, budgets, RPO <=15 minutes, and RTO <=4 hours or superseding accepted values.
- Authorized staging and production-like accounts, restricted service identities, encryption keys, backup vault, DNS/TLS, and deployment approval are available.
- If production credentials/approval are withheld, staging and local drills continue, then the phase ends `IMPLEMENTED`/`BLOCKED` for production-only acceptance IDs.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P24        | Verified outputs and invariants consumed by this packet. | `../evidence/P24/EVIDENCE.md` | VERIFIED          |

# Scope firewall

## In scope

Infrastructure/deployment definitions, immutable service images, environment config validation, secret references/rotation, migration sequencing, staging/production pipeline, encrypted database/object backups, restore/DR drills, rollback, synthetic smoke, and operational evidence.

## Out of scope

Desktop/mobile distribution, signing/updater (P26), Kubernetes without an ADR, multi-region active-active, enterprise compliance certification, and product features.

## Allowed paths

`infra/`, `ops/deploy/`, container build files, deployment workflows, config schemas, migration tooling, backup/restore/DR scripts, synthetic smoke tests, and focused operations/security docs.

## Forbidden paths

Secrets or key material, meeting content, destructive production commands without target/approval guards, provider-specific domain logic, and unreviewed infrastructure services.

## Extension seams

Deployment environments use typed inputs and provider modules so cloud vendors can change without altering domain/storage contracts.

# Contracts and invariants

- Every artifact has release ID, source commit/tree, dependency lock hash, schema/prompt version set, SBOM reference, and build provenance.
- Environment config validates at startup and prints only safe variable names/error codes.
- Deploy order supports N-1 clients/services; schema uses expand/migrate/contract sequencing.
- Backup encryption keys are distinct from application credentials and restore access is least-privilege/audited.
- Restore verification uses synthetic records, row/object counts, manifest/checksum matches, jobs, tombstones, and policy dates; never production content assertions.
- Destructive/production operations require exact environment/resource resolution and explicit approved workflow gates.

# File and ownership map

| Path                             | Responsibility                                                                | Task owner             |
| -------------------------------- | ----------------------------------------------------------------------------- | ---------------------- |
| `infra/`                         | Versioned environment resources, identities, network, storage, and monitoring | Infrastructure package |
| container/deploy workflows       | Reproducible builds, provenance, promotion, and approvals                     | Delivery package       |
| config/secret integration        | Typed environment contract and secret references                              | Security package       |
| migration tooling                | Expand/migrate/contract gates and compatibility checks                        | Database package       |
| `ops/backup/` and `ops/dr/`      | Backup, restore, PITR, object recovery, and DR harness                        | Recovery package       |
| staging synthetic tests/evidence | Smoke, rollback, and independent review                                       | Release reviewer       |

# Ordered task packets

## P25-T01 - Freeze environment architecture and typed configuration

Define local/CI/staging/production resource classes, network/data flows, identities, regions, encryption, retention, budgets, and ownership. Add validation tests for missing/unknown/unsafe config and docs/config drift. No secret values enter source. Evidence: `evidence/P25/environment-contract.json`.

## P25-T02 - Reproducible service images and provenance

Build pinned minimal API/worker/migration images as non-root with health/readiness, immutable release labels, SBOM/provenance, and no dev dependencies/secrets. Tests start images as non-root, probe health/readiness, scan layers, and compare two clean builds where deterministic. Evidence: `evidence/P25/image-build-report.json`.

## P25-T03 - Infrastructure and least-privilege service identities

Provision/reconcile staging through reviewed definitions for compute, PostgreSQL, Redis, object storage, secret references, telemetry, TLS, and networking. Test denial of cross-role/object/secret access and drift detection. Record plans and outputs without sensitive values. Evidence: `evidence/P25/infrastructure-review.md`.

## P25-T04 - Backward-compatible migration and deployment pipeline

Implement frozen-install/test/scan/build, staging migration, deploy, synthetic smoke, approval, promotion, and post-deploy verification. Test N-1 API/worker/client compatibility, interrupted migration, duplicate pipeline run, and failed health gate. Evidence: `evidence/P25/pipeline-rehearsal.json`.

## P25-T05 - Encrypted backup and point-in-time/object recovery

Configure scheduled PostgreSQL backup/PITR and object version/backup policy aligned with P22 deletion aging. Add safe inventory/restore tooling with exact target guards. Tests prove backup completion/alerting, encryption, unauthorized access denial, target guards, and synthetic manifest/checksum coverage. Evidence: `evidence/P25/backup-report.json`.

## P25-T06 - Full restore and disaster-recovery drill

Run a disaster-recovery test that simulates loss/corruption in an isolated environment; restore database to a point, recover matching objects/config, rebuild Redis from authoritative state, validate counts/FKs/manifests/checksums/jobs/tombstones, and measure RPO/RTO. Evidence: `evidence/P25/dr-drill.json`.

## P25-T07 - Rollback and forward-recovery rehearsal

Exercise application rollback, provider/config kill switches, failed migration forward fix, worker backlog recovery, secret rotation, and restoration of service while preserving new-client/local evidence. Never reverse a destructive migration without tested restore. Evidence: `evidence/P25/rollback-rehearsal.json`.

## P25-T08 - Production-readiness security and operations review

Independently review permissions, public exposure, encryption, secrets, backup access, deletion aging, logs, alert routes, capacity/cost alarms, runbooks, and approval records. Run the staging synthetic meeting smoke after a clean deployment. Evidence: `evidence/P25/EVIDENCE.md`.

# Subagent work packages

| Package                    | Task IDs | Exclusive paths     | Depends on | Review gate                              | Output            |
| -------------------------- | -------- | ------------------- | ---------- | ---------------------------------------- | ----------------- |
| Infrastructure             | T01,T03  | infra definitions   | P24        | architecture/security review             | environment stack |
| Delivery                   | T02,T04  | images/workflows    | T01        | supply-chain/compat review               | pipeline          |
| Recovery                   | T05-T07  | backup/DR tooling   | T03,T04    | destructive-target/data-integrity review | drills            |
| Independent release review | T08      | tests/evidence only | all        | production-readiness review              | final report      |

# Failure and debugging matrix

| Failure                          | Classification | Expected behavior                             | Content-free diagnostics        | Recovery/regression  |
| -------------------------------- | -------------- | --------------------------------------------- | ------------------------------- | -------------------- |
| Migration/health gate fails      | persistence    | Stop promotion; old service remains available | release/migration ID            | rehearsal regression |
| Backup exists but cannot restore | environment    | Critical failure; do not count backup green   | backup/restore IDs, counts      | full restore drill   |
| Redis lost                       | state          | Rebuild dispatchable work from PostgreSQL     | queue/outbox counts             | loss/rebuild test    |
| Secret appears in image/log      | security       | Block, rotate, remove, rebuild                | detector/path only              | scan regression      |
| Wrong environment target         | security       | Fail before mutation                          | resolved environment/account ID | target-guard test    |

# Integrated verification

Run infrastructure validate/plan checks, image/SBOM/secret/vulnerability scans, migration compatibility suite, staging deployment smoke, backup/restore and DR/rollback drills, `pnpm verify:release`, and Rust/release artifact checks. Record approvals and real staging outputs.

| Gate                  | Command               | Intended signal                                                                 | Evidence                   |
| --------------------- | --------------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify:release` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P25/EVIDENCE.md` |

# Acceptance gate

- [ ] P25-A01 - Staging deploy is reproducible, least-privilege, observable, and free of secrets/critical-high findings.
- [ ] P25-A02 - Migration/deploy pipeline proves N-1 compatibility and stops safely on failure.
- [ ] P25-A03 - Encrypted database/object backups restore a consistent synthetic meeting package.
- [ ] P25-A04 - Measured RPO/RTO meet accepted targets in a full DR drill.
- [ ] P25-A05 - Rollback/forward recovery and Redis rebuild preserve authoritative state.
- [ ] P25-A06 - Backup retention/aging agrees with P22 deletion policy.

# Migration, rollout, and rollback

Promote immutable artifacts from CI to staging and later production; never rebuild between environments. Use expand/migrate/contract, canary service rollout, health gates, and kill switches. P27 owns actual personal production release.

# Required documentation updates

Update deployment/runbook with selected environment values and drill results, security boundaries, development release commands, `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`, and P25 evidence.

# Conversation boundary

Backend/platform delivery only. Do not implement desktop/mobile distribution, P26 signing/updater, Kubernetes without ADR, product features, or commit secrets. Stop before P26.

# Handoff record

Use `templates/HANDOFF_TEMPLATE.md`. Unblock P26 only.
