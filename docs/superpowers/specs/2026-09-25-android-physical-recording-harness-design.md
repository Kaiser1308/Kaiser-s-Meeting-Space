# Android Physical Recording Harness Design

## Goal

Provide a selectable harness for exercising the real Android microphone
recording path on a connected physical phone, following the same operator
model as the Windows audio harness: choose one profile and one duration per
invocation, observe the real app, then report evidence without claiming tests
that were not run.

The first profile is `physical-recording`. Supported durations are `5m`, `1h`,
`3h`, and `4h`. The harness measures recording continuity, durable chunk
metadata, and cleanup/finalization. It does not test transcription or minutes
generation.

## Approved approach

Use a host-side Node.js runner with Android Debug Bridge (ADB) and Android's
built-in UIAutomator hierarchy/input facilities to drive the installed app's
production screens. Do not require a Maestro helper APK or add a test-only
screen/deep link to the app.

Alternatives considered:

| Approach | Benefit | Trade-off | Decision |
| --- | --- | --- | --- |
| ADB + built-in UIAutomator through production screens | Exercises the same app flow and native recorder the user operates; no additional helper app | OEM/system-dialog and hierarchy differences need explicit handling | Selected |
| Debug-only test screen or deep link | Easier deterministic control and status access | Adds a separate app path and can bypass production behavior | Deferred |
| Android instrumentation that calls the native module directly | Focused and potentially stable native-module test | Does not cover app lifecycle, readiness, or production UI flow | Deferred |

The runner must locate controls from the current accessibility/UI hierarchy and
their labels, not fixed screen coordinates. It may use coordinates derived from
the current hierarchy bounds when ADB input requires a tap. Unknown or
ambiguous UI is a stop condition, not permission to guess.

## Scope

Included:

- One real physical Android device explicitly selected by serial.
- The installed debuggable development APK and its real `AudioRecorder` native
  module. Results qualify that source/build on a physical device, not release
  signing or a production distribution package.
- The normal app route: Home → Set up meeting → meeting setup → permission →
  readiness → Start recording → End.
- One duration per run: `5m`, `1h`, `3h`, or `4h`.
- Device/storage/permission/native-module preflight; monotonic duration timing;
  periodic health observation; finalization and chunk-integrity checks.
- Sanitized run summaries and a safe failure classification.

Not included:

- Simulator capture, fake devices/providers, or a native-module bypass.
- Speech recognition, transcript quality, translation, minutes, export, or any
  full-pipeline assertion.
- Emulator qualification, background-recording claims, system-audio capture,
  calls/route-change qualification, or the complete P09 physical matrix.
- Installing/updating/uninstalling the app, changing Android settings,
  clearing app data, changing permissions through ADB, or deleting recordings.
- Automatic execution of all durations as a batch.

This harness adds qualification capability only. It does not change P09's
`IMPLEMENTED` state or close any P09 acceptance gate by itself.

## Invocation contract

The eventual CLI should make the selected device, duration, and real-audio
consent visible, for example:

```powershell
pnpm --filter @kms/mobile test:android -- --profile physical-recording --duration 5m --device <adb-serial> --allow-real-audio
```

The command above is a proposed interface, not an existing script. Each run
must require exactly one supported profile and duration, an explicit device
serial, and `--allow-real-audio`. Missing or duplicate selections are rejected
before touching the phone. Long-duration runs receive an additional clear
confirmation showing estimated data use and expected wall time.

The runner must not install or replace the APK. The operator installs the
intended debuggable development build through the normal reviewed process. The
runner verifies the application package and records its version/build identity
where available; a wrong, non-debuggable, or unidentifiable build is
`BLOCKED`. A successful run is not a release-package qualification.

## Preconditions and consent

Before starting a recording, the runner verifies:

1. ADB is available and the explicitly selected serial identifies exactly one
   authorized physical device; an emulator or ambiguous/missing device is
   `BLOCKED`.
2. The expected app package is installed and launched, and the user is already
   in an authenticated development session. The runner does not automate login
   or store credentials.
