# Meetily Reference Review

**Status:** Accepted research note  
**Owner:** Architecture  
**Last reviewed:** 2026-07-21  
**Reference:** `C:\Users\thien\Documents\Project\PersonalProject\CheckGithub\meeting-minutes`

## Purpose

This is a clean-room architectural review of the local Meetily repository. It records useful patterns and failure modes without copying source, prompts, templates, assets or product text. Kaiser’s Meeting Space remains governed by its own PRD, ADRs and evidence-preservation requirements.

## Executive decision

Keep the existing split:

- Node.js/Fastify is the cloud control plane: identity, authorization, meeting state, signed uploads, jobs, provider routing and synchronization.
- Expo/React Native remains the mobile application.
- Electron/React remains the desktop document/UI shell.
- A narrow Rust native runtime owns desktop audio capture, device monitoring, resampling/mixing derivatives and optional local AI.

The reference is a local-first Tauri/Rust desktop application. It validates that Rust is a good native/audio/local-model boundary, but it does not replace the need for KMS cloud sync, mobile, owner authorization or asynchronous server workflows. Its community code also does not implement the diarization/export guarantees required by KMS.

## Adopt or improve

### 1. Incremental recording and a visible recovery inbox

Reference evidence:

- `frontend/src-tauri/src/audio/incremental_saver.rs` writes periodic checkpoints and can merge them after a crash.
- `frontend/src/hooks/useTranscriptRecovery.ts` discovers, previews, recovers or deletes interrupted meetings.
- `frontend/src-tauri/src/audio/common.rs` uses temporary-file then rename for transcript writes.

KMS adaptation:

- Write 5–10 second source chunks after benchmarking, not a hard-coded 30 seconds.
- Store actual duration, source, monotonic range, byte length and SHA-256 in an atomic manifest.
- Acknowledge a chunk only after durable local write; upload remains asynchronous.
- On startup show a Recovery Inbox with meeting, start time, source tracks, verified duration, transcript state and choices `Continue`, `Finalize` or `Delete`.
- Test crashes before write, after write/before manifest, after manifest/before upload and during finalize.

### 2. Device health and diagnostics

Reference evidence:

- `frontend/src-tauri/src/audio/device_monitor.rs` handles disconnect/reconnect and gives Bluetooth devices a grace period.
- `frontend/src-tauri/src/audio/diagnostics.rs` records device capabilities, latency, sample rate and channel information.

KMS adaptation:

- Identify devices using stable OS endpoint IDs, not display names.
- Emit typed hot-unplug, reconnect, default-device-change and format-change events.
- Debounce transient Bluetooth loss; never switch sources silently.
- Ask before fallback, mark gaps on the timeline and preserve the last finalized chunk.
- Keep content-free diagnostics for device, negotiated format, buffer pressure, overruns and reconnect count.

### 3. Real audio pipeline lessons

Reference evidence:

- `frontend/src-tauri/src/audio/pipeline.rs` uses persistent resampling, parallel microphone/system streams, ring-buffer alignment, zero-padding and overflow diagnostics.
- A VAD branch feeds transcription while the recording branch retains full mixed audio.

KMS adaptation:

- Use persistent anti-aliased resamplers; never recreate a resampler for every callback.
- Use bounded lock-free/ring buffers and explicit overflow policy/telemetry instead of unbounded channels.
- Preserve microphone and system audio as separate immutable source tracks on one monotonic meeting timeline.
- Create a derived mix for playback/transcription; the mix is never the only evidence.
- Apply VAD only to reduce transcription work. VAD must not remove source audio.
- Benchmark drift, jitter, clipping, source dropout, format changes and two-hour memory use.

### 4. Local model lifecycle

Reference evidence:

- `frontend/src/components/BuiltInModelManager.tsx`, `useTranscriptionModels.ts` and `parakeet_engine/parakeet_engine.rs` expose download progress, resume, retry, cancellation and deletion.

KMS adaptation:

- Model manifest contains ID, version, hash, size, license, source, hardware compatibility and minimum app version.
- Downloads resume safely and activate only after checksum/signature verification.
- Local workers report readiness, progress, resource use and cancellation.
- Cancellation cannot corrupt a model or partially publish a transcript/minutes artifact.
- CPU/GPU concurrency and thermal/memory limits protect active recording.

### 5. Long-transcript UX

Reference evidence:

- `frontend/src/components/VirtualizedTranscriptView.tsx` uses virtualization, pagination and conditional auto-scroll.

KMS adaptation:

- Virtualize long transcripts and fetch pages without changing stable sequence/timestamp identity.
- Follow the latest segment only while the user remains at the end.
- When the user scrolls upward, preserve position and show a new-items control.
- Benchmark scroll, search, seek and speaker filtering on a two-hour transcript.
- Never remove filler words from the evidence view.

### 6. Data-driven minutes templates

Reference evidence:

- `frontend/src-tauri/src/summary/templates/types.rs` defines template sections and validation.
- `frontend/src-tauri/templates/*.json` makes meeting layouts discoverable without hard-coding UI branches.

KMS adaptation:

