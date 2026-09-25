# Mobile Root Deep-Link Scheme Design

## Status

The owner approved the selected design in conversation on 2026-09-25. This
written spec is awaiting owner review and authorizes design review only. After
spec approval, prepare a separate implementation plan and obtain its approval
before changing application code or configuration.

## Goal

Remove the workspace-root Android app's startup crash caused by Expo Linking
having no custom URL scheme, then resume the already-scoped physical-device
check to reach the real Android microphone permission prompt. Stop at the
prompt: do not grant microphone permission and do not start recording.

This is a startup/deep-link configuration repair and permission-prompt
diagnostic, not P09 recording qualification.

## Observed context

- On 2026-09-25, a direct cold launch of the installed root-built app crashed
  before rendering because `ExpoLinking.createURL` raised the missing-custom-
  scheme error while `createAuthRedirectUri` ran during startup.
- `pnpm exec expo config --json` from the workspace root currently resolves
  without a `scheme`; the same command from `apps/mobile/` resolves
  `scheme: kms`.
- Workspace-root `app.json` declares the existing Android package but no
  scheme. `apps/mobile/app.json` declares `scheme: kms`, and the generated
  `apps/mobile` Android manifest already has a `VIEW` / `DEFAULT` /
  `BROWSABLE` filter for that scheme.
- The workspace-root Android `MainActivity` manifest has only the launcher
  filter and no custom-scheme `VIEW` filter. The established application
  callback is `kms://oauth/callback`; app parsing and redirect-URI tests already
  use this contract.
- The crash is a separate blocker from the earlier ColorOS rejection of the
  Maestro helper APK. Device verification/security settings remain unchanged.

## Selected design

Make the workspace-root build's configuration agree with the existing mobile
scheme contract:

1. Add `scheme: "kms"` to the workspace-root Expo app config without changing
   the app ID/package or other app configuration.
2. Add an Android `VIEW` intent filter with `DEFAULT` and `BROWSABLE`
   categories and `android:scheme="kms"` to the root Android `MainActivity`,
   matching the existing `apps/mobile` generated manifest behavior.
3. Add regression coverage that checks the _resolved_ workspace-root Expo
   config and parses/verifies the root Android manifest's MainActivity deep-link
   filter. The test must fail against the current missing-scheme state; checking
   only JSON text is insufficient.

No fallback scheme is added in JavaScript. The configuration that produces the
standalone app must declare the scheme, and Android must route matching links to
the app.

## Considered approaches

1. **Align root Expo config and root Android manifest (selected).** This is the
   smallest repair for the exact root-built app that crashed and keeps the
   existing `kms` callback contract.
2. **Re-root the Android build at `apps/mobile`.** This changes build/Metro
   project assumptions and has a wider validation surface than the observed
   configuration defect requires.
3. **Add a JavaScript fallback scheme.** This can conceal missing build
   configuration but does not register Android to receive the callback, so it
   does not repair the complete deep-link contract.

## Scope and non-goals

In scope:

- Workspace-root Expo configuration and root Android `MainActivity` manifest.
- Focused regression coverage for resolved Expo configuration and Android
  deep-link registration.
- Rebuild and upgrade-install the same signed APK on the already-connected
  physical device, verify app data is retained, cold-launch the app, and
  navigate the actual UI to the Android microphone permission prompt.
- Record results in the existing P09 diagnostic run record without promoting
  P09's lifecycle status.

Out of scope:

- Changing Auth0/provider settings, client ID, callback path, package name,
  signing identity, microphone permission state, capture behavior, or app data.
- Granting `RECORD_AUDIO`, pressing a recording/start control, or capturing
  audio.
- Disabling Android/ColorOS package verification or changing any device
  security setting to install Maestro. If the helper remains blocked, use the
  already-approved direct-ADB/app-UI route and explicitly report that this was
  not a Maestro run.
- Testing a real OAuth sign-in/provider round trip or claiming the P09 phase is
  `VERIFIED`.

## Verification and acceptance criteria

1. A focused regression test demonstrates the pre-fix failure and passes after
   the change. It verifies that Expo CLI, run from the workspace root, resolves
   `scheme` to `kms`, and that the root manifest registers a `VIEW` activity
   filter with `DEFAULT`, `BROWSABLE`, and the `kms` scheme.
2. `pnpm exec expo config --json` from the workspace root resolves
   `scheme: "kms"`; the built/packaged Android manifest contains the same
   `MainActivity` deep-link route.
3. Relevant mobile unit tests and typecheck pass, and the root Android release
   build succeeds. Unrelated repository-wide gate failures are reported rather
   than attributed to this repair.
4. The release APK is verified and installed in place with `adb install -r`;
   no uninstall, data clear, permission auto-grant, or signer change occurs.
   Installed APK identity and app-data inode identifiers are checked before
   and after the upgrade where available.
5. A cold launch reaches the app UI without the reported scheme exception.
   On the physical OPPO, navigate to the real microphone permission request and
   stop while Android's permission dialog is visible. Confirm
   `RECORD_AUDIO` is still denied after dismissing the prompt without granting
   it. No recording starts and no audio is captured.
6. If Maestro's helper APK is again rejected by device verification, preserve
   that security state and finish only the direct-ADB/UI checks that remain
   possible. Record which path was used; do not describe it as a Maestro pass.
7. Append actual commands, outcomes, and blockers to the P09 run record. P09
   remains `IMPLEMENTED`; this prompt-only diagnostic does not satisfy the
   phase's physical interruption, route, or two-hour qualification gates.

## Risks and boundaries

- The change registers the existing custom scheme for Android delivery; it
  does not prove provider-side OAuth configuration or a complete login round
  trip.
- Root Expo config and checked-in Android manifest are separate inputs. Both
  must be tested so a future edit cannot reintroduce a working JS URL with no
  native Android route, or vice versa.
- The Maestro helper installation blocker is controlled by device security
  policy. It is not a reason to weaken that policy or to claim an unavailable
  automated test passed.
- App startup may reveal another independent UI or device issue after this
  crash is removed. Record the observed stopping point; do not broaden this
  task without owner review.

## Handoff boundary

After this spec is reviewed and approved, prepare a task-scoped implementation
plan and request its review before changing code. Execute only the approved
repair and prompt diagnostic. Do not start unrelated mobile work or mark P09
`VERIFIED`.
