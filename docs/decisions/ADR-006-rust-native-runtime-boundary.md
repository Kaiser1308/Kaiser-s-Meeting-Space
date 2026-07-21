# ADR-006: Rust native runtime boundary

**Status:** Accepted  
**Date:** 2026-07-21

## Context

Desktop audio callbacks, WASAPI loopback, device monitoring, resampling and optional local inference require predictable performance and platform APIs. Implementing these inside Node or the renderer would increase latency, memory and security risk. A review of the local Meetily repository confirmed Rust is practical for this boundary, while also showing risks from broad permissions, unbounded queues and mixing-only storage.

## Decision

Keep Electron/React as the desktop UI shell and Node/Fastify as the cloud control plane. Add a narrow Rust native runtime, delivered as a signed sidecar or native bridge selected during the foundation spike.

The Rust boundary owns:

- Microphone and Windows system-audio capture.
- Stable device enumeration/health events.
- Persistent resampling and bounded audio buffers.
- Local durable chunks/checksums/manifests through an injected storage interface.
- Derived playback/transcription mixing.
- Optional local speech/model execution.

It does not own cloud identity, authorization, meeting business state, provider credentials/routing, server jobs, minutes or exports.

IPC messages are versioned, runtime validated, allowlisted and content-minimal. Source microphone/system tracks remain independently immutable.

## Consequences

- Native audio/local AI do not depend on Node event-loop behavior.
- React/TipTap and shared TypeScript contracts remain available.
- The project must maintain a Rust toolchain, cross-platform builds, signing and IPC conformance tests.
- Crashes in the native runtime require supervised restart/recovery without losing finalized chunks.

## Alternatives

- Pure Node native modules were rejected for lifecycle/build/security complexity in the renderer/runtime.
- A full Tauri migration is deferred because the shell change is not required to gain Rust audio benefits.
- Python is retained only for isolated ML workers where its ecosystem is materially better; it is not an audio callback runtime.

## Review trigger

Re-evaluate Electron versus Tauri after a representative signed Rust capture prototype measures memory, package size, update complexity, WebView/editor behavior and security surface on supported Windows versions.
