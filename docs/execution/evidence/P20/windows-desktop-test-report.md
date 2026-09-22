# Windows desktop test report — 2026-09-22

## Executive summary

The current Windows Electron build was exercised with the available automated
desktop suites. Core packaged behavior passed, but the complete Windows
qualification did not pass because the repository verify gate and desktop lint
failed, and the configured desktop Playwright gate does not actually run.

### Passes

- 19 desktop test files, 183 tests: pass.
- Packaged Electron smoke: 3 tests: pass.
- Packaged Electron meeting flow now includes reopen plus Markdown export: pass.
- Windows x64 electron-builder packaging: pass.
- Desktop TypeScript typecheck: pass.
- Playwright desktop E2E: 3/3 pass through the root wrapper, covering shell,
  diagnostics/capture controls, and Record/Library switching.

### Failures / missing coverage

- Repository `pnpm verify`: fail at formatting, 155 files.
- Desktop ESLint: fail, 5 errors and 14 warnings.
- The initial E2E run was false-green because the desktop package had no E2E
  script/dependency. That tooling defect was corrected and both E2E entry points
  now execute 3 tests and pass.
- The Templates and Settings sidebar controls are visible but currently have no
  click handler or destination view in the desktop renderer; they remain an
  open functional defect.
- Physical microphone/system-audio, local model runtime, reader compatibility,
  accessibility, long-session, provider, and signed-install qualification were
  not claimed as passed.

The detailed run record, command exit codes, feature matrix, and defect log are
in [RUN-20260922-windows-desktop.md](RUN-20260922-windows-desktop.md).
