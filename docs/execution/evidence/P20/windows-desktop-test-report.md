# Windows desktop test report — 2026-09-22

## Executive summary

The current Windows Electron build was exercised with the available automated
desktop suites. Core packaged behavior passed, but the complete Windows
qualification did not pass because the repository verify gate and desktop lint
failed, and the configured desktop Playwright gate does not actually run.

### Passes

- 19 desktop test files, 183 tests: pass.
- Packaged Electron smoke: 3 tests: pass.
- Windows x64 electron-builder packaging: pass.
- Desktop TypeScript typecheck: pass.

### Failures / missing coverage

- Repository `pnpm verify`: fail at formatting, 155 files.
- Desktop ESLint: fail, 5 errors and 14 warnings.
- Direct Playwright: unavailable because `@playwright/test`/Playwright binary is
  not installed for `apps/desktop`.
- Root desktop E2E command: false green; exits 0 while selecting no test script
  and running zero tests.
- Physical microphone/system-audio, local model runtime, reader compatibility,
  accessibility, long-session, provider, and signed-install qualification were
  not claimed as passed.

The detailed run record, command exit codes, feature matrix, and defect log are
in [RUN-20260922-windows-desktop.md](RUN-20260922-windows-desktop.md).
