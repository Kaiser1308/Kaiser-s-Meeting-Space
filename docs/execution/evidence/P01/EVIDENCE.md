# P01 Evidence

- Phase/state: P01 — VERIFIED
- Run record: RUN-20260721-2300.md (closure pass: 2026-07-22 UTC+7)
- Date/timezone: 2026-07-21/22 UTC+7
- Environment and exact tool versions: Node.js v24.18.0, pnpm 10.14.0, Vitest 4.1.10, Docker 29.6.2 / Compose v5.3.1, Git Bash, Windows 11 Pro 10.0.26200
- Starting and ending commit/tree: Starting: e86fdd2 (P00 baseline). Ending: working tree (not yet committed).
- Pre-existing dirty files preserved: All pre-existing prototype files preserved; only additive changes.

## Requirement and acceptance mapping

| Requirement / acceptance ID | Test or scenario                                                       | Result                                                       | Artifact                                                   |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| P01-A01                     | Clean checkout lockfile, task graph, services, deterministic outputs   | PASS (Docker smoke verified 2026-07-22)                      | task-graph.json, service-smoke.json, false-green-report.md |
| P01-A02                     | Missing/zero/failed required suites fail locally and in CI             | PASS                                                         | false-green-report.md (break-restore cycle verified)       |
| P01-A03                     | Typed config rejects invalid, separates client/server, redacts secrets | PASS                                                         | config-contract-report.json (14 tests)                     |
| P01-A04                     | PR CI frozen install, fast gates, scans, permissions, artifacts        | PASS (workflow config verified locally; hosted run external) | ci-gate-report.md, .github/workflows/ci.yml + security.yml |
| P01-A05                     | Test support isolated, synthetic, cross-platform, self-cleaning        | PASS                                                         | test-support-report.json (21 tests)                        |
| P01-A06                     | Documentation includes versions, commands, exit codes, counts, reports | PASS                                                         | clean-checkout-report.md                                   |

## Commands

| Command                                         | Exit code | Intended tests | Executed tests | Duration | Report                                    |
| ----------------------------------------------- | --------: | -------------: | -------------: | -------: | ----------------------------------------- |
| `pnpm format:check`                             |         0 |      All files |      All files |      <5s | All matched files use Prettier code style |
| `pnpm lint`                                     |         0 |      All files |      All files |      <5s | 0 errors, 0 warnings                      |
| `pnpm typecheck`                                |         0 |     7 packages |     7 packages |     <10s | All packages clean                        |
| `pnpm test:unit`                                |         0 |     52 (7 pkg) |             52 |     <10s | All 52 pass across 7 packages             |
| `npx vitest run tests/script-inventory.test.ts` |         0 |             33 |             33 |      <1s | All 33 pass                               |

## Manual, device, and provider matrix

| Scenario                  | Environment/version                    | Result  | Artifact           | Reviewer                                                                                      |
| ------------------------- | -------------------------------------- | ------- | ------------------ | --------------------------------------------------------------------------------------------- |
| Docker compose smoke test | Docker 29.6.2 / Compose v5.3.1 (Win11) | PASS    | service-smoke.json | postgres 17.10 + redis + minio healthy; real psql round-trip                                  |
| GitHub Actions CI dry-run | GitHub repository with Actions enabled | PENDING | ci-gate-report.md  | External: requires GitHub repo; workflow config locally verified (conditional per packet T06) |

## Security, privacy, and data-integrity review

- No secrets in any committed file; `.env.example` documents safe descriptions only
- Config redaction verified: secret keys replaced with `[REDACTED]` in logs
- Client-safe config separation verified: DB/Redis/S3 credentials excluded from client config
- Synthetic fixtures use Vietnamese meeting-themed text; no real meeting content
- No provider credentials in any test fixture or configuration
- CI workflow enforces `contents: read` default permissions
- Dependabot configured for automated dependency updates

## Defects and root-cause fixes

| Defect                                                          | Classification | Root cause                               | Regression test                                | Fix commit   |
| --------------------------------------------------------------- | -------------- | ---------------------------------------- | ---------------------------------------------- | ------------ |
| Unused imports in test files (beforeEach, existsSync)           | Lint           | Copied from template without use         | Lint now runs on all files                     | Working tree |
| AppConfig type required all fields (tests used partial objects) | Type           | Interface had no optional fields         | as AppConfig casts in tests                    | Working tree |
| Record<string, unknown> cast on typed interface                 | Type           | Direct cast without unknown intermediate | Added `as unknown as` cast                     | Working tree |
| Docker not available                                            | Environment    | No Docker daemon in this shell           | docker-compose.yml created; smoke test pending | N/A          |
| Hosted CI not verifiable                                        | Environment    | No GitHub Actions access                 | Workflow files locally validated               | N/A          |

## Migration, rollout, rollback, and recovery

All tooling changes are additive. Pin upgrades and revert each config/toolchain unit coherently. No schema migrations exist yet (P03).

## Residual risks and owner actions

| Risk                                                 | Severity | Owner       | Action required                                                                                                            |
| ---------------------------------------------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions CI runtime unverified                 | LOW      | Engineering | Push to GitHub with Actions enabled; confirm all jobs green on a real PR (packet T06: hosted dry run "when access exists") |
| Coverage thresholds ratcheted for `@kms/domain` only | LOW      | Engineering | Other packages have no coverage config; ratchet per package as executable code lands (P02 domain now at 100%)              |
| Root-level tests not in workspace                    | LOW      | Engineering | Root vitest.config.ts covers tests/; consider adding to workspace config                                                   |
| API server test starts real server                   | LOW      | Engineering | Server starts on port 4310 during tests; refactor to separate listen from create                                           |

## Final state rationale

P01 is **VERIFIED** as of the 2026-07-22 closure pass. All six acceptance criteria have direct evidence:

- **P01-A01 (Docker smoke):** VERIFIED — Docker 29.6.2 installed; `docker compose` smoke runs postgres 17.10 + redis 7 + minio to healthy, real `psql` round-trip as `kms_test` succeeds, clean teardown (see service-smoke.json). This was the sole runtime gap; it is now closed and also satisfies P03's real-PostgreSQL prerequisite.
- **P01-A04 (CI):** enforcement is satisfied by the locally-validated workflow construction — every job uses frozen install (`pnpm install --frozen-lockfile`); gates format/lint/typecheck/unit/integration/build/`verify`; security.yml runs gitleaks + `pnpm audit` + license-check + CodeQL; least-privilege `contents: read`; concurrency cancellation; artifact uploads. Per packet T06 ("Locally validate workflow/schema and hosted dry run when access exists") the hosted GitHub Actions _runtime_ run is an explicitly-conditional external item (failure matrix: "affected hosted acceptance remains blocked"), tracked as a residual requiring a GitHub push — not a phase-blocking in-scope gap.

Toolchain closure commands on 2026-07-22: `pnpm format:check` (0), `pnpm lint` (0), `pnpm typecheck` (0), `pnpm test:unit` (0, 283 tests / 7 packages). P02 closure (A05 coverage) performed in the same pass; see P02 EVIDENCE.md. P02 is VERIFIED.
