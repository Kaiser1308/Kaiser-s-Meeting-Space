# Windows M1: Truthful Native Desktop Boot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Windows Electron client start its package-controlled native sidecar exactly once and remain visibly usable with a truthful not-ready state if that sidecar cannot start.

**Architecture:** The Electron main process continues to own `NativeSupervisor`; `initNativeRuntime()` creates, subscribes, registers the existing IPC handler, then begins `NativeSupervisor.start()` without blocking renderer/window creation. A startup rejection is logged as bounded operational diagnostics, leaving the supervisor state available to the existing IPC error path (`RUNTIME_NOT_READY`) and renderer health check. The renderer, preload API, native protocol, and API routes are not changed.

**Tech Stack:** Electron 34, TypeScript 5.9, Vitest, Vite Electron plugin, Rust/Cargo native sidecar on Windows.

## Global Constraints

- Target is Windows desktop offline-first M1 only; do not add API calls, capture-flow UI, cloud providers, model loading, or database changes.
- `NativeSupervisor` remains the only code permitted to choose executable path, arguments, environment, restart budget, and storage root.
- Do not weaken context isolation, sandbox, CSP, navigation policy, IPC command allowlist, or the existing `RUNTIME_NOT_READY` behavior.
- Preserve all pre-existing dirty changes, especially `apps/desktop/src/main/main.ts`; inspect and integrate rather than overwriting it.
- Before editing, rerun GitNexus impact on `initNativeRuntime`, `bootstrap`, and `NativeSupervisor`. The current audit found LOW risk for the two functions and MEDIUM risk for `NativeSupervisor` (7 direct consumers); do not alter the supervisor class in this milestone.
- Use synthetic test doubles only. The manual smoke must not record meeting audio and must not claim a real capture/transcription result.

## Current File Structure

- `apps/desktop/src/main/main.ts` — Electron bootstrap, secure BrowserWindow creation, native supervisor construction, event forwarding, and app lifecycle. This is the only production file M1 changes.
- `apps/desktop/src/main/main.test.ts` — new focused bootstrap test file. It mocks Electron and `NativeSupervisor` to prove startup invocation and non-fatal failure behavior without spawning a process.
- `apps/desktop/src/main/security.test.ts` — existing security regression suite; unchanged, but rerun because it imports the main-process module.
- `apps/desktop/src/main/supervisor.ts` — existing lifecycle/security boundary; unchanged. `start(): Promise<void>` is consumed as-is.
- `apps/desktop/electron-builder.yml` — existing package rule that expects `../../native/target/release/kms-native.exe`; unchanged, but used by the build qualification.

---

### Task 1: Start the already-registered native supervisor without blocking the shell

**Files:**

- Modify: `apps/desktop/src/main/main.ts:172-217`
- Create: `apps/desktop/src/main/main.test.ts`
- Test: `apps/desktop/src/main/main.test.ts`
- Regression: `apps/desktop/src/main/security.test.ts`

**Interfaces:**

- Consumes: `NativeSupervisor.start(): Promise<void>`, `NativeSupervisor.getState(): SupervisorState`, and the existing `IpcHandler` runtime-not-ready gate.
- Produces: `initNativeRuntime(): Promise<void>` that rejects only to its caller after `start()` fails, and `bootstrap(): Promise<void>` that calls it once without preventing `createMainWindow()`/`loadURL()` from proceeding.

- [ ] **Step 1: Reconfirm the precise, current code and impact before changing it**

Run:

```powershell
git status --short -- apps/desktop/src/main/main.ts
git diff -- apps/desktop/src/main/main.ts
node .gitnexus/run.cjs impact initNativeRuntime --repo Kaiser-s-Meeting-Space --branch master --include-tests
node .gitnexus/run.cjs impact --uid Function:apps/desktop/src/main/main.ts:bootstrap --repo Kaiser-s-Meeting-Space --branch master --include-tests
node .gitnexus/run.cjs impact NativeSupervisor --repo Kaiser-s-Meeting-Space --branch master --include-tests
```

