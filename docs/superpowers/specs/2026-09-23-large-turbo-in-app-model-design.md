# Large Turbo In-App Model Design

## Status

Design approved in conversation on 2026-09-23; written-spec review is pending.
This document authorizes design review only. It does not authorize P28 code
changes before the P14 dependency gate is satisfied.

## Goal

Make Whisper Large-v3 Turbo Q5_0 the desktop app's default local-final speech
model for explicitly selected Vietnamese or English, while retaining the
existing Small profiles as user-selectable lighter alternatives. The app offers
an explicit, verified in-app download so the installer does not grow by roughly
547 MiB. Once installed, transcription works offline.

## Current context

- `apps/desktop/src/local-speech-client.ts` has fixed Vietnamese Small and
  English-only Small profiles. `transcription-workflow.ts` selects one from the
  explicit meeting language and sends its ID, path and SHA-256 to native IPC.
- The native model root is inside Electron's app-private
  `userData/native-storage` directory. The renderer cannot choose native paths.
- The Windows installer currently packages the native sidecar, not model data.
- The workspace copy of `ggml-large-v3-turbo-q5_0.bin` is 574,041,195 bytes
  (about 547 MiB) with SHA-256
  `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2`.
  This local copy is not itself a production catalog or distribution review.
- P13/P14 transcript-run, part, window, reconciliation and immutable-source
  contracts remain unchanged. The app continues to require an explicit `vi` or
  `en` language; Large Turbo does not enable automatic language detection.

## Considered approaches

1. **Explicit in-app download (selected).** Keeps the installer smaller and
   supports a verified, cancellable model lifecycle. Requires network only when
   the user chooses to download a model.
2. **Bundle model in the installer.** Makes the model available offline on
   first launch, but adds about 547 MiB to every installer and release artifact.
3. **Manual model installation.** Smallest implementation, but unsuitable as a
   normal user experience and leaves model integrity/activation unclear.

## Model catalog and default selection

Use a versioned, allowlisted catalog. It contains the Large Turbo profile and
the existing Vietnamese multilingual Small and English-only Small profiles so
the user can explicitly choose an installed lighter model. Catalog entries bind
model ID/version, engine compatibility, supported explicit languages, source
repository and immutable revision, HTTPS artifact URL, license/provenance,
expected byte length, SHA-256, runtime/architecture compatibility, and resource
estimate. Catalog updates are versioned and signature-verified before use.

