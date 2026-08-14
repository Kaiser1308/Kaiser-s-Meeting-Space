# P08 root-path and APK verification — 2026-08-05

## Root-cause fix

The failure was caused by pnpm's isolated virtual store being resolved under
the nested workspace path. Expo autolinking passed that canonical package path
to CMake, so `expo-modules-core` object directories exceeded Windows'
`CMAKE_OBJECT_PATH_MAX` and Ninja repeatedly reported `build.ninja still dirty`.

The durable fix is:

- `pnpm-workspace.yaml` places the isolated virtual store at the portable
  relative path `../../../../../q`; on this checkout it resolves to `C:/q`.
  This keeps package roots short without encoding a user profile or drive
  letter.
- A clean `pnpm install --frozen-lockfile` verified
  `virtualStoreDir: C:/q`; the old `C:/Users/thien/p` marker is
  no longer consumed.
- `apps/mobile/metro.config.js` resolves isolated-pnpm packages explicitly,
  watches the virtual-store package roots, and maps TypeScript `.js` source
  specifiers without changing source evidence.
- Metro's Windows absolute-path loader is given a `file://` override during
  the Android release bundle task.

## Gates

### Reproducibility transcript

The generated `node_modules` trees were moved aside, then this command was
run from the workspace root with `CI=true`:

```text
pnpm install --frozen-lockfile
Lockfile is up to date, resolution step is skipped
Packages: +1191 ... done
virtualStoreDir: C:\q
```

After the clean install, `gradlew.bat clean` followed by
`assembleRelease -PreactNativeArchitectures=arm64-v8a` completed with
`BUILD SUCCESSFUL`; the clean release gate reported `295 actionable tasks:
247 executed, 48 up-to-date`.

The Gradle wrapper was then tested without setting either
`EXPO_OVERRIDE_METRO_CONFIG` or `NODE_ENV` in the calling shell. It derived
the Metro file URI from its own location, set the production bundle mode, and
completed `gradlew.bat clean` plus `assembleRelease` with `BUILD SUCCESSFUL`.

- `pnpm --filter @kms/mobile run typecheck`: exit 0.
- `pnpm --filter @kms/mobile run test:unit`: exit 0; 42 files / 246 tests.
- `gradlew.bat clean && gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a`: exit 0;
  295 actionable tasks, APK generated at
  `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
- After a clean Gradle/CMake reset, the release build completed with exit 0
  from the workspace. Native paths resolved under `C:/q`; the build emitted
  neither a `CMAKE_OBJECT_PATH_MAX` warning nor a `build.ninja still dirty`
  failure.
- The APK was installed on `CPH2699`, Android 16/API 36, serial `fd12a6a7`.
  Authenticated Home, meeting setup, permission screen, and Readiness were
  directly observed. No audio was captured.
- The rebuilt APK was installed on the same device after an initial ADB
  timeout/retry. Accessibility dumps directly showed Home, Meeting setup
  (title EditText, VI/EN, modes, disabled/enabled Continue), Permission and
  Readiness (fake capture boundary, cloud toggle, Start, Back, locale/logout).
  Wi-Fi and mobile data were disabled through ADB while Readiness was visible;
  the current APK dump contained `delayed-processing-warning` with the
  localized local-safe/cloud-delay message. Both transports were re-enabled.
  No audio was captured.
- Current APK UIAutomator evidence shows the title input with native
  `focused=true` after touch. After tapping the English language control, the
  current APK now reports `meeting-title-input focused=false`; the control is
  visibly outlined in `focus-language-after-blur.png`. Full TalkBack traversal
  remains partial.
- After switching the virtual store to the short `C:/q3` path and rebuilding
  from a clean dependency store, `pnpm --filter @kms/mobile typecheck` passed,
  the mobile unit gate passed with 42 files / 247 tests, and
  `gradlew.bat assembleRelease --no-daemon --console=plain` passed with
  `BUILD SUCCESSFUL` (295 actionable tasks: 16 executed, 279 up-to-date).
  The release APK was installed successfully on serial `fd12a6a7`.
- The platform secure-storage adapter now dynamically loads Expo SecureStore;
  its adapter test verifies `setItemAsync`, `getItemAsync`, and
  `deleteItemAsync` delegation. The physical login/restart persistence check
  remains manual because the device was locked and no real meeting/auth
  content was entered by automation.
- The repository configuration was rechecked with pnpm 11.16.0: isolated
  linking, copy imports, `C:/q3` virtual store, and the relative short store
  path are all active by default. `pnpm install --frozen-lockfile` completed
  successfully, and the mobile test/typecheck gate was rerun afterward.
- Continuation on 2026-08-06 reran the Android release build under those
  default settings: `BUILD SUCCESSFUL`, 295 actionable tasks (25 executed,
  270 up-to-date). No `CMAKE_OBJECT_PATH_MAX` or dirty-Ninja failure appeared.
- On the real `fd12a6a7` device, the current APK was force-stopped and relaunched;
  the UI hierarchy returned `home-screen` with `logout-button`, proving the
  authenticated session survived an app restart. After the logout confirmation,
  the hierarchy returned `login-screen`; a second force-stop/relaunch remained
  on `login-screen` with no `logout-button`, proving the stored session was
  cleared. No meeting content or audio was used.
- TalkBack was enabled on the current APK for a bounded login-screen check.
  Keyboard traversal reached `login-button` and `locale-button` with native
  focus; TalkBack was disabled afterward. Full Home/setup/permission/readiness
  traversal and human speech confirmation remain manual.

## Lifecycle

P08 remains **IMPLEMENTED** pending closure of the independent accessibility
review and direct evidence for every remaining A04 case on the current APK.
