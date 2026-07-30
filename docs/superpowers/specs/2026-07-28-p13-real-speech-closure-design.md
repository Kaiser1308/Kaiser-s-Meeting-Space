# P13 Real Speech Closure Design

**Status:** Proposed for owner review  
**Owner:** Product and Engineering  
**Date:** 2026-07-28  
**Scope:** Close the real local-file STT and live Deepgram gaps in P13 without entering P14 or P28

## 1. Decision

P13 will replace its simulated Windows local-speech implementation with an
embedded `whisper.cpp` runtime through the Rust `whisper-rs` bindings. The
existing provider-neutral contracts, deterministic `stt-window-v1` planner,
immutable run/part lineage, and local-speech IPC remain authoritative.

The first supported local profile is CPU-only:

- Vietnamese uses the allowlisted multilingual
  `ggml-small-q5_1.bin` model with language fixed to `vi`.
- English uses the allowlisted `ggml-small.en-q5_1.bin` model with language
  fixed to `en`.
- At most one inference window runs at a time.
- Local inference never opens a network connection and never creates cloud
  work after a failure.

PhoWhisper remains a later qualified model candidate. P13 does not add
downloadable catalogs, arbitrary model switching, mobile local STT, or local
live STT.

## 2. Lifecycle constraint

This closure may complete all automatable P13 implementation and Windows
qualification work, but P13 cannot truthfully become `VERIFIED` while:

- P09 remains below the lifecycle required by the accepted P13 dependency
  gate;
- the real Deepgram key and provider-policy prerequisites are unavailable;
- a frozen, synthetic or explicitly consented bilingual audio corpus has not
  been executed on the declared minimum Windows profile.

The phase remains `IMPLEMENTED` whenever one of those external gates remains
open. Evidence must distinguish implementation, host qualification, provider
qualification, and blocked acceptance criteria.

## 3. Native architecture

### 3.1 Components

The Rust local-speech boundary is divided into focused components:

- `manifest`: validates model identity, language, engine compatibility,
  license review, byte length, SHA-256, and app-private canonical path.
- `audio`: opens an allowlisted source file, validates container and sample
  format, extracts the exact requested range, converts to mono floating-point
  PCM, and resamples to 16 kHz when required.
- `model`: owns a loaded `whisper.cpp` context and translates engine output
  into provider-neutral segments.
- `engine`: owns queueing, resource policy, progress, cancellation, capture
  priority, and safe event emission.
- `runtime`: validates IPC payloads and maps failures to content-free native
  responses.

No component logs audio samples, transcript text, model contents, provider
payloads, or credentials.

### 3.2 Inference execution

Model loading and inference run outside Tokio's asynchronous executor through
a bounded blocking worker. The engine:

1. validates the model and source audio before allocating inference state;
2. acquires the single-window permit;
3. decodes only the requested source range;
4. invokes Whisper with the meeting language fixed explicitly;
5. converts Whisper timestamps into source-timeline milliseconds;
6. emits normalized progress and final segment data;
7. releases buffers and the permit on success, failure, panic, or cancel.

Thread count is bounded by the configured profile and never exceeds the
available logical CPU count. Capture has priority: inference cannot start while
the runtime reports an active constrained capture state, and long-running work
uses cooperative cancellation supported by the Whisper callback.

## 4. IPC contract

`local_speech_transcribe_window` will require:

- `runId`
- `partIndex`
- `planHash`
- `sourcePath`
- `sourceSha256`
- `startMs`
- `endMs`

The source path must resolve under the configured app-private audio root.
Canonicalization, extension/container validation, byte-length bounds, checksum
verification, and exact range validation happen before inference. Errors never
echo the path or transcript.

The success payload contains normalized segments with:

- stable sequence within the part;
- source-relative `startMs` and `endMs`;
- text;
- optional engine confidence when available;
- `isSimulated: false`.

The IPC version remains v1 because the command was never externally qualified
as a production capability. TypeScript and Rust golden fixtures change
together, and stale payloads without source identity fail closed.

## 5. Model verification and loading

The local manifest is extended to include byte length, reviewed source,
runtime compatibility, architecture, and resource estimate while preserving
the current versioned boundary. Activation requires:

- exact allowlisted model ID and meeting language;
- `whisper_cpp_compat` engine type;
- canonical model path under the app-private model root;
- exact SHA-256 and byte length;
- accepted license/provenance metadata;
- compatible runtime and Windows architecture;
- resource estimate within the configured host budget.

