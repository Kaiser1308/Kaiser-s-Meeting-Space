# M1 Capture-Only Native Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a real Windows native sidecar for desktop boot and capture without compiling the blocked local Whisper stack, while returning a truthful unavailable response for every local-speech command.

**Architecture:** `whisper-rs` becomes an optional Cargo dependency selected only by a non-default `local-speech` feature. The native module, runtime field, implementation, and existing speech-success tests compile only with that feature. In the default capture-only binary, the existing protocol commands remain accepted and the runtime dispatch returns one safe `NOT_AVAILABLE` error; it never emits simulated transcript data. The existing Electron bootstrap is consumed unchanged.

**Tech Stack:** Rust 2024, Cargo features, Tokio runtime tests, Electron 34, Vite, Electron Builder, Windows GNU Rust toolchain and Ruby DevKit MinGW runtime.

## Global Constraints

- This is M1 only: do not modify Electron, API, meeting lifecycle, capture behavior, model artifacts, provider credentials, CMake scripts, `whisper-rs` sources, or protocol allowlist.
- `local-speech` is disabled by default and must enable the unchanged `whisper-rs` dependency only when explicitly requested.
- Every `local_speech_*` command in a default build returns `success: false`, code `NOT_AVAILABLE`, category `runtime`, with no model, transcript, or simulated-success payload.
- Preserve compatibility: do not remove or rename local-speech command strings.
- GitNexus reports `handle_local_speech_command` as CRITICAL (10 impacted nodes, 8 processes). Before edits, report this risk and run impact on the exact dispatch symbol; do not change callers outside `runtime.rs`.
- Preserve existing unrelated dirty/untracked build artifacts. Commit only task files after direct evidence and `detect-changes()`.

## Build Unblocking Prerequisite: Restore the existing capture dispatcher borrow boundary

`cargo check -p kms-native --no-default-features` currently reaches native source and stops on four `E0502` borrow-checker errors in `CaptureManager::start` (`capture/manager.rs`): the Gap and nonfatal Error recovery branches borrow `mgr.meeting_id` immutably in the same call that mutably drains packet provenance from `mgr`.

This prerequisite is a compilation repair, not a capture-behavior change. GitNexus classifies both `CaptureManager::start` and `take_packet_provenance` as **CRITICAL**. Do not alter `take_packet_provenance`, protocol contracts, storage schema, capture producer behavior, or recovery semantics. Before each write, run and record impact for `start`; preserve the existing CRITICAL warning. In each of the four affected prefix-commit paths, snapshot the meeting ID, session ID, source format, and drained packet provenance into locals before the async writer call, then pass only those locals to the writer.

Add or extend focused regression coverage proving that a synthetic microphone and system-audio Gap, and each corresponding nonfatal Error, still commit the contiguous buffered prefix before recording its durable gap. Run the focused tests and `cargo check -p kms-native --no-default-features` with the documented short-path/GNU runtime environment. Commit this repair as its own task-scoped commit before Task 2. If the compile gate exposes a distinct root cause after this repair, stop and record it; do not broaden the fix.

## File Structure

- `native/crates/kms-native/Cargo.toml` — declares feature/dependency ownership.
- `native/crates/kms-native/src/main.rs` — conditionally declares `local_speech` module.
- `native/crates/kms-native/src/runtime.rs` — conditionally holds/dispatches speech implementation and provides default unavailable response plus feature-gated tests.
- `native/Cargo.lock` — Cargo-generated resolution update reflecting optional dependency metadata; only include if Cargo changes it.
- `apps/desktop/electron-builder.yml` — unchanged consumer of `native/target/release/kms-native.exe`.

---

### Task 1: Gate the local-speech dependency and return a safe default runtime response

**Files:**

- Modify: `native/crates/kms-native/Cargo.toml:12-36`
- Modify: `native/crates/kms-native/src/main.rs:10-16`
- Modify: `native/crates/kms-native/src/runtime.rs:8-145,352-367,640-870,1005-1105`
- Modify if generated: `native/Cargo.lock`
- Test: `native/crates/kms-native/src/runtime.rs` native unit-test module

**Interfaces:**

- Consumes: `NativeResponseV1::error(correlation_id, command, code, message, category)`, `Runtime::dispatch(&NativeRequestV1)`, and the protocol's existing local-speech allowlist.
- Produces: Cargo feature `local-speech`; default `Runtime::dispatch()` behavior for `local_speech_*` requests that returns `NOT_AVAILABLE`; feature-enabled behavior that still dispatches to `handle_local_speech_command`.

- [ ] **Step 1: Reconfirm the critical impact and current feature boundary**

Run:

