# Windows desktop test report — 2026-09-22

## Executive summary

The current Windows Electron build was exercised with the available automated
desktop suites. Core packaged behavior and the covered desktop gates pass, but
the complete Windows qualification remains open because repository formatting,
reader/manual, resilience/performance, and feature-coverage gates remain open.

### Passes

- 19 desktop test files, 183 tests: pass.
- Packaged Electron smoke: 3 tests: pass.
- Packaged Electron meeting flow now includes reopen plus Markdown export: pass.
- Windows x64 electron-builder packaging: pass.
- Desktop TypeScript typecheck: pass.
- Playwright desktop E2E rerun: 8 tests execute; all 8 complete successfully, with 6
  normal passes and 2 expected-failures for missing Templates and Settings
  navigation.
  Shell, diagnostics/capture controls, mode/source toggles, Record/Library
  switching, and Library refresh are covered.
- Native Windows Rust suite: initial 77/78 exposed a flag-reporting defect;
  after the fix, full suite is 78/78 pass and the rebuilt packaged smoke is 3/3.
- Optional local-speech feature suite: 101/101 pass with the Windows MSVC
  toolchain; optional release sidecar build passes. Real model/corpus runtime
  qualification was not run.
- Export renderer package: 11/11 pass for simple/audio/DOCX/PDF seams.
- Synthetic reader smoke: LibreOffice 26.2.5.2 converted DOCX to PDF; pypdf
  reopened the PDF and extracted the expected one-page text, and PyMuPDF
  rendered it for visual inspection. This does not prove the full target-reader
  matrix or branded/large-document behavior.
- Security gate: 37/37 pass. Contract gate: domain 406/406 and API 30/30
  pass.

### Failures / missing coverage

- Repository `pnpm verify`: current rerun fails at formatting, 161 files
  (the earlier qualification run reported 155 before later generated artifacts
  were present).
- Repository integration gate: initial run failed on 5 stale database
  migration/schema assertions; after the debug fixes, root integration passes
  API, database (352/352), and MinIO storage (15/15).
- Resilience/performance root commands return exit 0 without running tests
  because no selected workspace package provides those scripts; this is missing
  coverage, not a pass.
- Direct resilience execution with `tests/resilience/vitest.config.ts` could
  not qualify the scenarios: setup failed to connect to PostgreSQL
  `127.0.0.1:5433`, leaving 3 scenarios skipped. No performance target exists
  in the repository.
- Desktop ESLint rerun has 0 errors and 14 `no-explicit-any` warnings after
  removing unused imports/fixture state and documenting best-effort cleanup.
- The initial E2E run was false-green because the desktop package had no E2E
  script/dependency. That tooling defect was corrected; the desktop entry point
  now executes all 8 tests.
- The Templates and Settings sidebar controls are visible but currently have no
  click handler or destination view in the desktop renderer; they remain an
  open functional defect.
- The simulated capture empty-title defect was fixed by moving the shared title
  guard before the physical/simulated branch. The focused regression test passes
  1/1 and the full desktop E2E run passes 8/8.
- The visible Templates and Settings navigation buttons do not change view or
  content; both are covered by expected-failure E2E checks.
- Poppler installation was attempted but blocked by a concurrent Windows
  Installer lock; it remains unavailable. PyMuPDF was used only as a rendering
  fallback for this synthetic reader smoke.
- Database migration inventory expectations now derive the journal count from
  the committed journal and include migrations 0004–0013; the focused migration
  suite passes 29/29 and full database integration passes 352/352.
- The storage integration script now uses an explicit MinIO test path instead
  of a Windows-incompatible glob; the real MinIO suite passes 15/15.
- The WASAPI flag-reporting defect was fixed and verified through the native
  regression test, full Rust suite, release sidecar build, and packaged smoke.
- Physical microphone/system-audio, local model runtime, reader compatibility,
  accessibility, long-session, provider, and signed-install qualification were
  not claimed as passed.
- A concurrent unit+E2E verification attempt caused two packaged smoke CDP
  timeouts; the serial rerun passed 19 files / 183 tests. This is recorded as
  runner contention, and Electron/CDP desktop gates should run serially.

The detailed run record, command exit codes, feature matrix, and defect log are
in [RUN-20260922-windows-desktop.md](RUN-20260922-windows-desktop.md).