The current model binaries remain ignored by Git. Tests use a tiny
license-reviewed model fixture or dependency-injected fake backend; a fake
backend may verify control behavior but never counts as real STT evidence.

## 6. Audio boundary

P13 initially accepts the durable PCM WAV profile already produced by the
Windows runtime. The decoder validates RIFF/WAVE structure, PCM or IEEE-float
encoding, channel count, sample rate, block alignment, declared data length,
and truncation before reading samples.

Stereo or multi-channel input is downmixed deterministically without changing
the immutable source. Resampling produces a derived in-memory 16 kHz mono
buffer. Unsupported or malformed containers fail with a safe local error;
P13 does not add audio import or general transcoding.

## 7. Cancellation, failure, and recovery

Cancellation is observable at queue wait, decode/resample, and Whisper
inference boundaries. The target acknowledgement is at most two seconds.
Cancellation never marks a part complete.

| Failure                                 | Required result                                                          |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Model missing, corrupt, or incompatible | Reject before inference; preserve recording and previous committed parts |
| Source path escapes audio root          | Reject as a security error without echoing the path                      |
| Source checksum mismatch                | Reject as integrity failure                                              |
| Unsupported or malformed audio          | Reject locally; no cloud work                                            |
| Queue full or memory budget exceeded    | Return bounded retryable local error                                     |
| Engine panic or native failure          | Emit safe failure, release resources, keep runtime recoverable           |
| Cancel                                  | Stop within the bounded target and retain already committed parts        |
| Network unavailable                     | Local transcription behavior is unchanged                                |

No automatic local-to-cloud fallback is introduced.

## 8. Deepgram closure

The server exchanges a server-held Deepgram master key for a short-lived,
owner/meeting/language/source-bound client credential. The exposed key from the
earlier conversation is treated as compromised and is never persisted or used.

Live qualification requires a newly rotated key in approved server secret
storage and passes:

- Vietnamese and English synthetic sessions;
- consent, disclosure, owner isolation, expiry, replay, quota, and rollover;
- reconnect, provider outage, rate-limit, and safe error mapping;
- confirmation that recording continues independently;
- bundle, log, response, and telemetry secret scans.

Without the rotated key and approved provider policy, the Deepgram gate remains
blocked rather than mocked green.

## 9. Evaluation design

The existing corpus manifest is not sufficient because it contains references
but no audio. Closure adds immutable audio assets generated synthetically or
recorded with explicit consent before model tuning. Every entry binds:

- audio file SHA-256 and duration;
- language and acoustic condition;
- normalized reference transcript;
- provenance/consent class;
- expected timestamp anchors where available.

The same frozen corpus is run against both local models and authorized
Deepgram live. Reports calculate:

- clean and noisy WER;
- timestamp p95 error;
- local real-time factor;
- peak memory and CPU;
- cancellation latency;
- deterministic segment/range output;
- network-contact absence for local runs.

The accepted P13 thresholds remain unchanged: clean WER at most 18%, noisy WER
at most 30%, timestamp p95 at most 1.5 seconds, local RTF at most 1.0, and
cancel acknowledgement at most two seconds.

## 10. Testing strategy

Implementation follows test-first red-green-refactor cycles:

1. Rust audio parser/range/resampling tests using generated PCM fixtures.
2. Manifest path/hash/length/runtime/resource rejection tests.
3. Backend contract tests proving fixed language, timestamps, cancellation,
   resource release, and `isSimulated: false` for real inference only.
4. TypeScript/Rust IPC golden and negative conformance tests.
5. Runtime tests for panic, queue, cancel, capture priority, and recovery.
6. Real-model Windows smoke and frozen-corpus evaluation.
7. Deepgram authorized live/fault matrix when a rotated key is available.
8. Secret/content/network scans and the complete P13/repository gates.

Mock, fake, and generated control tests cannot replace required real model,
provider, hardware, or long-session evidence.

## 11. Rollout and rollback

Real local STT remains behind the existing local-final feature flag. Startup
reports unavailable until the model, runtime, host profile, and audio root pass
validation. Rollback disables new local jobs while preserving audio, manifests,
runs, parts, and raw events. It never deletes model or source evidence
automatically.

## 12. Scope boundary

This closure does not implement P14 scheduling, reconciliation, completeness,
cloud check execution, translation, minutes, mobile local STT, local live STT,
audio import, advanced model lifecycle, diarization approximation, arbitrary
models, or automatic provider/locality fallback.
