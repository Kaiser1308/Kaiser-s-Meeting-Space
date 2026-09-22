# P20 Windows desktop qualification run — 2026-09-22

## Scope

This run exercises the Windows Electron desktop implementation only. It does
not claim the mobile app, physical two-hour/device qualification, provider
qualification, or P20 verification.

Environment: Windows `10.0.26200`, Node `v24.18.0`, pnpm `10.14.0`, Electron
`34.5.8`, electron-builder `25.1.8`.

## Commands and evidence

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm install --frozen-lockfile` | 0 | Dependencies installed; pnpm warned that native build scripts for `cpu-features`, `msgpackr-extract`, `protobufjs`, and `ssh2` were ignored. |
| `pnpm --filter @kms/desktop test:unit` | 0 | 19 files / 183 tests passed, including packaged Electron smoke tests. |
| `pnpm --filter @kms/desktop test:smoke` | 0 | 1 file / 3 tests passed; physical packaged flow, SQLite/hash/reopen, and concurrent isolated instances passed. |
| `pnpm --filter @kms/desktop typecheck` | 0 | TypeScript check passed. |
| `pnpm --filter @kms/desktop build:electron` | 0 | Windows `win32/x64` packaged build passed; output created under `apps/desktop/dist-packaged/win-unpacked`. |
| `pnpm exec eslint apps/desktop` | 1 | 5 errors, 14 warnings; see defect log below. |
| `pnpm --filter @kms/desktop exec playwright test` | 1 | Playwright executable is not installed in the desktop workspace. |
| `pnpm test:e2e:desktop` | 0 | **Invalid green:** no desktop package has a `test:e2e` script, so zero tests ran. |
| `pnpm verify` | 1 | Stopped at `prettier --check .`; 155 files reported formatting issues, so later verify gates did not execute. |

Raw command output was captured during the run in:

- `%TEMP%\\kms-desktop-test-unit-20260922.log`
- `%TEMP%\\kms-desktop-smoke-20260922.log`
- `%TEMP%\\kms-desktop-build-20260922.log`
- `%TEMP%\\kms-desktop-typecheck-20260922.log`
- `%TEMP%\\kms-desktop-lint-target-20260922.log`
- `%TEMP%\\kms-desktop-playwright-direct-20260922.log`
- `%TEMP%\\kms-desktop-e2e-20260922.log`
- `%TEMP%\\kms-p20-verify-20260922.log`

## Windows feature matrix

| Area | Evidence | Status |
| --- | --- | --- |
| Boot/supervisor/security/preload | Desktop unit tests and packaged smoke | PASS in automated coverage |
| Start meeting | `meeting-api`, start workflow, packaged smoke | PASS in automated coverage |
| Mic/local capture and durable evidence | Packaged smoke records in isolated temp userData and validates SQLite/hash/provenance | PASS in automated synthetic/package smoke |
| Stop/finalization/reopen | Packaged smoke and finalization/transcript tests | PASS in automated coverage |
| Local speech/transcription | Unit/contract coverage only | Physical model/runtime qualification NOT RUN |
| Library/detail | Packaged reopen/library path plus unit coverage | Partial; full UI qualification NOT RUN |
| Markdown export | Desktop markdown export unit coverage | PASS at unit seam; full reader/manual qualification NOT RUN |
| DOCX/PDF/audio export and download/history | P20 implementation tests exist, but no current full Windows reader/storage run | NOT VERIFIED |
| Playwright desktop UI | No executable/package available; wrapper selects zero tests | NOT RUN |

## Defects and blockers

1. `pnpm verify` cannot complete because repository-wide Prettier reports 155
   files. This is a gate failure, not fixed in this qualification run.
2. Desktop lint fails on unused symbols in `apps/desktop/renderer/MinutesEditor.ts`,
   `apps/desktop/src/local-meeting-store.test.ts`, and `apps/desktop/src/main.tsx`,
   plus empty blocks in `apps/desktop/src/main/packaged-app.smoke.test.ts`.
3. `apps/desktop/package.json` has no `test:e2e` script and no
   `@playwright/test` dependency, while the root `test:e2e:desktop` script
   invokes that missing script and returns exit 0 with zero tests. This is a
   false-green E2E gate.
4. Package installation succeeded but pnpm ignored several dependency build
   scripts. Any qualification requiring those native packages must explicitly
   approve/build them and rerun.

## Conclusion

The Windows desktop unit, packaged smoke, typecheck, and Windows x64 packaging
passed. The software is not fully qualified: repository verify, lint, and the
desktop E2E gate have failures or invalid coverage, and the physical/manual /
reader/provider qualification remains open. P20 remains `IN_PROGRESS`.
