# Windows Offline-First Personal MVP — Product Roadmap

**Date:** 2026-09-09
**Status:** Approved for planning
**Owner goal:** A personal Windows desktop application that records a meeting locally, creates and controls a real local meeting, transcribes after recording with a local model, and lets the owner revisit or export the result without requiring cloud credentials or network access.

## Why this roadmap exists

The repository's execution ledger documents the historical multi-phase product programme. It remains authoritative for those phase claims and must not be rewritten to imply that unfinished qualifications passed.

This document is the practical handoff for the owner's current MVP objective. Future agents must use this roadmap to choose work, execute one milestone at a time, and avoid expanding into mobile, cloud providers, enterprise auth, or product-wide qualification before the personal Windows workflow is demonstrably usable.

## Definition of a usable v1

On one Windows machine, the owner can:

1. launch the Electron desktop application;
2. see whether the native runtime is ready, and receive a truthful error if it is not;
3. create a meeting through the local API, receiving a real UUID;
4. select a microphone, start and stop local recording using that UUID;
5. retain the original local audio and its manifest through restart/failure-safe paths already provided by the native runtime;
6. run local post-recording transcription from an installed model when available, while clearly showing unavailable-model errors otherwise;
7. reopen the meeting, read its transcript, and export Markdown.

Out of scope for v1: mobile, cloud STT/LLM providers, OIDC setup, real-time transcription, shared users, production deployment, signing/updating, and provider-backed minutes generation.

## Evidence already available

- Local API meeting create/start/end lifecycle was directly exercised against PostgreSQL; timestamps and end idempotency are committed in `d67c33a6`.
- The desktop package typecheck passed during the 2026-09-09 read-only audit.
- Rust/Cargo, Node and pnpm are installed; local native models are present.
- The Windows native binary is not built at the expected `native/target/release/kms-native.exe` path.
- `apps/desktop/src/main/main.ts` constructs the native supervisor but does not start it; renderer commands consequently cannot rely on a ready runtime.
- `apps/desktop/src/main.tsx` invokes native commands with a placeholder session identifier and does not call the local meeting API.

No statement above proves a visible Electron session, live audio capture, local transcription quality, or packaging; those are milestones below.

## Milestones and stop conditions

### M1 — Truthful desktop boot

**Outcome:** Starting the desktop app starts the native sidecar exactly once, exposes `ready` or a safe failure state to the renderer, and never pretends that capture is usable when the sidecar is absent.

**Boundaries:** `apps/desktop/src/main/**`, existing desktop unit tests, native build output only. No API behavior changes.

**Acceptance:** focused startup/error tests pass; `cargo build --release --manifest-path native/Cargo.toml` produces the expected executable; owner can launch Electron and see runtime state.

**Stop:** Do not add meeting API or capture UI changes in this milestone.

### M2 — Real local meeting start

**Outcome:** The renderer calls the existing local API to create a meeting and start it, passes the returned UUID to native capture, and displays safe request/runtime errors.

**Boundaries:** renderer API seam, preload contract only when necessary, desktop tests. Existing API routes are consumed without modification.

**Acceptance:** synthetic UI/API contract tests prove correct create/start payloads, UUID propagation, idempotency header, and error display; a local manual smoke confirms the desktop reaches a real API response.

**Stop:** No transcription, provider, or database schema work.

### M3 — Record and stop with recoverable local evidence

**Outcome:** Owner selects a microphone and records/stops one meeting. The application displays capture health and final local-audio/manifest status without exposing audio content in logs.

**Boundaries:** existing native capture IPC, desktop controls/status surface, narrowly related tests.

**Acceptance:** real Windows microphone smoke produces separate local evidence files and the meeting end request succeeds; stop/restart failure states are honest and recoverable.

**Stop:** No cloud upload or live provider path.

### M4 — Local post-recording transcript

**Outcome:** A stopped meeting invokes the installed local model for post-recording transcription and renders source transcript output, or reports a precise model/runtime prerequisite failure.

**Boundaries:** existing local native speech IPC and desktop transcript read surface. Preserve transcript/audio immutability.

**Acceptance:** a synthetic contract test plus one consented local-audio/manual smoke prove request, progress, persistence/readback, and failure behavior. Quality is not claimed without the frozen corpus gate.

**Stop:** No translation, AI minutes, cloud provider, or real-time mode.

### M5 — Personal library and Markdown export

**Outcome:** Owner can browse local meetings, reopen a completed meeting, view transcript/status, and export Markdown to a chosen local path.

**Boundaries:** existing meeting/transcript/export read contracts and desktop UI.

**Acceptance:** focused UI/API tests and manual smoke prove stable ordering, owner scope under local auth, failed export reporting, and exported Markdown opening correctly.

### M6 — Repeatable personal install

**Outcome:** A documented Windows build installs/runs the application locally and preserves prior local data across application restart.

**Boundaries:** build/package configuration and a short owner runbook only.

**Acceptance:** clean build creates a runnable artifact; installed app launch, one M1–M5 smoke workflow, restart, and retained meeting check are recorded. Code signing and auto-update remain out of scope.

## Execution rules for future agents

1. Work only one milestone at a time, in order. Never start the next milestone because an adjacent component looks convenient.
2. Before editing a symbol, run the required GitNexus impact analysis; report HIGH/CRITICAL results before changes. Run `detect_changes()` before each task commit.
3. Start each task with a failing narrow synthetic test, make the smallest change, rerun the narrow and neighboring tests, then perform the milestone smoke test.
4. Use a Luna implementer for a bounded task and a separate reviewer for the task. File ownership must not overlap with active user changes or another agent.
5. Do not change `docs/execution/PROGRESS.md`, `STATUS.md`, phase evidence, or phase lifecycle claims for MVP planning alone. Update them only when their own verification rules are directly satisfied.
6. Never use mock/provider success to claim recording, transcription, or visible desktop behavior works. Record what actually ran, including unavailable model/device states.
7. Commit only the task's files after evidence passes; leave pre-existing dirty files untouched.

## First implementation target

Begin with **M1: Truthful desktop boot**. The expected smallest implementation is to start the existing `NativeSupervisor` during desktop bootstrap, surface startup failure safely, add focused tests, build the native release binary, then run a visible Electron launch smoke test.

Before coding, produce a task-level implementation plan from this roadmap and confirm exact current callers/impact for the startup symbols.
