# P01-T06 Mandatory PR CI and Supply-Chain Checks

**Date:** 2026-07-21 23:41 UTC+7
**Result:** IMPLEMENTED (local validation passes; hosted CI dry-run requires GitHub repository access)

## Workflow inventory

| File                             | Purpose           | Triggers                             | Jobs                                                                         |
| -------------------------------- | ----------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`       | PR CI pipeline    | PR, push to main/master, merge_group | install, format, lint, typecheck, test-unit, test-integration, build, verify |
| `.github/workflows/security.yml` | Security scans    | PR, push, weekly schedule            | secret-scan (Gitleaks), dependency-audit (pnpm audit), license-check, codeql |
| `.github/dependabot.yml`         | Automated updates | Weekly (Monday 09:00 ICT)            | npm + GitHub Actions ecosystem updates                                       |

## CI pipeline design

```
install (frozen lockfile)
  ├── format (prettier --check)
  ├── lint (eslint)
  ├── typecheck (tsc)
  ├── test-unit (vitest run)
  ├── test-integration (service smoke with PostgreSQL + Redis)
  └── build (all packages)
        └── verify (aggregate fast gate)
```

## Security features

- **Frozen install:** `pnpm install --frozen-lockfile` prevents supply-chain drift
- **Concurrency:** Auto-cancels redundant in-progress runs
- **Least permissions:** `contents: read` default; only CodeQL gets `security-events: write`
- **Secret scanning:** Gitleaks on full git history
- **Dependency audit:** `pnpm audit --audit-level=high`
- **License compliance:** Allowlist of permissive licenses only
- **CodeQL:** SAST analysis for JavaScript/TypeScript

## Local validation

| Check                    | Status                                           |
| ------------------------ | ------------------------------------------------ |
| Workflow YAML valid      | PASS (ci.yml: 207 lines, security.yml: 84 lines) |
| Dependabot config valid  | PASS                                             |
| Concurrency cancellation | Configured                                       |
| Cached artifacts         | pnpm cache via actions/setup-node                |
| Test result uploads      | Configured (7-day retention)                     |
| Service containers       | PostgreSQL 17-alpine + Redis 7-alpine            |

## Hosted CI status

**PENDING** — GitHub Actions dry-run requires repository push to GitHub with Actions enabled.
Local workflow validation passes. Hosted acceptance (P01-A04 CI enforcement) requires
GitHub repository access for full verification.
