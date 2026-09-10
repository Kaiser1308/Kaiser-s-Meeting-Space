# Windows M6: Repeatable Personal Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Provide a repeatable, documented Windows build and packaging pipeline that produces a runnable desktop artifact with embedded native sidecar, preserves owner meeting data and transcripts across application restarts, and supplies a comprehensive owner runbook for personal offline installation and verification.

**Architecture:** The desktop build pipeline (`electron-builder`) packages the Vite/Electron frontend and bundles the native `kms-native.exe` binary into `resources/native/`. At runtime, `NativeSupervisor` safely resolves the packaged executable path relative to `process.resourcesPath`. Meeting records in the local API and immutable transcripts in client persistence (`transcript-storage`) survive application restarts. A dedicated package integrity suite verifies the distribution layout, sidecar bundling, and persistence invariants. An owner runbook documents prerequisites, build instructions, and the end-to-end M1–M5 smoke verification workflow.

**Tech Stack:** Electron 34, Electron Builder 25, Rust (`kms-native`), Vite 7, React 19, TypeScript 5.9, Vitest.

## Global Constraints

- Scope is strictly Milestone M6 from the approved roadmap (`docs/superpowers/specs/2026-09-09-windows-offline-mvp-roadmap.md`).
- Code signing and auto-update mechanisms are explicitly out of scope for the offline personal MVP.
- Preserves offline-first invariant: the installed application must run entirely locally without cloud, telemetry, or external network dependencies.
- Retains immutability of audio chunks and source transcripts across application restarts.
- Truthful reporting: do not fabricate claims about device or model behavior; record exact execution output.
- Run GitNexus `detect-changes` before each task commit.

---

### Task 1: Add packaging integrity and packaged-runtime resolver test suite

**Files:**

- Create: `apps/desktop/src/main/package-integrity.test.ts`
- Modify: `apps/desktop/electron-builder.yml` (if needed for packaging refinements)

**Interfaces:**

- Consumes: `apps/desktop/electron-builder.yml`, `apps/desktop/package.json`, `apps/desktop/src/main/supervisor.ts`.
- Produces:
  - Automated tests asserting:
    1. `electron-builder.yml` configures `extraResources` correctly targeting `kms-native.exe` into `resources/native/`.
    2. `resolveRuntimePath()` logic accurately branches between development mode and production packaged mode (`process.resourcesPath/native/kms-native.exe`).
    3. Packaged build directory structure invariants.

- [x] **Step 1: Write failing unit tests for package integrity**

Create `apps/desktop/src/main/package-integrity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import yaml from 'yaml';

describe('package integrity and distribution configuration', () => {
  const desktopRoot = resolve(__dirname, '../..');
  const repoRoot = resolve(desktopRoot, '../..');
  const builderConfigPath = resolve(desktopRoot, 'electron-builder.yml');

  it('has valid electron-builder.yml with correct extraResources for native sidecar', () => {
    expect(existsSync(builderConfigPath)).toBe(true);
    const content = readFileSync(builderConfigPath, 'utf-8');
    const config = yaml.parse(content);

    expect(config.appId).toBe('com.kaiser.meetingspace');
    expect(config.productName).toBe("Kaiser's Meeting Space");
    expect(config.directories?.output).toBe('dist-packaged');

    // Verify extraResources bundles kms-native.exe
    const extraResources = config.extraResources || [];
    const nativeResource = extraResources.find(
      (r: { to: string }) => r.to === 'native',
    );
    expect(nativeResource).toBeDefined();
    expect(nativeResource.from).toContain('native/target/release');
    expect(nativeResource.filter).toContain('kms-native.exe');
  });

  it('verifies supervisor runtime resolver branches correctly for packaged vs dev mode', () => {
    const supervisorSource = readFileSync(
      resolve(__dirname, 'supervisor.ts'),
      'utf-8',
    );

    // Assert supervisor checks app.isPackaged
    expect(supervisorSource).toContain('if (app.isPackaged)');
    // Assert in production it uses process.resourcesPath
    expect(supervisorSource).toContain('process.resourcesPath');
    expect(supervisorSource).toContain(
      "join(process.resourcesPath, 'native', `kms-native${ext}`)",
    );
    // Assert in development it uses local build output
    expect(supervisorSource).toContain(
      "join(app.getAppPath(), '..', '..', 'native', 'target', 'release', `kms-native${ext}`)",
    );
  });

  it('verifies native binary release artifact exists in native target folder', () => {
    const nativeBinaryPath = resolve(
      repoRoot,
      'native/target/release/kms-native.exe',
    );
    expect(existsSync(nativeBinaryPath)).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify failure**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/main/package-integrity.test.ts
```
Expected: Verify if `yaml` dependency is missing or if tests fail. If `yaml` package is needed in tests, install or use lightweight parser.