Expected: `initNativeRuntime` and `bootstrap` remain LOW risk; `NativeSupervisor` remains MEDIUM and is not edited. If existing user changes already start the supervisor, stop and test that behavior instead of duplicating it.

- [ ] **Step 2: Write the failing focused tests**

Create `apps/desktop/src/main/main.test.ts`. Mock `electron` so `app.whenReady`, `BrowserWindow`, `session`, and `ipcMain` are deterministic. Mock `./supervisor.js` with a constructor whose `start` is a `vi.fn()` returning a controllable promise and whose `on`, `getState`, and `shutdown` methods satisfy the calls made by `main.ts`.

Add these two tests using the actual exported `bootstrap` and a flushed promise queue:

```ts
it('starts the NativeSupervisor once while bootstrapping the desktop shell', async () => {
  startMock.mockResolvedValueOnce(undefined);

  await bootstrap();
  await Promise.resolve();

  expect(startMock).toHaveBeenCalledTimes(1);
  expect(BrowserWindow).toHaveBeenCalledTimes(1);
  expect(loadURLMock).toHaveBeenCalledWith('http://localhost:5173');
});

it('keeps the desktop shell available when native startup rejects', async () => {
  const error = new Error('sidecar missing');
  startMock.mockRejectedValueOnce(error);

  await bootstrap();
  await Promise.resolve();

  expect(BrowserWindow).toHaveBeenCalledTimes(1);
  expect(loadURLMock).toHaveBeenCalledWith('http://localhost:5173');
  expect(consoleErrorMock).toHaveBeenCalledWith(
    'Native runtime failed to start',
    error,
  );
});
```

The module must export `bootstrap` and `initNativeRuntime` strictly for focused unit testing; the existing `if (!process.env.VITEST)` guard continues to prevent automatic startup during imports.

- [ ] **Step 3: Run the focused test and confirm the intended failure**

Run:

```powershell
pnpm --filter @kms/desktop exec vitest run src/main/main.test.ts
```

Expected: FAIL because `bootstrap` is not exported and `NativeSupervisor.start()` is not called. Do not accept a failure caused by an Electron mock mismatch; correct the mock until the assertion reaches the missing behavior.

- [ ] **Step 4: Make the minimal bootstrap change**

In `apps/desktop/src/main/main.ts`:

1. Change `initNativeRuntime` to `async` after retaining its existing constructor, event-forwarder, IPC construction, and `ipcHandler.register(ipcMain)` calls.
2. At the end of `initNativeRuntime`, call and await only the existing owner-controlled supervisor:

```ts
await supervisor.start();
```

3. In `bootstrap`, replace the synchronous invocation with this non-blocking, explicit failure path before window creation:

```ts
void initNativeRuntime().catch((error: unknown) => {
  console.error('Native runtime failed to start', error);
});
```

4. Export `bootstrap` and `initNativeRuntime` with the existing test exports. Do not export mutable module globals, bypass IPC, modify the supervisor executable path, or turn a sidecar failure into a fake `runtime_ready` event.

- [ ] **Step 5: Rerun focused and neighboring regressions**

Run:

```powershell
pnpm --filter @kms/desktop exec vitest run src/main/main.test.ts src/main/security.test.ts src/main/supervisor.test.ts
pnpm --filter @kms/desktop typecheck
```

Expected: each Vitest file reports a non-zero passing test count; typecheck exits 0. If `start()` rejection leaves an unhandled rejection, fix only the bootstrap catch path and rerun from the focused test.

- [ ] **Step 6: Inspect scope and commit only Task 1**

Run:

```powershell
node .gitnexus/run.cjs detect-changes --scope all --repo Kaiser-s-Meeting-Space --branch master
git diff --check
git diff -- apps/desktop/src/main/main.ts apps/desktop/src/main/main.test.ts
git add -- apps/desktop/src/main/main.ts apps/desktop/src/main/main.test.ts
git commit -m "fix(desktop): start native supervisor during bootstrap"
```

Expected: changed symbols are limited to desktop bootstrap/testing paths. If the pre-existing user diff overlaps `main.ts`, stage only the lines introduced for this task or stop for owner direction rather than committing unrelated work.