3. The native recorder is available in the installed build. Expo Go or a build
   without the module is `BLOCKED`.
4. The app can reach the ordinary setup/readiness flow and the target controls
   can be identified unambiguously.
5. The phone has enough free internal storage for the selected duration plus a
   25% safety margin, based on the negotiated capture format. For the current
   48 kHz, mono, 16-bit PCM path (96,000 bytes/second), estimated source data is
   about 28.8 MB for 5m, 345.6 MB for 1h, 1.04 GB for 3h, and 1.38 GB for 4h;
   the corresponding preflight floor with margin is approximately 36 MB,
   432 MB, 1.30 GB, and 1.73 GB. Recompute if the actual format changes.
6. The debuggable package permits scoped `run-as` access so the runner can
   read only the current run's manifest and invoke an on-device checksum over
   its chunk files; raw audio is never transferred to or saved on the host. If
   the run-owned path cannot be identified without scanning other meetings or
   reading the app database, integrity verification is `BLOCKED`.
7. The phone can remain unlocked, on the recording screen, and preferably
   charging for the whole foreground run. The harness does not alter
   screen-timeout, stay-awake, battery, or other device settings.

The app's normal runtime permission prompt is part of the production route.
When it appears, the harness pauses for the operator to grant or deny
`RECORD_AUDIO` on the phone. It never uses `pm grant`, changes Settings, or
retries through a hidden permission path. Denial or unavailable permission is
`BLOCKED`; no capture starts.

## Real-audio stimulus and privacy

The primary assertion is that the actual phone microphone path records and
finalizes the selected duration. A local, versioned synthetic spoken fixture
may be played through a separate host speaker into the phone microphone. It
must contain no real meeting content or personal data. The same-phone speaker
route is not used because app audio focus may interrupt capture.

Fixture playback is optional for the initial stability profile. A run without
the fixture can make continuity, storage, and integrity claims only; it cannot
make an acoustic-quality or speech-recognition claim. Fixture identity/hash
and route are recorded when used. No YouTube stream, network audio, live
meeting, or copyrighted source is an automated PASS/FAIL fixture.

The harness creates a clearly identifiable synthetic test meeting/session.
Audio remains in the app's private storage and is not copied to the host or
committed. The runner must inspect/hash only artifacts attributable to its
unique run ID; it must not scan, export, or modify unrelated meeting data. It
does not automatically delete the generated recording. Retention and cleanup
remain explicit operator actions, and the summary reports the run ID and
estimated on-device bytes so the user can locate and remove the test data
through a supported app path later.

Evidence must not contain raw audio, transcript text, meeting title, account
identity, full UI dumps, screenshots, or unredacted logcat. Store only
sanitized status/error codes, stable local device label, app/build identity,
durations, byte/sample/chunk counts, hashes, and aggregate health metadata.

## Run lifecycle

1. Parse and validate the single selected profile/duration, serial, and
   `--allow-real-audio` opt-in.
2. Perform read-only device, app, permission-state, native-module, storage, and
   foreground preflight. Do not launch capture if any precondition fails.
3. Open the app and use its real UI flow to create a synthetic run-named
   meeting. Pause for the operator at the OS microphone prompt when needed.
4. Start through the visible readiness action. Start the monotonic timer only
   after the app/native state confirms `recording`.
5. During the selected interval, poll foreground/app liveness and recording
   state every 5 seconds. Every 60 seconds, record a health sample containing
   committed-chunk progress, free storage, process PSS, and battery level and
   temperature where exposed by Android. Keep only whitelisted numeric fields
   and safe error codes; never collect content logs. A missed required sample
   or unexplained gap is not silently ignored.
6. At the deadline, send End using the visible production control and wait for
   the app's terminal durable state. Verify that the run's chunks and manifest
   are finalized, have monotonic boundaries and consistent byte/sample
   metadata, and match their SHA-256 checksums computed on-device. The active
   interval must be within 10 seconds of the selected 5-minute duration or 30
   seconds for longer durations, measured from native recording acknowledgment
   through native End acknowledgment.
