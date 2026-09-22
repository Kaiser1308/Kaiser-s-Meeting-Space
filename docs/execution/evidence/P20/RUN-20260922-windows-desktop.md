# P20 Windows desktop qualification run — 2026-09-22

## Scope

This run exercises the Windows Electron desktop implementation only. It does
not claim the mobile app, physical two-hour/device qualification, provider
qualification, or P20 verification.

Environment: Windows `10.0.26200`, Node `v24.18.0`, pnpm `10.14.0`, Electron
`34.5.8`, electron-builder `25.1.8`.

## Commands and evidence

| Command                                                       | Exit | Result                                                                                                                                               |
| ------------------------------------------------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                              |    0 | Dependencies installed; pnpm warned that native build scripts for `cpu-features`, `msgpackr-extract`, `protobufjs`, and `ssh2` were ignored.         |
| `pnpm --filter @kms/desktop test:unit`                        |    0 | 19 files / 183 tests passed, including packaged Electron smoke tests.                                                                                |
| `pnpm --filter @kms/desktop test:smoke`                       |    0 | 1 file / 3 tests passed; physical packaged flow, SQLite/hash/reopen, Markdown export, and concurrent isolated instances passed.                      |
| `pnpm --filter @kms/export test:unit`                        |    0 | 2 files / 11 renderer and export-job tests passed, covering Markdown/TXT/JSON/audio/DOCX/PDF seams and resource bounds.                         |
| `pnpm --filter @kms/desktop typecheck`                        |    0 | TypeScript check passed.                                                                                                                             |
| `pnpm --filter @kms/desktop build:electron`                   |    0 | Windows `win32/x64` packaged build passed; output created under `apps/desktop/dist-packaged/win-unpacked`.                                           |
| `cargo test -p kms-native` (initial)                          |  101 | 78 native tests ran; 77 passed and `packet_flags_preserve_every_applicable_reason` failed.                                                           |
| `cargo test -p kms-native` (fixed)                            |    0 | 78/78 native tests passed; 2 dead-code warnings remain.                                                                                              |
| `cargo build --release -p kms-native`                         |    0 | Release Windows native sidecar built; 17 compiler warnings remain.                                                                                   |
| `cargo test -p kms-native --features local-speech`            |    0 | 101/101 optional local-speech tests passed with the Windows MSVC toolchain after installing the missing native build tools.                          |
| `cargo build --release -p kms-native --features local-speech` |    0 | Optional local-speech release sidecar built; 20 compiler warnings remain.                                                                            |
| `pnpm --filter @kms/desktop build:electron` (native fix)      |    0 | Electron package rebuilt with the fixed release sidecar.                                                                                             |
| `pnpm --filter @kms/desktop test:smoke` (native fix)          |    0 | Packaged physical capture/reopen/export/concurrency smoke: 3/3 passed.                                                                               |
| `pnpm exec eslint apps/desktop`                               |    1 | 5 errors, 14 warnings; see defect log below.                                                                                                         |
| `pnpm --filter @kms/desktop test:e2e`                         |    0 | 8 Playwright tests executed: 5 passed and 3 expected-failures expose simulated title validation plus Templates/Settings navigation defects.          |
| `pnpm test:e2e:desktop`                                       |    0 | Same 8-test desktop suite passed through the root wrapper; expected-failures are reported by Playwright as `x`.                                      |
| `pnpm test:security`                                          |    0 | 4 files / 37 security tests passed.                                                                                                                  |
| `pnpm test:contract`                                          |    0 | Domain 28 files / 406 tests and API 7 files / 30 tests passed.                                                                                       |
| `pnpm test:integration`                                       |    1 | API integration completed; database suite failed 5/352 tests because migration/schema fixtures expect obsolete counts (9 vs 14, 38 vs 55, 30 vs 36). |
| `pnpm test:resilience`                                        |    0 | No selected workspace package exposes a `test:resilience` script; zero tests executed, so this is not evidence of a pass.                            |
| `pnpm test:performance`                                       |    0 | No selected workspace package exposes a `test:performance` script; zero tests executed, so this is not evidence of a pass.                           |
| LibreOffice DOCX/PDF reader smoke                             |    0 | LibreOffice 26.2.5.2 converted the synthetic DOCX to PDF; output reopened with pypdf (1 page, expected text) and rendered to PNG for visual review. |
| `pnpm verify`                                                 |    1 | Stopped at `prettier --check .`; 155 files reported formatting issues, so later verify gates did not execute.                                        |

Raw command output was captured during the run in:

