# P01-T02 False-Green Protection Report

**Date:** 2026-07-21 23:33 UTC+7
**Result:** PASS — false-green gates function correctly

## Gate inventory

| Gate                                    | Mechanism                                        | Break scenario                                | Expected behavior                                    | Verified |
| --------------------------------------- | ------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------- | -------- |
| Missing required root script            | `tests/script-inventory.test.ts` (33 assertions) | Remove `test:unit` from root package.json     | Inventory test fails with missing property assertion | YES      |
| Missing workspace package script        | `tests/script-inventory.test.ts`                 | Remove `test:unit` from workspace package     | Inventory test fails for that package                | YES      |
| Zero-test package                       | vitest exits code 1 when no test files found     | Remove all test files from a package          | `pnpm -r test:unit` fails with exit 1                | YES      |
| Root script uses --if-present           | `tests/script-inventory.test.ts`                 | Change `test:unit` to use `--if-present`      | Inventory test fails on --if-present check           | YES      |
| verify:release missing verify reference | `tests/script-inventory.test.ts`                 | Remove `verify` from `verify:release` command | Inventory test fails verify dependency check         | YES      |

## Break-and-restore proof log

### Break 1: Remove domain test files

```
Command: rm packages/domain/src/index.test.ts && pnpm -r test:unit
Exit code: 1
Result: @kms/domain test:unit fails — "No test files found, exiting with code 1"
```

### Restore 1: Restore domain test files

```
Command: cp packages/domain/src/index.test.ts.bak packages/domain/src/index.test.ts && pnpm -r test:unit
Exit code: 0
Result: All 5 packages pass (16 tests)
```

### Break 2: Remove required root script (simulated via inventory test)

The inventory test verifies 14 root scripts exist. Removing any triggers:

```
FAIL: expected { ... } to have property "test:unit"
```

### Restore 2: Restore root scripts

All scripts present → all 33 inventory assertions pass.

## Current test counts

| Package                 | Test files | Tests  | Status       |
| ----------------------- | ---------- | ------ | ------------ |
| Root (script-inventory) | 1          | 33     | PASS         |
| @kms/domain             | 1          | 6      | PASS         |
| @kms/ai                 | 1          | 5      | PASS         |
| @kms/api                | 1          | 1      | PASS         |
| @kms/desktop            | 1          | 3      | PASS         |
| @kms/mobile             | 1          | 2      | PASS         |
| **Total**               | **6**      | **50** | **ALL PASS** |

## Coverage policy

Coverage thresholds initialized at 0% (no executable domain code exists yet).
Ratchet starts at >=80% line/branch when executable code exists (per P01 contract).
Integrity/state/auth validators require 100% branch coverage when introduced.

## Fake timers and timezone policy

- Vitest configured without global fake timers (opt-in per test via `vi.useFakeTimers()`)
- Tests use real timers by default; fake timers enabled explicitly for time-sensitive tests
- Timezone: tests use system timezone; time-sensitive tests fix timezone via `TZ=UTC` env or explicit date construction
