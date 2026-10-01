# Online-headset full-pipeline harness

## Purpose

Prove the real Windows desktop flow for an online meeting while the user wears
headphones: Windows loopback captures remote participants' audio, microphone
captures the local participant separately, the committed system-audio source is
transcribed locally, and the finalized meeting can be reopened and exported.

This is a new `online-headset-full` harness profile. It does not replace the
existing physical microphone-through-speaker test, which remains necessary to
prove acoustic microphone capture.

## Scope

The profile accepts exactly one existing duration: `5m`, `1h`, `3h`, or `4h`.
It requires explicit real-audio opt-in, one selected connected microphone, one
selected connected system-audio loopback endpoint, a packaged Electron app,
the packaged native sidecar, a verified local model, and the committed
synthetic meeting fixture.

The harness plays the fixture through the active Windows output. With
headphones, the native sidecar captures that playback from WASAPI loopback;
the fixture never needs to be audible to the microphone. The harness launches
the packaged application, selects both endpoints, starts physical capture,
samples health throughout the selected duration, finalizes the meeting, checks
source manifests and hashes, transcribes the system-audio source using the app
UI and local model, checks transcript quality, reopens the meeting, and exports
Markdown.

No external meeting, provider, network speech service, or real meeting content
is used.

## Source-track rules

Microphone and system-audio remain independent immutable source tracks. The
test requires system-audio chunks, non-zero system peak, no system gaps,
no overflow, clean finalization, and manifest/hash verification. It requires a
selected microphone track to start and remain healthy, but does not require
non-zero microphone signal: a user wearing headphones can remain silent while
the remote-participant loopback transcript is still the subject under test.

A missing microphone, unavailable endpoint, native failure, source gap,
overflow, failed hash, simulated inference, failed quality check, failed reopen,
failed export, or unverified cleanup is a failing or blocked result as
appropriate. The harness never converts these conditions to a pass.

## Transcript and acceptance

Only verified system-audio chunks are supplied to the existing local
transcription UI. Expected transcript segments are repeated to the chosen test
duration, then compared with the existing WER, phrase-coverage, and timestamp
rules. A PASS also requires a non-simulated initialized local-speech runtime,
cleanly finalized source evidence, compatible reopened transcript, and a
verified Markdown export.

## Evidence

Each run produces sanitized evidence beneath a unique artifact directory:

- top-level full-pipeline summary;
- recording subdirectory with 10-second operational samples and capture result;
- separate microphone and system source labels, chunk counts, gaps, peaks,
  drift, overruns, and integrity metadata;
- transcript quality values and exported artifact hash/size.

Evidence excludes raw audio, transcript text, endpoint IDs, file paths, and
credentials. Failed runs retain enough sanitized operational data to diagnose
the failed gate.

## Command interface

The Windows test CLI accepts `--profile online-headset-full --duration <one
duration>`. The caller supplies `KMS_MIC_DEVICE_ID`, `KMS_SYSTEM_DEVICE_ID`,
and the existing verified model variables. The profile is never run implicitly
by the unit suite; only the explicitly selected profile runs.

## Tests

Unit tests cover profile parsing, prerequisite failures, endpoint selection,
microphone-silent/system-active acceptance, system source selection for
transcription, and failures for absent system chunks, system gaps, missing
system signal, simulated inference, failed quality, reopen, export, and
cleanup. Tests use no physical device.

The manual E2E gate is one explicit Windows invocation using headphones and a
synthetic fixture. It passes only if the complete evidence contract passes.