- `%TEMP%\\kms-desktop-test-unit-20260922.log`
- `%TEMP%\\kms-desktop-smoke-20260922.log`
- `%TEMP%\\kms-desktop-build-20260922.log`
- `%TEMP%\\kms-desktop-typecheck-20260922.log`
- `%TEMP%\\kms-desktop-lint-target-20260922.log`
- `%TEMP%\\kms-playwright-install-20260922.log`
- `%TEMP%\\kms-playwright-install-full-20260922.log`
- `%TEMP%\\kms-playwright-browser-install-20260922.log`
- `%TEMP%\\kms-desktop-e2e-direct-20260922.log`
- `%TEMP%\\kms-desktop-e2e-root-20260922.log`
- `%TEMP%\\kms-desktop-e2e-expanded-20260922.log`
- `%TEMP%\\kms-desktop-e2e-feature-audit-20260922.log`
- `%TEMP%\\kms-desktop-e2e-feature-audit-rerun-20260922.log`
- `%TEMP%\\kms-desktop-e2e-root-feature-audit-20260922.log`
- `%TEMP%\\kms-desktop-e2e-navigation-audit-20260922.log`
- `%TEMP%\\kms-p20-security-20260922.log`
- `%TEMP%\\kms-p20-contract-20260922.log`
- `%TEMP%\\kms-p20-integration-20260922.log`
- `%TEMP%\\kms-p20-resilience-20260922.log`
- `%TEMP%\\kms-p20-performance-20260922.log`
- `%TEMP%\\kms-p20-domain-contract-20260922.log`
- `%TEMP%\\kms-p20-api-contract-20260922.log`
- `%TEMP%\\kms-p20-export-renderer-tests-20260922.log`
- `%TEMP%\\kms-p20-synthetic-reader-check.docx`
- `%TEMP%\\kms-p20-synthetic-reader-check.pdf`
- `%TEMP%\\kms-p20-synthetic-renderer-check.pdf`
- `%TEMP%\\kms-p20-synthetic-reader-check-page-1.png`
- `%TEMP%\\kms-p20-synthetic-renderer-page-1.png`
- `%TEMP%\\kms-desktop-unit-rerun-20260922.log`
- `%TEMP%\\kms-desktop-typecheck-rerun-20260922.log`
- `%TEMP%\\kms-desktop-build-rerun-20260922.log`
- `%TEMP%\\kms-desktop-smoke-export-20260922.log`
- `%TEMP%\\kms-native-cargo-test-20260922.log`
- `%TEMP%\\kms-native-flag-regression-20260922.log`
- `%TEMP%\\kms-native-flag-regression-final-20260922.log`
- `%TEMP%\\kms-native-cargo-test-fixed-20260922.log`
- `%TEMP%\\kms-native-cargo-build-release-20260922.log`
- `%TEMP%\\kms-native-cargo-test-local-speech-msvc-wrapper-final-20260922.log`
- `%TEMP%\\kms-native-cargo-build-release-local-speech-20260922.log`
- `%TEMP%\\kms-desktop-build-native-fix-20260922.log`
- `%TEMP%\\kms-desktop-smoke-native-fix-20260922.log`
- `%TEMP%\\kms-p20-verify-20260922.log`

## Windows feature matrix

| Area                                       | Evidence                                                                                                                                                                           | Status                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Boot/supervisor/security/preload           | Desktop unit tests and packaged smoke                                                                                                                                              | PASS in automated coverage                                           |
| Start meeting                              | `meeting-api`, start workflow, packaged smoke                                                                                                                                      | PASS in automated coverage                                           |
| Mic/local capture and durable evidence     | Packaged smoke records in isolated temp userData and validates SQLite/hash/provenance                                                                                              | PASS in automated synthetic/package smoke                            |
| Stop/finalization/reopen                   | Packaged smoke and finalization/transcript tests                                                                                                                                   | PASS in automated coverage                                           |
| Local speech/transcription                 | Optional feature suite 101/101 and release sidecar build pass; no real model/corpus was supplied                                                                                   | Automated feature pass; physical model/runtime qualification NOT RUN |
| Library/detail                             | Packaged reopen/library path plus unit coverage                                                                                                                                    | Partial; full UI qualification NOT RUN                               |
| Markdown export                            | Packaged Electron smoke clicks Export Markdown after reopen and observes success status; unit coverage also passes                                                                 | PASS for Markdown UI flow; full reader/manual qualification NOT RUN  |
| DOCX/PDF/audio export and download/history | Exporter 11/11 plus synthetic DOCX-to-PDF reader smoke; no full branded/large-doc/audio-storage/download run                                     | Partial; target-reader/storage qualification NOT VERIFIED |
| Playwright desktop UI                      | Shell, diagnostics/capture controls, Record/Library switching, mode/source toggles, title validation, Library refresh, Templates/Settings navigation; 6 pass + 2 expected failures | PASS for covered flows; two navigation defects remain                 |
| Packaged executable visual boot            | Native Windows executable opened with Electron menu and Meetings/Templates/Settings shell visible                                                                                  | PASS for boot observation                                            |
| Native OS click-through                    | Orca exposed the Electron renderer only as `Chrome Legacy Window`; coordinate clicks were reported unverified and produced no confirmed state change                               | NOT VERIFIED                                                         |

