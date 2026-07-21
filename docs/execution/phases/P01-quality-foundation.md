---
phase: P01
title: Engineering and quality foundation
status: NOT_STARTED
depends_on: [P00]
requirements: [NFR-Reliability, NFR-Security, NFR-Observability]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

A clean checkout has pinned, cross-platform install/build/test commands, typed configuration, isolated PostgreSQL/Redis/MinIO test services, deterministic synthetic fixtures, mandatory CI/security scans, coverage policy, and a release gate that fails when a required suite is missing or executes zero tests.

# Authoritative context

Read Development Guide, Test Strategy, Tech Stack, Security/Privacy, Deployment Runbook, package manifests/lockfile, and P00 support/toolchain evidence.

# Preconditions and external prerequisites

P00 is `VERIFIED`; approved Node/pnpm/OS/container versions are available. CI repository administration or external scan credentials may block hosted-CI evidence but not local config/tests. Do not implement business behavior.

# Scope firewall

**Allowed:** root tooling/config/scripts, workspace package test config, `.github/workflows/`, `docker-compose.yml`, `packages/config/`, `packages/test-support/`, synthetic fixtures, and engineering docs.

**Forbidden/out:** domain redesign, database schema/business repositories, auth, capture, providers, product UI, production cloud resources, and optional framework churn.

**Extension seams:** test projects and typed config are additive by package/job type; service endpoints are injected.

# Contracts and invariants

- Root scripts exist without `--if-present`: `format:check`, `lint`, `typecheck`, `test:unit`, `test:integration`, `test:contract`, `test:e2e:desktop`, `test:e2e:mobile`, `test:security`, `test:resilience`, `test:performance`, `build`, `verify`, `verify:release`.
- Required-suite inventory fails for missing command, absent project, unexpected skip, or zero tests.
- Production config uses runtime schemas and safe error codes; values/secrets never appear in errors.
- Integrity/state/auth validators have 100% branch coverage when introduced; overall line/branch ratchet starts at >=80% when executable code exists.
- Fixtures are deterministic synthetic/consented data only.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| root manifests/Turbo/format/lint/Vitest configs | deterministic task graph and policy | Tooling |
| `packages/config/` | typed environment schemas | Config |
| `packages/test-support/` | containers, fixtures, cleanup, zero-test inventory | Test infrastructure |
| `docker-compose.yml` and test overrides | local PostgreSQL/Redis/MinIO | Test infrastructure |
| `.github/workflows/` and scan config | mandatory CI/security/artifacts | CI/security |
| engineering docs | exact setup, versions, diagnostics, coverage | Main agent |

# Ordered task packets

## P01-T01 - Mandatory workspace task graph

Add failing script-inventory tests, then implement the exact root commands and package project discovery with pinned package manager. `pnpm verify` runs fast deterministic gates; `verify:release` includes all named release projects and refuses missing/zero suites. Narrow command: the inventory test; expected initial failure lists missing scripts. Evidence: `evidence/P01/task-graph.json`.

## P01-T02 - Formatter, linter, tests, coverage, and false-green protection

Configure cross-platform formatting/linting, Vitest projects/reporters/coverage, fake timers/timezone policy, and explicit test counts. Prove the gate fails by temporarily removing a required project and breaking an integrity fixture, then restore and show green. Do not broadly ignore warnings. Evidence: `false-green-report.md`.

## P01-T03 - Typed runtime configuration

Create `packages/config` schemas for environment/base, DB, Redis, S3, OIDC, providers, limits, observability, client-public config, and production-only constraints; expand `.env.example` with names and safe descriptions only. Tests cover missing, invalid, unknown, secret redaction, client/server separation, and environment defaults. Evidence: `config-contract-report.json`.

## P01-T04 - Local service harness

Add pinned PostgreSQL/Redis/MinIO Compose services with health checks, private dev credentials, volumes, isolated test override, and documented start/stop/reset. Add a smoke test that waits for real health and fails on wrong endpoint/credential. No production configuration. Evidence: `service-smoke.json`.

## P01-T05 - Testcontainers and synthetic fixtures

Create reusable isolated containers, unique DB/bucket/queue namespaces, deterministic IDs/clocks/audio metadata/text fixtures, cleanup, and Windows-safe paths. Tests intentionally interrupt setup/cleanup and prove no cross-test state. Never embed realistic secret patterns or meeting content. Evidence: `test-support-report.json`.

## P01-T06 - Mandatory PR CI and supply-chain checks

Create frozen-install format/lint/type/unit/contract/build jobs plus integration service smoke, secret/dependency/license scans, cached artifacts, test-count/coverage reports, concurrency cancellation, least permissions, and protected trusted-release separation. Locally validate workflow/schema and hosted dry run when access exists. Evidence: `ci-gate-report.md`.

## P01-T07 - Developer and failure-diagnostics documentation

Pin exact versions/installation sources, document clean setup and each command, service/port/Windows/container troubleshooting, report paths, coverage ratchet, new-suite registration, and CI reproduction. Verification runs every documented command from a clean environment and validates every documentation link. Evidence: `clean-checkout-report.md`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Tooling/config | T01-T03 | root config + `packages/config` | P00 | cross-platform/secret review |
| Test services | T04,T05 | compose + `packages/test-support` | T01 | isolation/cleanup review |
| CI/docs | T06,T07 | workflows + engineering docs | T01-T05 | permissions/false-green review |
| Independent reviewer | all | tests/evidence only | implementation | intentional-break proof |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Command executes zero tests | contract | Non-zero exit naming project | zero-test fixture |
| Port collision | environment | Random Testcontainers port; compose action documented | parallel smoke test |
| Secret scanner hits fixture | security | Replace fixture; no broad suppression | scan regression |
| Windows path/shell mismatch | platform | Cross-platform Node tooling or explicit wrapper | Windows clean run |
| Hosted CI unavailable | environment | Preserve local validation; affected hosted acceptance remains blocked | exact owner action |

# Integrated verification

Run frozen install, format, lint, typecheck, unit, contract, integration smoke, build, security scan, `verify`, and intentional-break tests. Run `verify:release` only after all required release projects are registered to fail truthfully rather than silently skip. Record exit codes and non-zero test counts.

# Acceptance gate

- [ ] P01-A01 - Clean checkout reproduces lockfile, task graph, healthy services, and deterministic outputs where promised.
- [ ] P01-A02 - Missing/zero/failed required suites and integrity assertions fail locally and in CI.
- [ ] P01-A03 - Typed config rejects invalid production settings without leaking values and separates client/server config.
- [ ] P01-A04 - PR CI enforces frozen install, fast gates, scans, permissions, and artifacts.
- [ ] P01-A05 - Test support is isolated, synthetic, cross-platform, and self-cleaning.
- [ ] P01-A06 - Documentation/evidence include exact versions, commands, exit codes, counts, and reports.

# Migration, rollout, and rollback

Tooling is additive. Pin upgrades and revert each config/toolchain unit coherently. Do not weaken gates to support old prototype scripts.

# Required documentation updates

Development Guide, Test Strategy command table, `.env.example`, root README, `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`, and P01 evidence.

# Handoff record

Unblock P02 only and stop.
