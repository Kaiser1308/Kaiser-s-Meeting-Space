# Windows Headset Capture and Vietnamese Transcription Design

## Purpose

Make the Windows desktop application trustworthy for an online meeting heard through a Bluetooth headset: distinguish real source loss from diagnostic telemetry, keep capture off the speech/model hot path, and make verified multilingual Large Turbo the default local transcription model.

## Scope and order

This is two ordered workstreams, with separate task commits and verification gates.

1. **Capture correctness and headset health.** This workstream is first because transcription cannot repair missing or misclassified source evidence.
2. **Vietnamese local transcription.** This workstream consumes finalized, integrity-verified source chunks from the first workstream.

No new provider, driver, virtual audio device, network dependency, or cloud transcription service is introduced. A virtual loopback or separate USB/wired microphone is documented as an operator fallback, not installed or required by the application.

## Current evidence and diagnosis

The consented live run on 2026-10-01 proved that the packaged application can open the soundcore R50i NC microphone and headphone loopback simultaneously and commit real microphone and system-audio WebM chunks.

The renderer showed `GAPS: 2` and `GAPS: 3`, while the native runtime emitted many `CAPTURE_FLAG:data_discontinuity` diagnostics. These are distinct signals:

- `CAPTURE_FLAG:data_discontinuity` is persisted as a zero-width diagnostic record. It does not itself assert missing source frames.
- The current renderer's `gapCount` comes from `TimelineAligner`, which compares manager processing progress with wall-clock `Instant`. It can report a derived-timeline gap when encoding, SQLite writes, or other manager work delays processing despite continuous device packets.
- The capture manager awaits durable recording of every packet diagnostic and awaits five-second chunk writes in the dispatcher path. That can delay queue draining and make wall-clock derived telemetry noisier during headset startup.

Consequently, the observed run is proof of real capture start, not evidence that the raw source audio was lost and not sufficient evidence that the headset configuration is stable for a production meeting.

## Design: capture correctness and health

### Source evidence and derived timelines

Source chunks remain immutable. A real source loss is only one of:

- an explicit `CaptureHandoff::Gap` or queue overflow with a positive frame range;
- a failed chunk commit with its durable recovery gap;
- a discontinuity demonstrated by consecutive WASAPI device positions/QPC positions, rather than delayed manager processing.

Derived alignment must use the packet's native device position and QPC position as its continuity clock. It must not infer source loss solely from wall-clock time spent in the manager/serializer. The result preserves monotonic derived timing while avoiding zero padding that is caused only by downstream scheduling.

### Capture health contract

`capture_get_state` exposes separate, named metrics for each source:

- `sourceGapCount` and `missingSourceFrames`: only durable positive-frame source loss.
- `overflowCount` and `overflowFrames`: handoff overload, always actionable.
- `diagnosticCount` and bounded diagnostic reasons: device/WASAPI warnings that do not assert source loss.
- `driftSamples`: derived-clock drift only; it is not labeled as source loss.

The existing `gapCount` compatibility field is retained until all desktop consumers have moved, but it is mapped only to `sourceGapCount`. It must never include zero-width diagnostics or manager wall-clock delay.

The desktop UI displays the first two categories as **Source loss** and **Overflow**, and the third as **Device diagnostics**. A nonzero diagnostic count is a visible warning, not a red failed-recording claim. A nonzero source loss or overflow is actionable and blocks a clean physical-test pass.

### Bounded diagnostic persistence

The realtime WASAPI thread stays allocation-free and uses only bounded `try_send` handoffs. The manager aggregates repeated packet-flag diagnostics by source and reason in memory, then durably flushes a bounded summary at normal chunk/finalization boundaries. It does not await a SQLite write for every repeated device flag.

Persisted diagnostics remain content-free: source, reason, count, device/QPC range, and session/meeting identifiers only. No audio, transcript, title, or device-path content is added to logs.

### Bluetooth profile guardrail

