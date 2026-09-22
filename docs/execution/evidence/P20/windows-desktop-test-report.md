# Windows desktop test report — 2026-09-22

## Executive summary

The current Windows Electron build was exercised with the available automated
desktop suites. Core packaged behavior passed, but the complete Windows
qualification did not pass because the repository verify gate and desktop lint
failed, and several physical/manual/reader qualification gates remain open.

### Passes

- 19 desktop test files, 183 tests: pass.
- Packaged Electron smoke: 3 tests: pass.
- Packaged Electron meeting flow now includes reopen plus Markdown export: pass.
- Windows x64 electron-builder packaging: pass.
- Desktop TypeScript typecheck: pass.
- Playwright desktop E2E: 6 tests execute through the root wrapper; 5 pass and
  1 expected-failure documents simulated-mode title validation ordering.
  Shell, diagnostics/capture controls, mode/source toggles, Record/Library
  switching, and Library refresh are covered.
- Native Windows Rust suite: initial 77/78 exposed a flag-reporting defect;
  after the fix, full suite is 78/78 pass and the rebuilt packaged smoke is 3/3.
- Optional local-speech feature suite: 101/101 pass with the Windows MSVC
  toolchain; optional release sidecar build passes. Real model/corpus runtime
  qualification was not run.
- Security gate: 37/37 pass. Contract gate: domain 406/406 and API 30/30
  pass.

### Failures / missing coverage

- Repository `pnpm verify`: fail at formatting, 155 files.
- Repository integration gate: fail, database migration/schema baseline has 5
  failed assertions (`9` vs `14`, `38` vs `55`, and `30` vs `36`).
- Resilience/performance root commands return exit 0 without running tests
  because no selected workspace package provides those scripts; this is missing
  coverage, not a pass.
- Desktop ESLint: fail, 5 errors and 14 warnings.
- The initial E2E run was false-green because the desktop package had no E2E
  script/dependency. That tooling defect was corrected and both E2E entry points
  now execute 3 tests and pass.
- The Templates and Settings sidebar controls are visible but currently have no
  click handler or destination view in the desktop renderer; they remain an
  open functional defect.
- Simulated capture mode checks native runtime availability before validating an
  empty meeting title, producing `Local capture runtime is unavailable.` rather
  than `Enter a meeting title.`; this is covered by an expected-failure E2E
  regression test.
- The WASAPI flag-reporting defect was fixed and verified through the native
  regression test, full Rust suite, release sidecar build, and packaged smoke.
- Physical microphone/system-audio, local model runtime, reader compatibility,
  accessibility, long-session, provider, and signed-install qualification were
  not claimed as passed.

The detailed run record, command exit codes, feature matrix, and defect log are
in [RUN-20260922-windows-desktop.md](RUN-20260922-windows-desktop.md).
