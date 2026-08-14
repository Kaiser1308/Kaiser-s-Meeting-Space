# P08 Run 2026-08-05 — root-path/build continuation

## Scope

- Requested phase: P08 upgrade from `IMPLEMENTED` to `VERIFIED`.
- Existing working tree changes were preserved; no next-phase feature work was added.
- Current lifecycle remains `IMPLEMENTED` until the Android A04 matrix has complete direct device evidence and independent review.

## Root-cause evidence and fixes

The Gradle task ran from `apps/mobile` but Expo loaded the workspace-level Metro
configuration and resolved the relative `index.js` from the wrong project root.
The workspace-level `metro.config.js` now pins the mobile project root, and the
Android Gradle configuration aligns its root with the workspace and emits the
workspace-relative `apps/mobile/index.js` entrypoint. The pnpm/Expo native
dependency path remains hoisted so CMake does not receive the deep virtual-store
path.

## Fresh verification

| Gate               | Command                                                                                        | Result                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Gradle JS bundle   | `gradlew.bat :app:createBundleReleaseJsAndAssets --no-daemon --console=plain`                  | PASS; `BUILD SUCCESSFUL`, bundle created for `apps/mobile/index.js`                                                                          |
| Android artifact   | `gradlew.bat assembleRelease --no-daemon --console=plain -PreactNativeArchitectures=arm64-v8a` | PASS; `BUILD SUCCESSFUL`, arm64 release APK produced                                                                                         |
| Mobile regression  | direct Vitest runner with `--root . --config vitest.config.ts --configLoader runner`           | PASS; 41 files / 240 tests                                                                                                                   |
| Mobile typecheck   | `tsc --noEmit -p apps/mobile/tsconfig.json`                                                    | PASS                                                                                                                                         |
| Android ADB        | `ADB_SERVER_PORT=5038`, `ADB_LIBUSB=0`, `adb devices -l`                                       | PASS; `fd12a6a7` (`CPH2699`, Android 16/API 36) reachable and release APK installed                                                          |
| WCAG token gate    | `src/theme/theme.test.ts`                                                                      | PASS; all tested text/background pairs assert >= 4.5:1                                                                                       |
| Portrait/landscape | `wm user-rotation lock 0/1`, `dumpsys display`, `dumpsys window`                               | PASS; activity receives portrait `1080x2400` and landscape `2400x1080`; Android 16 requires WMS command rather than `settings user_rotation` |

## Decision

P08 remains `IMPLEMENTED`, not `VERIFIED`. The root path/build issue and the
previous locale/meeting-language defects are fixed and regression-tested. The
physical run reached Vietnamese and English UI, meeting-language controls,
permission, and readiness screens using synthetic input; 200% text remained
scrollable; Android WMS confirmed both portrait and landscape activity bounds.
The remaining binary blockers are TalkBack traversal (device reports
`enabled_accessibility_services=null`), permission denial/retry (ADB shell is
not allowed to revoke runtime permissions on this device), offline/delayed
processing and cloud-consent physical cases, plus the required independent
reviewer. The recording stop error observed during the smoke run belongs to
P09 native audio capture and was not changed under the P08 scope. iOS remains
non-gating under ADR-007.