## Defects and blockers

1. `pnpm verify` cannot complete because repository-wide Prettier reports 155
   files. This is a gate failure, not fixed in this qualification run.
2. Desktop lint fails on unused symbols in `apps/desktop/renderer/MinutesEditor.ts`,
   `apps/desktop/src/local-meeting-store.test.ts`, and `apps/desktop/src/main.tsx`,
   plus empty blocks in `apps/desktop/src/main/packaged-app.smoke.test.ts`.
3. The initial run exposed a false-green E2E wrapper because
   `apps/desktop/package.json` had no `test:e2e` script or `@playwright/test`
   dependency. The test tooling was corrected in this run; direct and root
   E2E now both execute 8 tests; five pass and three expected-failures preserve
   simulated-mode validation and missing navigation defects.
4. Package installation succeeded but pnpm ignored several dependency build
   scripts. Any qualification requiring those native packages must explicitly
   approve/build them and rerun.
5. The packaged executable can be launched and visually inspected, but the
   available OS-level accessibility adapter cannot expose the renderer controls
   reliably; its synthetic clicks are explicitly unverified. This does not
   replace the passing CDP packaged smoke or prove manual M1-M6 click-through.
6. The `Templates` and `Settings` sidebar buttons render in the desktop shell,
   but `apps/desktop/src/main.tsx` currently attaches no click handler or view
   state to either button. They are therefore visible but functionally
   incomplete; this is recorded as a product defect, not a passing feature.
7. The initial native suite exposed a real bug in
   `packet_flag_reason_suffix`: Rust `|` patterns were interpreted as
   alternatives instead of combined bitmask values, causing a two-flag WASAPI
   condition to be reported as all three flags. The function now matches exact
   masked values, the regression matrix passes, and the rebuilt packaged smoke
   remains green.
8. The first `local-speech` build attempt failed under the default GNU Rust
   toolchain because `dlltool.exe` was unavailable, and the bundled CMake was
   too new for an older dependency. Installing MSYS2/MinGW, using the MSVC
   Rust target, and applying a temporary CMake policy wrapper resolved the
   toolchain issue: 101/101 feature tests and the release build then passed.
   No real model/corpus runtime qualification was run.
9. The repository does not contain the `STATUS.md` file referenced by the
   execution rules, so no status-file update was possible; lifecycle state was
   recorded in `PROGRESS.md`, `TRACEABILITY.md`, and this evidence set.
10. The repository integration gate fails in the database migration-restore
    suite: five assertions still use obsolete migration journal/schema/enum
    counts. This is a repository baseline defect, not a desktop UI failure,
    but it prevents the integrated Windows qualification gate from passing.
11. `pnpm test:resilience` and `pnpm test:performance` exit zero while
    selecting no package scripts. They are false-green commands and provide no
    resilience/performance evidence; the missing package scripts remain open.
12. The expanded Windows UI E2E initially found that an empty title in
    `Simulated (P11)` mode returned `Local capture runtime is unavailable.`
    instead of the title validation error. The cause was the simulated start
    path checking the native bridge before applying the title guard. The guard
    was moved before the physical/simulated branch, and the focused regression
    test now passes 1/1; the full desktop E2E run passes 8/8 with two expected
    failures remaining for the unimplemented navigation views.
13. The navigation audit found that clicking the visible `Templates` button
    does not open a Templates view or change the rendered content.
14. The navigation audit found that clicking the visible `Settings` button
    does not open a Settings view or change the rendered content. Both are
    expected-failure E2E checks because the current renderer has no handlers or
    view state for these buttons.
15. Windows had no Word/PDF CLI initially. LibreOffice was installed and its
    26.2.5.2 headless conversion/reopen smoke passed using synthetic content;
    Poppler installation was blocked by a concurrent Windows Installer lock,
    so PyMuPDF was used for PNG rendering. This is not a substitute for the
    required target-reader matrix or full branded/large-document qualification.

## Conclusion

The Windows desktop unit, packaged smoke, typecheck, and Windows x64 packaging
passed. The software is not fully qualified: repository verify, lint, and the
desktop E2E gate have failures or invalid coverage, and the physical/manual /
reader/provider qualification remains open. P20 remains `IN_PROGRESS`.
