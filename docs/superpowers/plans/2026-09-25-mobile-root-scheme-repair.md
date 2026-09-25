# Mobile Root Deep-Link Scheme Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task after owner approval. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Stay on the checked-out `master` branch. Do not create a worktree or dispatch subagents; the code/build/device steps are sequential and share one authorized phone.

**Review status:** The owner approved this plan on 2026-09-25 and selected the patched `@xmldom/xmldom` 0.9.12 update after the original 0.9.10 pin was found to be affected by a maintainer security advisory. The advisory lists `~0.9.12` as patched: [GHSA-27p8-2357-5qqv](https://github.com/xmldom/xmldom/security/advisories/GHSA-27p8-2357-5qqv).

**Goal:** Fix the workspace-root Android build's missing `kms` deep-link scheme, then make a prompt-only physical-device attempt to reach Android's real microphone permission dialog without granting it or recording.

**Architecture:** Keep the existing root Android build and app identity. Add the already-established `kms` scheme to the root Expo config and register it on root `MainActivity`; a focused mobile test resolves Expo config from the workspace root and parses the Android manifest structurally. Build and upgrade-install the same signed APK, then use the actual app flow and stop at the system permission prompt.

**Tech Stack:** Expo SDK 54 config/CLI, React Native 0.81, Vitest, `@xmldom/xmldom` for manifest XML tests, Android Gradle/SDK Build Tools, ADB, and the physical OPPO CPH2699.

## Global Constraints

- Preserve the existing `kms://oauth/callback` contract and Android app package.
- Out of scope: Changing Auth0/provider settings, client ID, callback path, package name, signing identity, microphone permission state, capture behavior, or app data.
- Out of scope: Granting `RECORD_AUDIO`, pressing a recording/start control, or capturing audio.
- Out of scope: Disabling Android/ColorOS package verification or changing any device security setting to install Maestro. If the helper remains blocked, use the already-approved direct-ADB/app-UI route and explicitly report that this was not a Maestro run.
- The release APK is installed in place with `adb install -r`; no uninstall, data clear, permission auto-grant, or signer change occurs.
- Record actual commands, outcomes and blockers in the P09 diagnostic run record. P09 remains `IMPLEMENTED`; this prompt-only diagnostic does not satisfy P09 physical interruption, route, or two-hour gates.
- Preserve all pre-existing workspace changes. Stage only the current task's files, run its narrow tests, run `gitnexus.detect_changes()` on staged changes, and commit each completed task separately.
- Before editing any existing code symbol, run GitNexus impact analysis and report any HIGH or CRITICAL risk. This plan adds only a new test module; it does not change existing app functions or behavior.
- Do not update phase status or claim the prompt/device gate passed without direct evidence.

---

## Task 1: Add Root Scheme and Structural Regression Tests

**Files:**

- Create: `apps/mobile/src/app/root-scheme.test.ts`
- Modify: `apps/mobile/package.json` (test-only XML parser dependency)
- Modify: `pnpm-lock.yaml`
- Modify: `app.json` (workspace-root Expo config)
- Modify: `android/app/src/main/AndroidManifest.xml` (workspace-root native deep-link filter)

**Interfaces:**

- The workspace-root `pnpm exec expo config --json` output must resolve `scheme: "kms"` and retain `android.package: "com.anonymous.kaisermeetingspace"`.
- The root `.MainActivity` must handle `android.intent.action.VIEW`, `android.intent.category.DEFAULT`, `android.intent.category.BROWSABLE`, and `android:scheme="kms"` in one intent filter.
- Do not modify `apps/mobile/App.tsx`, `createAuthRedirectUri`, OAuth/provider configuration, or any permission/capture implementation.

- [ ] **Step 1: Add patched `@xmldom/xmldom` 0.9.12 as a mobile dev dependency.**

Run from the repository root:

```powershell
pnpm --filter @kms/mobile add --save-dev --save-exact @xmldom/xmldom@0.9.12
```

Expected: only the `@kms/mobile` dev-dependency declaration and corresponding lockfile importer/package/snapshot metadata change. The prior pnpm invocation also rewrote an unrelated Vitest peer snapshot; if that recurs, restore that unrelated hunk to its committed value. Do not upgrade Expo or unrelated dependencies, and do not retain an `@xmldom/xmldom` version below 0.9.12 for this test dependency.

- [ ] **Step 2: Create failing tests for the resolved root Expo scheme and parsed Android route.**

Create `apps/mobile/src/app/root-scheme.test.ts` with these imports and assertions. The test file is run from the mobile package, so `resolve(process.cwd(), '../..')` is the repository root, matching the existing mobile monorepo-runtime tests.

```ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';

const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
const PROJECT_ROOT = resolve(process.cwd(), '../..');

describe('workspace-root Android deep-link contract', () => {
  it('resolves the existing scheme and package from the root Expo config', () => {
    const output = execSync('pnpm exec expo config --json', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    const config = JSON.parse(output) as {
      scheme?: string;
      android?: { package?: string };
    };

    expect(config.scheme).toBe('kms');
    expect(config.android?.package).toBe('com.anonymous.kaisermeetingspace');
  });

  it('registers kms VIEW links on the root MainActivity', () => {
    const xml = readFileSync(
      resolve(PROJECT_ROOT, 'android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const activity = Array.from(document.getElementsByTagName('activity')).find(
      (node) => node.getAttributeNS(ANDROID_NS, 'name') === '.MainActivity',
    );
    expect(activity).toBeDefined();

    const handlesKmsView = Array.from(activity!.getElementsByTagName('intent-filter')).some(
      (filter) => {
        const actions = Array.from(filter.getElementsByTagName('action')).map((node) =>
          node.getAttributeNS(ANDROID_NS, 'name'),
        );
        const categories = Array.from(filter.getElementsByTagName('category')).map((node) =>
          node.getAttributeNS(ANDROID_NS, 'name'),
        );
        const schemes = Array.from(filter.getElementsByTagName('data')).map((node) =>
          node.getAttributeNS(ANDROID_NS, 'scheme'),
        );

        return (
          actions.includes('android.intent.action.VIEW') &&
          categories.includes('android.intent.category.DEFAULT') &&
          categories.includes('android.intent.category.BROWSABLE') &&
          schemes.includes('kms')
        );
      },
    );

    expect(handlesKmsView).toBe(true);
  });
});
```

Do not add test-only behavior to the app itself.

- [ ] **Step 3: Run only the new test and confirm the current config/manifest fail it.**

Run from the repository root:

```powershell
pnpm --filter @kms/mobile exec vitest run src/app/root-scheme.test.ts
```

Expected before the fix: the resolved-config assertion reports no `kms` scheme, and the manifest assertion reports no matching `VIEW` filter. This is the TDD red check; do not commit a failing test by itself.

- [ ] **Step 4: Add the scheme to root `app.json` and the matching filter to root `MainActivity`.**

Add top-level `"scheme": "kms"` to `app.json`, preserving the existing Android package. In `android/app/src/main/AndroidManifest.xml`, add this second filter under the existing `.MainActivity` (leave the launcher filter unchanged):

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="kms" />
</intent-filter>
```

Do not add host/path restrictions; match the already-generated `apps/mobile` manifest and existing `kms://oauth/callback` behavior.

- [ ] **Step 5: Run the focused regression test to green, then mobile unit tests and typecheck.**

```powershell
pnpm --filter @kms/mobile exec vitest run src/app/root-scheme.test.ts
pnpm --filter @kms/mobile test:unit
pnpm --filter @kms/mobile typecheck
```

Expected: each exits 0. If any fails, use systematic debugging, establish the root cause, correct the narrow issue, and rerun the failing command before continuing.

- [ ] **Step 6: Verify resolved root config and build the release APK.**

From repository root, run `pnpm exec expo config --json` and confirm the JSON reports `scheme: "kms"` and the unchanged package. Then build the root Android release APK from `android/`:

```powershell
.\gradlew.bat :app:assembleRelease --no-daemon --console=plain -PreactNativeArchitectures=arm64-v8a
```

- [ ] **Step 7: Verify the packaged manifest and signer.**

From `android/`, run:

```powershell
aapt dump xmltree app/build/outputs/apk/release/app-release.apk AndroidManifest.xml
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

Confirm the packaged `.MainActivity` manifest contains the `VIEW`, `DEFAULT`, `BROWSABLE`, and `kms` entries, and confirm the signer matches the already-installed build signer recorded in `docs/execution/evidence/P09/RUN-20260925-1128.md`.

- [ ] **Step 8: Review, stage only Task 1 files, detect changes, and commit.**

Run the focused format/diff checks, stage only the five Task 1 paths, inspect the staged diff, run GitNexus `detect_changes({scope: "staged"})`, then commit:

```powershell
pnpm exec prettier --check apps/mobile/src/app/root-scheme.test.ts
git diff --check
git add -- apps/mobile/src/app/root-scheme.test.ts apps/mobile/package.json pnpm-lock.yaml app.json android/app/src/main/AndroidManifest.xml
git diff --cached --check
git diff --cached -- apps/mobile/src/app/root-scheme.test.ts apps/mobile/package.json pnpm-lock.yaml app.json android/app/src/main/AndroidManifest.xml
git commit -m "fix(mobile): configure root deep-link scheme"
```

Expected: only the new test, mobile package/lock, root `app.json`, and root Android manifest are in the commit. Do not stage the pre-existing `AGENTS.md`, `CLAUDE.md`, generated output, or unrelated untracked folders.

## Task 2: Upgrade-Install and Attempt the Real Permission Prompt

**Depends on:** Task 1 commit and all Task 1 verification passing.

**Files:**

- Modify only after direct device verification: `docs/execution/evidence/P09/RUN-20260925-1128.md` (append a dated follow-up section with observed outcomes and blockers).

**Interfaces:**

- Device: authorized physical OPPO CPH2699, ADB serial `fd12a6a7`.
- Package: `com.anonymous.kaisermeetingspace`.
- Permission begins denied and remains denied. No recording/session starts and no audio is captured.

- [ ] **Step 1: Recheck the authorized device and its current non-granted microphone state.**

Run read-only checks:

```powershell
adb -s fd12a6a7 devices -l
adb -s fd12a6a7 shell pm check-permission android.permission.RECORD_AUDIO com.anonymous.kaisermeetingspace
```

Expected: the serial reports `device`, and the permission is denied. If the serial is absent/offline, stop and report it. Do not change verifier/security settings, uninstall the app, clear app data, or grant permission to unblock this test.

- [ ] **Step 2: Record the pre-install app/data identity and verify the release signer.**

Run read-only package queries and save their output as the pre-install baseline:

```powershell
adb -s fd12a6a7 shell pm path com.anonymous.kaisermeetingspace
adb -s fd12a6a7 shell dumpsys package com.anonymous.kaisermeetingspace | Select-String 'codePath|versionCode|versionName|ceDataInode|deDataInode'
$baseApkPath = ((adb -s fd12a6a7 shell pm path com.anonymous.kaisermeetingspace | Select-String '^package:' | Select-Object -First 1).Line -replace '^package:', '')
adb -s fd12a6a7 shell sha256sum $baseApkPath
```

The last recorded data inodes were `ceDataInode=2169025` and `deDataInode=2163579`; compare the post-install values to the fresh pre-install baseline rather than assuming those historical values cannot change. If the platform does not expose an inode field, record it as unavailable without changing device/app security. Run `apksigner verify --print-certs` on the Task 1 APK and compare its signer SHA-256 to `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` before installation. If signer identity differs, stop before install and ask the owner; do not uninstall or replace data.

- [ ] **Step 3: Upgrade-install in place and verify preservation.**

Run:

```powershell
adb -s fd12a6a7 install -r android/app/build/outputs/apk/release/app-release.apk
```

Expected: `Success`. Repeat the `pm path`, filtered `dumpsys package`, and returned-base-APK `sha256sum` queries; compare version/package, APK SHA-256, CE/DE inodes where available, and `RECORD_AUDIO` denied state to the pre-install baseline. Any unexpected signer/data change is a stop condition. Do not use `pm clear`, `uninstall`, `-g`, or a ColorOS/Play Protect override.

- [ ] **Step 4: Cold-launch and verify the app stays alive without the scheme startup crash.**

Run:

```powershell
adb -s fd12a6a7 shell am force-stop com.anonymous.kaisermeetingspace
adb -s fd12a6a7 shell am start -W -n com.anonymous.kaisermeetingspace/.MainActivity
adb -s fd12a6a7 shell pidof com.anonymous.kaisermeetingspace
```

Expected: `MainActivity` starts and the app process remains alive. Do not clear logcat or capture broad logs; record only the observed launch result and safe exception/error code if a failure appears.

- [ ] **Step 5: Respect the existing authentication gate, then navigate to the permission request.**

`AppShell` displays the meeting flow only when `ClientAuth.refresh()` leaves the app authenticated. If the existing on-device session is valid, use the real UI in this order: `Set up meeting` → enter a synthetic title such as `Microphone permission check` → `Continue` → `Continue to readiness`. That final control calls `PermissionsAndroid.request(RECORD_AUDIO)` and should display Android's system permission dialog.

Do not press `Start recording` or any `Allow` option. Stop at the visible system dialog, document that it appeared, then dismiss it using the deny/not-allow choice and confirm the permission remains denied. If the app instead requires a fresh Auth0 sign-in, stop and ask the owner to authenticate on the phone; this task does not include handling credentials or qualifying a real OAuth provider round-trip. If Maestro's helper install is again rejected, use only the direct-ADB/UI route and report that it was not a Maestro run.

- [ ] **Step 6: Append only verified outcomes to the P09 diagnostic run record and commit the evidence task.**

Append a follow-up section to `docs/execution/evidence/P09/RUN-20260925-1128.md` recording build/test results, install and data-preservation checks, cold-launch result, whether the actual permission dialog appeared, final denied state, whether the flow used valid existing authentication, and any Maestro/device/login blocker. Include no credentials, tokens, meeting content, or audio. If the prompt was not reached, state exactly where and why; do not claim success.

Run `git diff --check`, stage only the P09 run record, inspect the staged diff, run GitNexus `detect_changes({scope: "staged"})`, and commit separately:

```powershell
git add -- docs/execution/evidence/P09/RUN-20260925-1128.md
git diff --cached --check
git diff --cached -- docs/execution/evidence/P09/RUN-20260925-1128.md
git commit -m "docs(P09): record root scheme prompt diagnostic"
```

Do not edit `STATUS.md`, `docs/execution/TRACEABILITY.md`, or `docs/execution/PROGRESS.md` to promote status. P09 remains `IMPLEMENTED` regardless of this prompt-only result.

## Handoff Gate

- Owner reviews and approves this plan before Task 1 begins.
- Complete Task 1 and commit it before starting any physical-device step.
- If authentication, device availability, signer identity, package verification, or data-preservation checks block Task 2, stop at that gate, preserve the phone/app data/security settings, record only verified evidence, and request owner direction.
- Stop after the prompt-only diagnostic. Do not begin full P09 recording qualification or claim P09 `VERIFIED`.
