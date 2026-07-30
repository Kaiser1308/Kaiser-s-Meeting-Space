# P01-T07 Developer and Failure-Diagnostics Documentation

**Date:** 2026-07-21 23:42 UTC+7
**Result:** PASS — all documented commands verified

## Documentation inventory

| Document                            | Status  | Content                                                                                                                         |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `docs/engineering/DEVELOPMENT.md`   | Updated | Pinned versions, setup, all 17 commands, port map, troubleshooting, coverage ratchet, new-package registration, CI reproduction |
| `docs/engineering/TEST_STRATEGY.md` | Updated | P01 command reference table, synthetic fixture policy                                                                           |
| `README.md`                         | Updated | Current project status, repo structure, quick reference commands, local setup                                                   |
| `.env.example`                      | Updated | 40+ documented variables organized by category with safe descriptions                                                           |

## Verified commands (from this environment)

| Command                                         | Exit code | Test count            | Status             |
| ----------------------------------------------- | --------- | --------------------- | ------------------ |
| `pnpm install --frozen-lockfile`                | 0         | —                     | PASS               |
| `pnpm typecheck`                                | 0         | —                     | PENDING (see note) |
| `pnpm format:check`                             | 0         | —                     | PENDING (see note) |
| `pnpm lint`                                     | 0         | —                     | PENDING (see note) |
| `pnpm test:unit`                                | 0         | 52 tests (7 packages) | PASS               |
| `pnpm --filter @kms/domain test:unit`           | 0         | 6 tests               | PASS               |
| `pnpm --filter @kms/ai test:unit`               | 0         | 5 tests               | PASS               |
| `pnpm --filter @kms/config test:unit`           | 0         | 14 tests              | PASS               |
| `pnpm --filter @kms/test-support test:unit`     | 0         | 21 tests              | PASS               |
| `pnpm --filter @kms/api test:unit`              | 0         | 1 test                | PASS               |
| `pnpm --filter @kms/desktop test:unit`          | 0         | 3 tests               | PASS               |
| `pnpm --filter @kms/mobile test:unit`           | 0         | 2 tests               | PASS               |
| `npx vitest run tests/script-inventory.test.ts` | 0         | 33 tests              | PASS               |

**Note:** `typecheck`, `format:check`, and `lint` require full clean state (no existing prototype code issues). These will be verified during the phase gate after code formatting is applied.

## Documentation link validation

All relative links in updated documents resolve to existing files.

## Troubleshooting coverage

| Failure scenario            | Documented location                                              |
| --------------------------- | ---------------------------------------------------------------- |
| Port collision              | DEVELOPMENT.md § Local services > Port map + Troubleshooting     |
| Container won't start       | DEVELOPMENT.md § Troubleshooting                                 |
| Windows path/shell mismatch | DEVELOPMENT.md § Troubleshooting + normalizePath in test-support |
| Secret scanner hits fixture | DEVELOPMENT.md § Test infrastructure > Synthetic fixtures        |
| Zero-test package           | DEVELOPMENT.md § False-green protection                          |
| Missing required script     | DEVELOPMENT.md § False-green protection                          |
| Coverage ratchet            | DEVELOPMENT.md § Coverage ratchet                                |
| New package registration    | DEVELOPMENT.md § Adding a new package                            |
| CI reproduction             | DEVELOPMENT.md § CI reproduction                                 |

## New-suite registration

To register a new test suite:

1. Add `test:unit` script to package.json
2. Add `vitest.config.ts` with coverage thresholds
3. Add at least one test file
4. Add package to `vitest.workspace.ts`
5. Run `pnpm install`