```powershell
git status --short -- native/crates/kms-native/Cargo.toml native/crates/kms-native/src/main.rs native/crates/kms-native/src/runtime.rs native/Cargo.lock
git diff -- native/crates/kms-native/Cargo.toml native/crates/kms-native/src/main.rs native/crates/kms-native/src/runtime.rs native/Cargo.lock
node .gitnexus/run.cjs impact handle_local_speech_command --repo Kaiser-s-Meeting-Space --branch master --include-tests
node .gitnexus/run.cjs impact dispatch --repo Kaiser-s-Meeting-Space --branch master --include-tests
```

Expected: record CRITICAL fanout of speech handler and do not change dispatch callers. Confirm `whisper-rs` is unconditional and `mod local_speech;` is unconditional before the task begins.

- [ ] **Step 2: Write the failing default-build test first**

In the existing runtime test module, add a `#[cfg(not(feature = "local-speech"))]` Tokio test that constructs `Runtime`, sends `local_speech_get_state`, then asserts every part of the default contract:

```rust
assert!(!response.success);
assert_eq!(response.command, "local_speech_get_state");
let error = response.error.expect("default build must expose a safe error");
assert_eq!(error.code, "NOT_AVAILABLE");
assert_eq!(error.category, "runtime");
assert!(!error.retryable);
assert_eq!(response.payload, serde_json::json!({}));
```

Gate the existing speech-success/failure tests (`dispatch_local_speech_get_state`, `dispatch_local_speech_manifest_load_rejects_bad`, and `dispatch_local_speech_engine_init_then_transcribe`) with `#[cfg(feature = "local-speech")]`, because they use the feature-enabled implementation rather than default M1 behavior.

- [ ] **Step 3: Verify RED without changing production code**

Run from `native/` with a temporary `K:` mapping only if the long workspace path prevents Cargo from starting; remove the mapping afterward:

```powershell
cargo test -p kms-native dispatch_local_speech_get_state --no-default-features
```

Expected: FAIL because current default behavior returns a simulated-success local-speech state and `whisper-rs` is still unconditional. If native dependency compilation stops first, run `cargo metadata --no-deps --format-version 1` and record that the unconditional dependency prevents the test from reaching its assertion; do not modify CMake or dependency cache.

- [ ] **Step 4: Implement the smallest feature gate**

Apply only these changes:

```toml
[features]
default = []
local-speech = ["dep:whisper-rs"]

[dependencies]
whisper-rs = { version = "0.16", optional = true }
```

```rust
// main.rs
#[cfg(feature = "local-speech")]
mod local_speech;
```

In `runtime.rs`, gate `PathBuf` import, `local_speech` field/initialization, and `handle_local_speech_command` with `#[cfg(feature = "local-speech")]`. Replace only the local-speech dispatch arm with a compile-time pair:

```rust
#[cfg(feature = "local-speech")]
cmd if cmd.starts_with("local_speech_") => self.handle_local_speech_command(request).await,

#[cfg(not(feature = "local-speech"))]
cmd if cmd.starts_with("local_speech_") => NativeResponseV1::error(
    &request.correlation_id,
    &request.command,
    "NOT_AVAILABLE",
    "Local speech was not included in this native build",
    "runtime",
),
```

Do not modify the protocol allowlist or any non-speech dispatch arm. Do not add a default feature that silently re-enables Whisper.

- [ ] **Step 5: Verify default behavior and build dependency exclusion**

Run:

```powershell
cargo test -p kms-native dispatch_local_speech_get_state --no-default-features
cargo check -p kms-native --no-default-features
cargo tree -p kms-native -e normal --no-default-features
```

Expected: the test passes; `cargo check` exits 0; `cargo tree` contains no `whisper-rs` or `whisper-rs-sys`. The test count must be non-zero.

- [ ] **Step 6: Verify feature wiring without claiming the deferred upstream build passes**

Run:

```powershell
cargo metadata --manifest-path native/Cargo.toml --no-deps --format-version 1
cargo check -p kms-native --features local-speech
```

Expected: metadata lists `local-speech` and its optional Whisper dependency. The feature check is expected to reach the known upstream Windows compatibility limitation; record its actual exit/error, but do not treat it as M1 failure and do not patch/fork/upgrade the dependency in this task.

- [ ] **Step 7: Scope-check and commit Task 1**

Run:

```powershell
node .gitnexus/run.cjs detect-changes --scope all --repo Kaiser-s-Meeting-Space --branch master
git diff --check
git diff -- native/crates/kms-native/Cargo.toml native/crates/kms-native/src/main.rs native/crates/kms-native/src/runtime.rs native/Cargo.lock
git add -- native/crates/kms-native/Cargo.toml native/crates/kms-native/src/main.rs native/crates/kms-native/src/runtime.rs native/Cargo.lock
git commit -m "feat(native): make local speech opt-in"
```