The Large profile is `whisper-large-v3-turbo-q5_0`, backed by
`ggml-large-v3-turbo-q5_0.bin`; expected size and digest are recorded above.
The source repository is
[ggerganov/whisper.cpp on Hugging Face](https://huggingface.co/ggerganov/whisper.cpp),
and the compatible model listing is maintained by
[ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md).
Implementation must pin an immutable source revision rather than `main` and
verify the pinned artifact against the SHA-256. The upstream repository lists
MIT licensing, and OpenAI publishes a
[Whisper MIT license](https://github.com/openai/whisper/blob/main/LICENSE);
these references do not replace the independent P28 provenance and
redistribution review of the exact quantized artifact before release.

Large is the app's persisted preferred default for both supported meeting
languages. The meeting language remains explicit and is passed unchanged to
inference. Small remains available as an explicit choice; selecting it persists
that user preference. There is no automatic model or provider fallback.

## User flow

1. Recording and finalization remain available without downloading a model.
   The app never downloads a model on launch, during recording, or merely
   because a meeting was created.
2. When the user requests local transcription and the selected model is
   absent, the app explains the model name, approximate download size, required
   disk space and offline use. The user explicitly starts or cancels the
   download, or explicitly selects an already-installed Small profile.
3. The model manager displays download/verification/ready/error progress and
   supports pause, resume and cancel.
4. Only a verified model can become active. Large remains the preferred default
   while absent or downloading, but it cannot run before verification. A
   download failure never silently activates Small or creates cloud work.
5. After successful installation, transcription uses the existing local
   speech IPC and P13 run/part workflow without a network dependency.

## Architecture and lifecycle

- A main-process model manager owns the catalog, network requests, safe model
  paths, disk checks, partial-download metadata, hash/signature verification,
  activation and removal. Renderer inputs are limited to catalog model IDs and
  user actions; they cannot provide URLs or filesystem paths.
- Models are stored under the app-private
  `userData/native-storage/models` root. The manager rejects traversal,
  symlink/reparse escape, unapproved origins/redirects, incompatible models,
  insufficient space and invalid catalog signatures.
- Lifecycle states follow P28: `absent`, `downloading`, `paused`, `verifying`,
  `ready`, `active`, `failed`, and `removing`. Download to a non-active partial
  file, persist bounded resume metadata, then verify the complete length and
  SHA-256 and catalog authenticity. Activate via an atomic filesystem boundary
  and update the active-model pointer only after verification. A crash or
  mismatch must preserve the previous active model; corrupt partial data is
  quarantined or removed safely.
- Removal is explicit and cannot remove the active/default model until the
  user chooses a different installed model or confirms a safe replacement.
  The manager never silently deletes existing local models to free space.
- Model lifecycle diagnostics contain model ID/version, byte counts, state and
  safe error codes only. They never contain audio, transcript, credentials or
  model bytes.
- Native inference continues to report its engine/model identity through
  existing transcript-run provenance. This feature does not change source
  audio, raw run events, P13/P14 projections, or transcript revision semantics.

## Failure behavior

| Failure | Required behavior |
| --- | --- |
| Offline, timeout, or server interruption | Keep recording unaffected; retain only a valid resumable partial; show retry/cancel. |
| Length/hash/catalog-signature mismatch | Never activate; quarantine/remove the candidate; preserve any active model; report a safe integrity error. |
| Insufficient disk or storage failure | Do not start or activate; report required/available space without deleting user data. |
| Crash during download or activation | Recover to the old verified active model or a non-active resumable partial; never expose a half-written active model. |
| Default Large absent or unavailable | Do not start local inference and do not create cloud work. Offer retry or an explicit switch to an installed Small model. |
| Inference resource pressure | Bound/cancel local inference and preserve capture priority; do not corrupt acknowledged audio or completed transcript parts. |

## Scope and non-goals

In scope: Windows desktop model catalog for the existing Large/Small local
profiles; explicit download, progress, resume/cancel, verification, activation,
selection, removal, recovery and UI; synthetic tests and model quality/resource
evaluation.

Out of scope: changing P13/P14 policies or transcript contracts, bundling model
weights, mobile local speech, local-live transcription, audio import, model
training/fine-tuning, arbitrary model URLs/plugins, automatic mixed-language
detection, local diarization claims, cloud fallback, and any model download or
network access during recording or active offline inference.

## Verification and release criteria

- Catalog tests prove allowlisting, immutable source pinning, license/provenance
  metadata, byte-length/hash/signature validation, language/runtime checks and
  app-private path containment.
- Lifecycle fault tests cover fresh download, resume, cancel, restart, disk-full,
  truncation, wrong digest/signature, rejected redirect/path, concurrent
  requests, and crashes before/after verification and activation. At every
  boundary, either the prior verified model remains active or a recoverable
  non-active partial remains.
- Desktop tests prove no startup/recording network request, explicit Large
  default, explicit Small selection, no silent provider/model fallback, and
  successful offline inference after installation using synthetic audio only.
- P13/P14 golden fixtures replay unchanged. Existing tests for immutable source
  audio, no cloud work on local failure, content-free logs and capture priority
  remain passing.
- Before optional release, P28-T07 records fixed synthetic Vietnamese/English
  quality and resource thresholds before tuning, including WER/CER, timestamps,
  real-time factor, CPU/memory/disk and cancellation. Prior simulator duration
  runs are not evidence of equivalent-length audio transcription or a
  controlled Small-vs-Large benchmark. No accuracy or speed advantage is
  claimed until these measurements pass on supported Windows profiles.
- P28-T08 independently reviews exact artifact licensing/provenance, catalog
  signing, download/path security, crash recovery, resource isolation and
  rollback. The feature remains optional and cannot weaken or block P27.

## Dependency and execution boundary

The accepted P28 packet requires P14 to be `VERIFIED`. Repository evidence
currently records P14 as `IMPLEMENTED`, with qualification gates still open.
Therefore this spec may be reviewed and planned, but its implementation must
not begin until the P14 dependency is directly verified. P28 is currently
`NOT_STARTED`; completing this desktop model feature alone must not be reported
as the full P28 phase being `VERIFIED`.