---

### Task 2: Build the sidecar and qualify visible desktop startup

**Files:**

- Modify: none unless Task 1 test/debug evidence proves an in-scope defect
- Create: none
- Test: existing `apps/desktop/src/main/main.test.ts`, `apps/desktop/src/main/security.test.ts`, `apps/desktop/src/main/supervisor.test.ts`

**Interfaces:**

- Consumes: Task 1's `bootstrap()` behavior, `NativeSupervisor.resolveRuntimePath()` development convention, and `apps/desktop/electron-builder.yml` `extraResources` source `native/target/release`.
- Produces: a local, uncommitted `native/target/release/kms-native.exe` build artifact and direct owner-observable M1 startup evidence. It produces no source or public API contract.

- [ ] **Step 1: Verify the target is absent or identify the existing artifact without altering it**

Run:

```powershell
Get-Item native/target/release/kms-native.exe -ErrorAction SilentlyContinue | Select-Object FullName,Length,LastWriteTime
Get-Content apps/desktop/electron-builder.yml
```

Expected: the runtime path matches the supervisor/package configuration. If a prior artifact is present, record its timestamp and rebuild only if the source/build toolchain requires it.

- [ ] **Step 2: Build the native release sidecar**

Run:

```powershell
cargo build --release --manifest-path native/Cargo.toml
Get-Item native/target/release/kms-native.exe | Select-Object FullName,Length,LastWriteTime
```

Expected: Cargo exits 0 and the executable exists with non-zero length. If build fails, preserve the error, classify the environment/toolchain cause, and do not claim M1 runtime success or add mock binaries.

- [ ] **Step 3: Run all M1 automated gates**

Run:

```powershell
pnpm --filter @kms/desktop exec vitest run src/main/main.test.ts src/main/security.test.ts src/main/supervisor.test.ts
pnpm --filter @kms/desktop typecheck
pnpm --filter @kms/desktop build:electron
```

Expected: all commands exit 0; Vitest reports non-zero passing tests; Electron Builder's `extraResources` copy includes the release sidecar. A builder failure due to an absent/bad native artifact blocks M1 rather than being worked around by deleting the resource rule.

- [ ] **Step 4: Perform the bounded visible-start smoke**

Run:

```powershell
pnpm --filter @kms/desktop dev
```

Expected owner-observable signal: one Electron window opens; its initial runtime status progresses to healthy only after the sidecar emits `runtime_ready`, or it remains visibly offline/crashed with a safe operational error. Do not choose a microphone, start capture, create a meeting, or claim audio processing in M1. Stop the dev process normally after observation.

- [ ] **Step 5: Record task outcome and perform the separate review gate**

Use a reviewer who did not implement Task 1. Provide the exact diff, the three automated outputs, build output, and smoke observation. Reviewer must check: supervisor is started exactly once; failure does not block the window; no path/environment/IPC policy was loosened; no unrelated file is included.

If review is accepted, run:

```powershell
node .gitnexus/run.cjs detect-changes --scope compare --base-ref HEAD~1 --repo Kaiser-s-Meeting-Space --branch master
git status --short
```

Expected: no uncommitted task source changes remain. Record the smoke result in the next task handoff, not the historical phase ledger. If native build or visible smoke cannot run, mark M1 as `IMPLEMENTED` with the concrete blocker; do not advance to M2.

## Plan Self-Review

- **Spec coverage:** M1's sidecar startup, truthful failure state, native build artifact, Electron launch, security preservation, and stop-before-M2 boundary map to Tasks 1–2.
- **Scope:** No meeting API, renderer create/start flow, recording, transcription, library, cloud provider, or packaging feature is included.
- **Type consistency:** The plan consumes the existing `NativeSupervisor.start(): Promise<void>` and uses `bootstrap()` / `initNativeRuntime()` exports only for tests; it does not introduce a second runtime interface.
- **Ambiguity resolved:** startup is deliberately non-blocking to preserve a visible shell on missing/failed sidecar; readiness remains authoritative through the existing supervisor/IPC state rather than a synthetic event.