- Use a versioned runtime-validated template schema: ID/version, localized name, ordered blocks, block type, required evidence, optional rules and supported export behavior.
- Templates describe output structure; provider prompts remain versioned implementation assets.
- AI output stays structured and must pass schema, citation and coverage validation before publication.

### 7. Safe regeneration and long-job progress

Reference evidence:

- Summary persistence backs up existing content during regeneration.
- Import/retranscription flows expose explicit stages and cancellation.

KMS adaptation:

- Generate into a draft version. Failure/cancel never changes the selected published version.
- Publish only after schema/evidence/coverage gates.
- All long jobs expose stable stages, progress, safe error and retry/cancel state.
- Audio import/retranscription becomes a bounded later phase using immutable imported evidence and new transcript projections.

### 8. Packaging and updates

Reference evidence:

- `.github/workflows/release.yml` builds signed installers and updater artifacts.
- Tauri configuration bundles native sidecars and an updater public key.

KMS adaptation:

- Sign desktop shell, Rust runtime and installer; verify signatures at install/update/runtime boundaries.
- Produce SBOM and provenance, use staged update channels and test rollback/kill switches.
- Run a synthetic smoke meeting on each supported OS before promotion.

## Explicitly rejected patterns

| Pattern                                            | Evidence                                                                       | Reason rejected                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Store only a premixed recording                    | `audio/incremental_saver.rs` stores mixed audio                                | Loses independent source evidence and makes later recovery/diarization harder                                  |
| Hide filler words in transcript UI                 | `VirtualizedTranscriptView.tsx` and `TranscriptView.tsx` call `cleanStopWords` | Violates complete transcript and evidence fidelity                                                             |
| Plaintext provider keys in local settings/database | Settings repositories and initial migrations include `apiKey`                  | KMS uses server secret manager or OS keychain references; renderer never receives stored secrets unnecessarily |
| Unbounded audio/work queues                        | Multiple Rust audio/transcription modules use `unbounded_channel`              | Sustained overload can exhaust memory; KMS requires bounded buffers and measured overflow behavior             |
| Time-based sleeps as lifecycle synchronization     | Recording start/stop paths include fixed sleeps                                | KMS requires acknowledgements/state transitions with timeouts, not timing assumptions                          |
| Delete checkpoints immediately after merge         | Incremental saver removes checkpoints after FFmpeg merge                       | KMS retains source chunks until final object checksum/duration and retention policy are verified               |
| Broad desktop permissions                          | Tauri config grants broad filesystem/process permissions                       | KMS IPC and local capabilities are allowlisted per command/path                                                |
| Treat `audio_v2` as production reference           | `audio_v2/lib.rs`, `sync.rs`, `limiter.rs`, `resampler.rs` contain core TODOs  | Marketing names and placeholders are not implementation evidence                                               |
| Provider enum/central match as extensibility       | Summary/provider code branches centrally per vendor                            | KMS uses capability-based adapters and conformance tests                                                       |
| PR workflow without mandatory quality gates        | Reference validation workflow is manual                                        | KMS requires automatic lint/type/test/security/build gates on every PR                                         |

## Technology comparison outcome

### Why not replace Node/Fastify

The reference does not have the KMS cloud control-plane responsibilities. Audio callbacks and local inference belong in Rust, but network I/O, jobs, provider routing, sync and shared contracts remain efficient in Node/TypeScript. CPU-heavy work is isolated in Rust/Python workers.

### Why not replace Expo

The reference is desktop-only. It offers no evidence that Flutter or Tauri mobile would improve KMS mobile capture, shared TypeScript contracts or integration with the React desktop editor. Expo development builds still permit native audio modules.

### Why not switch Electron to Tauri now

Tauri is viable and lighter, but the useful capability comes from Rust audio—not from the shell itself. Electron retains the mature React/editor/runtime ecosystem. A narrow signed Rust sidecar/native bridge provides native performance while avoiding a full shell migration. Reconsider only after measuring memory, installer size, updater/security workload and WebView/editor compatibility with a representative prototype.

## License and provenance

The reference root is MIT licensed (`LICENSE.md`). Copies or substantial portions require its copyright/license notice. It also acknowledges code/dependencies from Whisper.cpp, Screenpipe and transcribe-rs and bundles model/binary concerns that require separate license review.

For this review:

- No source, prompt, template, asset or product copy was copied.
- Patterns are implemented clean-room against KMS contracts/tests.
- Future dependency/code reuse requires license, FFmpeg build-flag, codec patent, model-weight and dataset-term review.

## Changes required in KMS plans

1. Add a Rust native capture foundation before Windows capture: typed IPC, simulator, bounded buffers, stable device IDs and signing boundary.
2. Add Recovery Inbox and crash-boundary test matrix to mobile and desktop recovery work.
3. Add device hot-plug/Bluetooth/sleep-wake scenarios and content-free diagnostics.
4. Add persistent resampler, independent source tracks and derived-mix rules.
5. Add local model manifest/download/verification/resource lifecycle.
6. Add two-hour transcript virtualization/autoscroll/search acceptance.
7. Make minutes templates data-driven and runtime validated.
8. Add draft-only AI generation and publish-after-validation semantics.
9. Add optional import/retranscription after core capture/transcript reliability.
10. Add signed native runtime, SBOM/provenance and updater rollback tests.