At record start, the renderer identifies a likely same-headset pairing when the selected capture endpoint is an HFP/"Headset" endpoint and the selected loopback is the matching A2DP/"Headphones" endpoint. It presents a non-blocking warning that Windows Bluetooth profile switching can affect capture stability and offers three precise operator choices:

1. Continue with the selected headset pair.
2. Use a separate microphone with the selected headphone loopback.
3. Record microphone only.

The guardrail does not alter endpoints automatically, install drivers, or silently disable system audio.

## Design: Vietnamese local transcription

### Default model policy

The verified multilingual `whisper-large-v3-turbo` model is the application default for `vi` and `en`. The existing English-only Small model remains an explicitly labeled lightweight English option; it is never selected automatically for Vietnamese.

Recording remains available without any model or network connection. The UI states that transcription is pending until a verified compatible model is present.

### Download and activation

The in-app download path uses the approved model manifest. Before activation it verifies model ID, allowed destination, expected SHA-256, byte-size limits, and atomic final rename. A failed/cancelled download leaves the last verified model active and is reported with a content-safe error.

The local speech client continues using a bounded request timeout suitable for large-model offline inference. Large-model decoding uses segment timestamps only; token-level experimental alignment is disabled unless a future benchmark proves it necessary.

### Language and transcript behavior

Meeting language remains exactly `vi` or `en`. There is no automatic mixed-language mode. A Vietnamese meeting routes to the multilingual model and preserves source audio and source transcript as immutable evidence. Any translation remains a later derived artifact and never replaces source text.

## Test strategy

### Synthetic and contract tests

- Timeline tests prove a delayed manager/serializer does not create a source gap when packet device/QPC positions are continuous.
- Timeline tests prove an actual position discontinuity creates exactly one positive source gap with exact missing frames.
- Capture-manager tests prove repeated diagnostics are aggregated, bounded, content-free, and do not cause queue overflow by themselves.
- Native contract and desktop tests prove the new health fields, compatibility mapping, UI labels, and Bluetooth warning choices.
- Model-manifest, download, cancellation, integrity, default-selection, and Vietnamese routing tests run without real meeting content.

### Physical verification

Physical tests require explicit audio opt-in and consented/synthetic audio only. They must not play a fixture during an actual meeting.

1. Packaged Windows 5-minute headset test: microphone and headphone loopback selected; require source gap count 0, missing source frames 0, overflow count 0, clean finalization, and bounded diagnostics recorded separately.
2. Packaged transcription test: a consented Vietnamese fixture or owner-approved recording; require verified multilingual model, non-empty source transcript, valid segment timing, and no English-only model selection.
3. One-hour headset stability test after the five-minute gates pass, with the same raw-loss and overflow gates. Diagnostics are reported, not hidden.

No result is called a successful real-meeting test without the stored evidence artifact and the stated binary gates.

## Non-goals

- No claim that Bluetooth HFP+A2DP is universally reliable on all headsets.
- No background recording, automatic endpoint changes, or access to a meeting without owner consent.
- No cloud/provider fallback and no model download requirement for recording.
- No deletion of finalized source evidence except an explicit owner-requested deletion operation.

## Acceptance criteria

1. A manager scheduling delay with continuous device/QPC positions does not increment raw source-loss health counters or generate source-gap padding.
2. Real handoff loss, overflow, and failed chunk commits are durably represented as positive source-loss evidence and remain test failures.
3. Repeated WASAPI packet flags do not trigger one synchronous SQLite write per event and appear separately from source loss in the desktop UI.
4. The headset pairing guardrail is visible before recording and never changes a user's endpoints automatically.
5. Vietnamese defaults to a verified multilingual Large Turbo model; an English-only model cannot be selected automatically for `vi`.
6. Recording works while no model is installed or a model download is unavailable.
7. The 5-minute physical headset and Vietnamese transcript gates provide direct, consented evidence before the one-hour stability run.