7. Write a sanitized summary and leave the synthetic recording in app-private
   storage. Do not force-stop, clear data, uninstall, or attempt destructive
   recovery if End fails.

If the app backgrounds, the phone locks, the process dies, or the UI becomes
unrecognizable, the run is `FAIL` or `BLOCKED` according to whether a tested
assertion failed or a prerequisite became unavailable. The runner must not
force-stop the app to make the run appear clean. If it cannot safely issue End,
it instructs the operator to inspect/end/recover the session manually and
reports finalization as failed or unknown.

## Evidence and result states

Each run writes one JSON summary plus a concise human-readable report under an
ignored local test-results directory. The report includes:

- Profile, selected duration, unique run ID, fixture ID/hash/route if used.
- Redacted device label/model/API level, app package/version/build identity,
  runner and ADB versions.
- Start/end monotonic timestamps, elapsed recording time, health-sample
  coverage, foreground/liveness results, and observed interruptions/errors.
- Initial/final free space, negotiated format, expected/actual bytes and
  samples, chunk count/boundaries, manifest/finalization outcome, and hashes;
  aggregate/minimum/maximum process PSS and battery observations where
  available.
- Safe error codes and any prerequisite that prevented a full run.
- On-device retention notice and operator cleanup guidance.

States:

- `PASS`: selected interval completed in the production app; required health
  observations are complete; all run-owned chunks/manifest finalize and pass
  the declared integrity checks; no unexplained gap, crash, or unknown cleanup
  state occurred.
- `FAIL`: the intended app/device was available, but a tested behavior failed
  (for example crash, data loss, unexplained gap, corrupt chunk, failed End, or
  completed interval outside tolerance).
- `BLOCKED`: a prerequisite or owner action was unavailable (for example no
  exact device, permission not granted, wrong/missing build, insufficient
  storage, unsupported UI/system prompt, or inaccessible safe metadata).

A shortened run, guessed UI action, synthetic device/provider, missing required
health sample, or unknown finalization state can never be `PASS`.

## Acceptance criteria for implementation

- [ ] CLI accepts exactly one `physical-recording` run and one duration from
      `5m`, `1h`, `3h`, `4h`; it rejects ambiguous or implicit selections.
- [ ] Preflight is read-only and blocks before capture when device, app,
      permission, storage, native-module, or UI requirements are unmet.
- [ ] The runner reaches recording and ends it only through the production UI;
      no helper APK, test-only app route, `pm grant`, fake provider, or hidden
      capture API is introduced.
- [ ] Permission prompts require a human decision, and denial leaves
      permissions and app/device settings unchanged.
- [ ] Duration uses a monotonic clock; the runner records required health
      samples and classifies early exit/crash/gap/end failure accurately.
- [ ] Integrity verification is restricted to the unique harness run and
      produces hashes/metadata without retaining raw audio on the host.
- [ ] Every exit path writes a sanitized result; no audio, transcript, secrets,
      account identity, full UI hierarchy, or raw logs are persisted as
      evidence.
- [ ] A run leaves unrelated app/device data untouched and does not
      automatically delete the generated test recording.
- [ ] Unit/contract tests cover CLI validation, state classification, timing,
      privacy filtering, and failure paths; at least one direct physical-device
      run is separately required before claiming device qualification.
- [ ] P09 remains `IMPLEMENTED` until its complete authoritative physical and
      integrated acceptance gates have independently recorded evidence.

## Implementation boundary

Implementation must be planned as a separate task after review of this spec.
The first implementation task should validate ADB/UI hierarchy control and
safe access to only the current run's finalized metadata on the existing
physical device. If either requires a helper APK, permission mutation, broad
private-data scan, or product test-only route, stop and return with the
specific blocker for approval rather than silently changing this design.

Future `simulator-full` or `physical-full` Android profiles are separate
proposals. They require a real supported Android speech/pipeline path and
frozen local fixtures; this spec does not create mocks or imply those
capabilities exist.