- [x] **Step 3: Implement minimal code / parser to make test pass cleanly**

Ensure `package-integrity.test.ts` parses YAML cleanly (using simple regex or standard parser without bloated deps) and tests all package invariants.

- [x] **Step 4: Run unit tests and typecheck**

Run:
```powershell
pnpm prettier --write apps/desktop/src/main/package-integrity.test.ts
pnpm --filter @kms/desktop exec vitest run src/main/package-integrity.test.ts
pnpm --filter @kms/desktop typecheck
```
Expected: PASS.

- [x] **Step 5: Stage and commit Task 1**

```powershell
git add apps/desktop/src/main/package-integrity.test.ts
git commit -m "test(desktop): add packaging configuration and sidecar distribution integrity tests"
```

---

### Task 2: Verify data retention and transcript persistence across application restart

**Files:**

- Create: `apps/desktop/src/data-retention.test.ts`
- Modify: `apps/desktop/src/transcript-storage.ts` (if any persistence durability edge case arises)

**Interfaces:**

- Consumes: `saveTranscript`, `getTranscript` from `./transcript-storage.js`, `createMeetingApi` from `./meeting-api.js`.
- Produces:
  - Integration/synthetic tests proving:
    1. Saved transcript segments for multiple meetings remain isolated and fully retrievable after simulated browser session restart (new storage instance reading persisted state).
    2. Modifying or adding transcripts for one meeting does not mutate or corrupt transcripts for previous meetings.
    3. Meeting library ordering and details retrieved from API remain consistent across subsequent requests.

- [x] **Step 1: Write failing unit/integration tests for data retention**

Create `apps/desktop/src/data-retention.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  saveTranscript,
  getTranscript,
  type StorageLike,
} from './transcript-storage.js';
import type { TranscriptSegment } from './transcription-workflow.js';

describe('data retention across application restarts', () => {
  it('preserves meeting transcripts across simulated session restarts', () => {
    // Simulated persistent disk storage
    const persistentDisk: Record<string, string> = {};

    const createDiskStorage = (): StorageLike => ({
      getItem: (k: string) => persistentDisk[k] ?? null,
      setItem: (k: string, v: string) => {
        persistentDisk[k] = v;
      },
      removeItem: (k: string) => {
        delete persistentDisk[k];
      },
    });

    const session1Storage = createDiskStorage();
    const meeting1Id = '11111111-1111-4111-8111-111111111111';
    const meeting2Id = '22222222-2222-4222-8222-222222222222';

    const segments1: TranscriptSegment[] = [
      { startMs: 0, endMs: 2000, text: 'Session 1 transcript segment.' },
    ];
    const segments2: TranscriptSegment[] = [
      { startMs: 0, endMs: 3000, text: 'Session 2 transcript segment.' },
      { startMs: 3500, endMs: 6000, text: 'Second speaker comment.' },
    ];

    // Session 1 writes data
    saveTranscript(meeting1Id, segments1, session1Storage);
    saveTranscript(meeting2Id, segments2, session1Storage);

    // Simulate complete application exit and restart: new session storage instance
    const session2Storage = createDiskStorage();

    // Session 2 reads data
    const reloadedMeeting1 = getTranscript(meeting1Id, session2Storage);
    const reloadedMeeting2 = getTranscript(meeting2Id, session2Storage);

    expect(reloadedMeeting1).toEqual(segments1);
    expect(reloadedMeeting2).toEqual(segments2);
  });

  it('guarantees immutability: retrieved segments cannot mutate stored records', () => {
    const disk: Record<string, string> = {};
    const storage: StorageLike = {
      getItem: (k: string) => disk[k] ?? null,
      setItem: (k: string, v: string) => {
        disk[k] = v;
      },
      removeItem: (k: string) => {
        delete disk[k];
      },
    };

    const meetingId = '33333333-3333-4333-8333-333333333333';
    const original: TranscriptSegment[] = [
      { startMs: 0, endMs: 1000, text: 'Immutable original.' },
    ];

    saveTranscript(meetingId, original, storage);

    // Retrieve and attempt mutation
    const retrieved = getTranscript(meetingId, storage)!;
    retrieved[0].text = 'Mutated text attempt!';

    // Re-fetch should yield original text
    const secondFetch = getTranscript(meetingId, storage)!;
    expect(secondFetch[0].text).toBe('Immutable original.');
  });
});
```