Expected: only the native feature/runtime boundary changes. If `Cargo.lock` is unchanged, omit it from staging. A reviewer must approve both default safe-error behavior and feature gating before Task 2 begins.

---

### Task 2: Build and launch the capture-only sidecar through Electron

**Files:**

- Modify: none
- Create: none
- Test: Task 1 runtime test, existing desktop bootstrap/security/supervisor tests

**Interfaces:**

- Consumes: default `kms-native.exe` at `native/target/release/kms-native.exe`, Task 1 `NOT_AVAILABLE` behavior, Electron supervisor development path, and Electron Builder resource rule.
- Produces: a local untracked release executable and direct desktop startup evidence. No source contract changes.

- [ ] **Step 1: Build default native release with the known-good GNU runtime and short path**

After confirming `K:` is unused, use a temporary mapping and process-only PATH:

```powershell
subst K: "C:\Users\thien\Documents\Project\Kaiser's Meeting Space"
cmd /c "cd /d K:\native && set PATH=C:\Ruby33-x64\msys64\ucrt64\bin;%PATH% && cargo +stable-x86_64-pc-windows-gnu build --release --no-default-features"
subst K: /d
Get-Item native/target/release/kms-native.exe | Select-Object FullName,Length,LastWriteTime
```

Expected: Cargo exits 0; the executable exists with non-zero length; `K:` is absent after cleanup. If build fails, preserve the first causal failure and stop before packaging; never add a mock binary.

- [ ] **Step 2: Run native and desktop automated gates**

Run:

```powershell
cargo test -p kms-native dispatch_local_speech_get_state --no-default-features
pnpm --filter @kms/desktop exec vitest run src/main/main.test.ts src/main/security.test.ts src/main/supervisor.test.ts
pnpm --filter @kms/desktop typecheck
pnpm --filter @kms/desktop build:electron
```

Expected: all commands exit 0 with non-zero native/Vitest test counts. Electron Builder includes the release sidecar from `native/target/release`; no source files are changed by this task.

- [ ] **Step 3: Launch the visible Electron shell without starting capture**

Start Vite only as one process:

```powershell
pnpm --filter @kms/desktop dev
```

Then, in a separate terminal after Vite reports port 5173, launch the Electron main process explicitly:

```powershell
pnpm --filter @kms/desktop exec electron .
```

Expected: a visible Electron window opens and existing health polling transitions to healthy after native `runtime_ready`. Verify only start/health state. Do not choose a device, create a meeting, or start capture. Stop only processes started by this task.

- [ ] **Step 4: Review Task 2 and update the handoff ledger**

Use a reviewer distinct from the Task 1 implementer. Review source diff from Task 1 plus build outputs and the manual smoke evidence. Check that local speech was not falsely reported ready, native path/environment policy was unchanged, and no unrelated artifact was staged.

Run:

```powershell
node .gitnexus/run.cjs detect-changes --scope compare --base-ref HEAD~1 --repo Kaiser-s-Meeting-Space --branch master
git status --short
```

Expected: no uncommitted source/config changes from Task 2. Record the M1 result in the SDD handoff, not historical phase ledger. If visual launch fails after a successful sidecar build, stop M1 as IMPLEMENTED with the observed desktop blocker.

## Execution Status â€” 2026-09-10

- Native prerequisite completed in commits `06881dab` and `f742da55`: default-feature compile passes; the dispatcher regression covers microphone/system-audio × Gap/nonfatal Error with local SQLite manifest/provenance, durable-gap, and event-order assertions.
- Task 2 native release completed: `native/target/release/kms-native.exe` exists and is 6,485,504 bytes. The default local-speech unavailable test passes; desktop main/security/supervisor tests pass (28/28); and desktop typecheck passes.
- A visible development Electron window launched with the real sidecar. The native process emitted `Runtime ready`. No meeting was started and no device/capture action was invoked during the smoke test.
- Electron Builder copied the sidecar into `dist-packaged/win-unpacked/resources/native/` but did not complete a distributable: Windows denied creation of symlinks while `winCodeSign-2.6.0.7z` was extracted (`A required privilege is not held by the client`). This is an environment packaging blocker, not a source or native-runtime failure. Resolve the user/Developer Mode symlink privilege, then rerun Task 2 packaging; do not change signing sources to mask it.

## Plan Self-Review

- **Spec coverage:** feature split, default exclusion, truthful unavailable contract, preserved feature path, native release, packaging, and visible Electron smoke map to Tasks 1–2.
- **Scope:** no CMake/dependency patch, provider, model, meeting, API, capture, or UI feature is included.
- **Risk control:** the CRITICAL speech handler is isolated behind compile-time gates, retains protocol strings, and has a default-contract regression test plus independent review.
- **No placeholders:** all implementation, test, build, cleanup, and commit commands are explicit.
