# M1 Capture-Only Native Build — Design

**Date:** 2026-09-10
**Status:** Approved
**Decision:** Build the Windows M1 native sidecar without the local Whisper dependency. Local post-recording speech remains an opt-in native capability for M4.

## Context

The approved Windows offline-first roadmap sequences visible desktop/native boot (M1) before local post-recording transcription (M4). The current native crate makes `whisper-rs` unconditional, so an upstream Windows CMake/bindings incompatibility prevents producing any sidecar, including capture-only M1.

Direct diagnostics established:

- GNU build needs an actual MinGW runtime and then fails because `whisper-rs-sys` passes MSVC-only `/utf-8` to GNU C++.
- MSVC reaches `whisper-rs` but fails because generated bindings expose `u32` values where `whisper-rs 0.16` declares Windows enum discriminants as `i32`.
- The failure is in local speech dependency compilation, not in the native capture/runtime protocol.

## Design

Make `whisper-rs` optional behind a Cargo feature named `local-speech` that is **off by default**. Gate the `local_speech` module, its `NativeRuntime` storage, and its command dispatch behind the same feature.

When `local-speech` is disabled, the native sidecar still starts, emits `runtime_ready`, and supports the existing storage, simulator, capture, device, and health commands. Every `local_speech_*` command remains in the protocol allowlist for compatibility but returns a truthful stable `NOT_AVAILABLE` response explaining that the local speech capability was not built. It must never simulate transcript output.

When `local-speech` is enabled, the pre-existing module and command behavior compile and run unchanged; resolving the upstream Whisper Windows toolchain incompatibility is explicitly deferred to M4.

## Boundaries

In scope: `native/crates/kms-native/Cargo.toml`, `main.rs`, `runtime.rs`, native runtime unit tests, and focused native-contract tests only if the response error contract needs an explicit assertion.

Out of scope: Electron renderer/main process, API, meeting lifecycle, capture implementation, model files, provider credentials, dependency upgrades/forks, CMake patches, audio recording, transcription quality, and package signing.

## Acceptance

1. Default release build does not compile `whisper-rs` and produces `kms-native.exe` using the Windows build environment.
2. Existing non-speech runtime/capture tests pass with default features.
3. A `local_speech_*` request to the default binary receives a deterministic `NOT_AVAILABLE` safe error; no fake success/output occurs.
4. `cargo check --features local-speech` continues to include the existing local-speech code path; any upstream Windows build limitation is reported truthfully and does not block M1.
5. No code outside the native capability boundary changes.

## Consequences

M1 can produce a real Electron/native capture shell. The UI must not advertise local transcription as available until M4 is built with the feature and validated with an installed model. This preserves the owner’s offline-first goal while avoiding an upstream speech toolchain defect from blocking capture boot.