- [x] **Step 2: Run test to confirm behavior**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/data-retention.test.ts
```
Expected: PASS (verifying data retention and immutability invariants).

- [x] **Step 3: Format and verify typecheck**

Run:
```powershell
pnpm prettier --write apps/desktop/src/data-retention.test.ts
pnpm --filter @kms/desktop exec vitest run src/data-retention.test.ts
pnpm --filter @kms/desktop typecheck
```
Expected: PASS.

- [x] **Step 4: Stage and commit Task 2**

```powershell
git add apps/desktop/src/data-retention.test.ts
git commit -m "test(desktop): verify data retention and transcript immutability across application restart"
```

---

### Task 3: Author Windows Offline Personal Install Runbook

**Files:**

- Create: `docs/runbooks/windows-offline-personal-install.md`

**Contents:**

1. **Overview & Scope**:
   - Single-node personal installation on Windows 10/11.
   - Fully offline: zero telemetry, zero cloud STT/AI dependencies, local database and native sidecar.
2. **Prerequisites**:
   - Windows 10/11 x64.
   - Node.js 24 LTS & pnpm 10.
   - Rust toolchain (`cargo`, `rustc` 1.80+).
   - Docker Desktop (for local PostgreSQL/Redis services).
3. **Build & Package Procedure**:
   - Step 1: Build native runtime sidecar:
     `cargo build --release -p kms-native`
   - Step 2: Install workspace dependencies:
     `pnpm install`
   - Step 3: Package desktop application:
     `pnpm --filter @kms/desktop build:electron`
     (Builds unpacked executable in `apps/desktop/dist-packaged/win-unpacked/`)
4. **Execution Instructions**:
   - Running directly from source (Development mode):
     `pnpm --filter @kms/desktop dev`
   - Running the packaged standalone artifact:
     `"apps\desktop\dist-packaged\win-unpacked\Kaiser's Meeting Space.exe"`
5. **M1–M5 End-to-End Verification Checklist**:
   - [x] M1 Boot: Native supervisor displays `healthy` status and uptime.
   - [x] M2 Meeting Start: Real meeting created and started via local API with valid UUID.
   - [x] M3 Recording & Stop: Real microphone capture commits audio chunks and reports clean status.
   - [x] M4 Post-recording Transcript: Whisper engine produces source transcript or displays truthful diagnostic prerequisite banner.
   - [x] M5 Library & Export: Meeting appears in Library, reopens with transcript intact, and exports `.md` file to disk.
   - [x] M6 Restart & Retention: App restart preserves past meeting records and transcripts.
6. **Troubleshooting & Diagnostic FAQ**:
   - Native supervisor crash loops and budget limits.
   - Local Whisper C++ MSVC toolchain requirements.
   - Firewall/port 4310 accessibility.

- [x] **Step 1: Write `docs/runbooks/windows-offline-personal-install.md`**

Write the complete runbook with concrete, copy-pasteable commands and zero placeholders.

- [x] **Step 2: Stage and commit Task 3**

```powershell
git add docs/runbooks/windows-offline-personal-install.md
git commit -m "docs(runbook): add windows offline personal install runbook"
```

---

### Task 4: Complete end-to-end M6 packaging gate and qualification review

**Files:**

- Test: `apps/desktop/src/main/package-integrity.test.ts`, `apps/desktop/src/data-retention.test.ts`, `apps/desktop/electron-builder.yml`.

- [x] **Step 1: Run complete automated test suite**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run
pnpm --filter @kms/desktop typecheck
```
Expected: All 17 test files and 170+ tests pass; typecheck exits 0.

- [x] **Step 2: Execute packaging build and verify packaged artifact**

Run:
```powershell
pnpm --filter @kms/desktop build:electron
```
Verify that `apps/desktop/dist-packaged/win-unpacked/Kaiser's Meeting Space.exe` and `apps/desktop/dist-packaged/win-unpacked/resources/native/kms-native.exe` are created and valid.

- [x] **Step 3: Run GitNexus change scope detection and impact review**

Run:
```powershell
node .gitnexus/run.cjs detect-changes --scope compare --base-ref HEAD~3 --repo Kaiser-s-Meeting-Space --branch master
git status --short
```
Expected: Clean review, no scope creep.

- [x] **Step 4: Update plan document with verified checklist**

Mark all checklist items `[x]` upon direct verification.

```powershell
git add docs/superpowers/plans/2026-09-10-windows-m6-repeatable-personal-install.md
git commit -m "docs(m6): mark Milestone M6 tasks and qualification gates verified"
```

---

## Plan Self-Review

- **Spec coverage:** Satisfies M6 outcome: a documented Windows build packages and runs the application locally and preserves prior local data across application restart.
- **Offline Invariant:** Standalone executable bundles native sidecar; no cloud network dependencies.
- **Runbook:** Step-by-step instructions for build, execution, and verification checklist.
