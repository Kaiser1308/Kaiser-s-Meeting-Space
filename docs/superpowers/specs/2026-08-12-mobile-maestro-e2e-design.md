# Android Mobile Maestro E2E Design

## Goal

Add a small, standalone Maestro suite that proves the Android pre-meeting UI
flow on a real installed development build without inventing an authentication,
recording, permission, network, or provider result.

## Scope

In scope:

- A dedicated `apps/mobile/maestro/` test area and an Android Maestro command.
- Three independent pre-meeting flows:
  1. Record mode: authenticated Home -> meeting setup -> Vietnamese -> microphone
     permission -> readiness.
  2. Translate mode: authenticated Home -> meeting setup -> English -> readiness
     -> cloud processing disclosure and required explicit consent.
  3. Microphone denial: the platform permission request is denied -> the app
     displays a truthful error and offers the existing retry action.
- Test actions and assertions that use the existing stable React Native
  `testID` values and accessible labels.
- Synthetic meeting titles only.
- Documentation of the physical-device, installed-build, and authenticated
  session prerequisites, plus an explicit statement of what the suite does not
  qualify.

Out of scope:

- Auth0 credential entry, browser login automation, or a fake authenticated
  provider. A tester signs in to the installed app before executing a flow.
- Fake permission, native capture, upload, provider, or network outcomes.
- Recording success, pause/resume/end, recovery, upload, transcription, or
  translation-provider end-to-end qualification.
- iOS coverage. Android is the supported mobile product platform under
  ADR-007.
- Changes to product behavior or existing mobile component contracts unless a
  missing stable test selector prevents a required assertion.

## Design

`apps/mobile/maestro/config.yaml` defines recursive flow discovery. Each flow
declares the Android application identifier in its Maestro header.
`apps/mobile/maestro/flows/` contains the three independently runnable YAML
flows. A root workspace command named
`test:e2e:mobile` invokes Maestro against that directory so the standard test
strategy command is real rather than a placeholder.

Each flow starts from an authenticated Home screen. This is a deliberate
environment precondition, not an assertion that login succeeded: Auth0 PKCE
uses an external browser and must remain a real authentication boundary. The
run instructions require an Android 12+ device or emulator, the current
development APK/dev build installed, and a manually authenticated test account
whose data contains no real meeting content.

The Record flow selects Record, opens setup, enters a synthetic title, chooses
Vietnamese, requests microphone permission, and verifies the readiness screen.
It also asserts that Start is unavailable when native capture reports it is
unavailable; the script must not claim a recording was created.

The Translate flow selects Translate, opens setup, enters a synthetic title,
chooses English, requests microphone permission, then enables cloud processing.
It verifies that the explicit consent control becomes visible and that Start
remains unavailable until consent is granted (or native capture is available).
The assertion protects the product rule that cloud work requires an explicit
disclosure and consent.

The permission-denied flow uses Maestro's Android permission control against a
real system dialog. It asserts the existing permission-denied error and retry
CTA only; it does not fake a device response inside the app.

## Failure behavior

If no device is attached, no build is installed, the app is not authenticated,
or the Android permission dialog is in an unexpected persisted state, Maestro
must fail and report that unmet precondition. The runner must not skip or mark
such flows as passed. Run instructions include resetting the test app's
permission/session state between flows when required by the device.

The suite asserts only visible UI and accessibility contracts. It never logs
meeting title text, audio, transcript, translation, object URLs, or credentials
in committed artifacts.

## Verification

- A focused repository test verifies that the Maestro command discovers exactly
  the three required flows and rejects an empty/missing suite.
- The focused test initially fails before the suite/command exists, then passes
  after implementation.
- `pnpm test:e2e:mobile` is executed only where Maestro, an installed Android
  development build, an attached device/emulator, and the authenticated session
  precondition are available. Its output is recorded as device evidence, not
  replaced with a fake or mocked run.
- Existing mobile unit tests and typecheck remain regression gates for any
  selector or command changes.

## Acceptance criteria

- The repository contains three named Maestro flows for Record, Translate
  consent, and microphone denial.
- The root `pnpm test:e2e:mobile` command invokes those flows.
- Flows are Android-only and use synthetic input.
- Auth0, permission, capture, and provider behavior are not simulated.
- Missing real prerequisites produce an explicit unavailable/failed state, not
  a pass claim.
- Run documentation enables a developer to prepare the device and execute the
  suite without exposing a credential or real meeting content.

## Non-goals and follow-up

Recording controls/recovery E2E belongs to the existing P09/P10 qualification
work and must be added only when its real Android device evidence can be
captured. This suite establishes the pre-meeting mobile E2E baseline and does
not change the lifecycle state of P09, P10, or the currently active P16 phase.
