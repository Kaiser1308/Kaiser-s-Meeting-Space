# Android Mobile Maestro E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Android Maestro baseline for the pre-meeting flow, with three independently runnable flows and an executable workspace command.

**Architecture:** The mobile package owns the Maestro workspace and invokes the globally installed Maestro CLI. A mobile Vitest contract test validates that all required flow files, app ID headers, stable selectors, and the package command exist; Maestro itself remains the UI test runner against a real installed Android build and authenticated session.

**Tech Stack:** Expo/React Native, Vitest 3, pnpm 10.14.0, Maestro CLI, Android 12+.

## Global Constraints

- Android is the only supported mobile product platform under ADR-007.
- Use only the Android package ID `com.anonymous.kaisermeetingspace` from `apps/mobile/app.json`.
- Use synthetic meeting titles only; never automate Auth0 credentials or include real meeting content, audio, transcript, URLs, or secrets.
- An authenticated app session, installed development build, attached Android device/emulator, and Maestro CLI are real prerequisites; their absence must fail explicitly and never be treated as a passing test.
- Do not simulate Auth0, device capture, permissions, provider responses, network state, or recording success in application code.
- Do not add recording/recovery/upload/transcription E2E behavior or change lifecycle state of P09, P10, or P16.

---

## File Structure

- `apps/mobile/src/e2e/maestro-suite.test.ts` — static Vitest contract for the committed Maestro suite and mobile `test:e2e` command.
- `apps/mobile/package.json` — package-local `test:e2e` command that first executes the contract test and then launches Maestro.
- `apps/mobile/maestro/config.yaml` — recursive discovery for the flow directory.
- `apps/mobile/maestro/flows/pre-meeting-record.yaml` — authenticated Record → Vietnamese setup → granted microphone → readiness flow.
- `apps/mobile/maestro/flows/pre-meeting-translate.yaml` — authenticated Translate → English setup → cloud disclosure/consent flow.
- `apps/mobile/maestro/flows/permission-denied.yaml` — Android microphone denial → truthful error → retry CTA flow.
- `docs/engineering/DEVELOPMENT.md` — exact prerequisites, session preparation, command, reset procedure, and interpretation of unavailable device/tooling results.

### Task 1: Establish the mobile E2E suite contract and command

**Files:**

- Create: `apps/mobile/src/e2e/maestro-suite.test.ts`
- Modify: `apps/mobile/package.json`

**Interfaces:**

- Consumes: `apps/mobile/app.json` Android package `com.anonymous.kaisermeetingspace`; Maestro workspace path `apps/mobile/maestro`.
- Produces: `pnpm --filter @kms/mobile test:e2e`, which runs the focused Vitest contract then `maestro test maestro` from `apps/mobile`.

- [ ] **Step 1: Write the failing contract test**

Create `apps/mobile/src/e2e/maestro-suite.test.ts`. Use `readFileSync`, `existsSync`, `resolve`, and `fileURLToPath` to resolve `../../maestro` from the test file. Read `../../package.json` and `../../app.json`. Write these exact assertions:

```ts
expect(packageJson.scripts['test:e2e']).toBe(
  'vitest run src/e2e/maestro-suite.test.ts && maestro test maestro',
);
expect(appJson.expo.android.package).toBe('com.anonymous.kaisermeetingspace');
expect(readFileSync(resolve(maestroDir, 'config.yaml'), 'utf8')).toContain('flows:');

for (const flow of requiredFlows) {
  expect(existsSync(resolve(maestroDir, 'flows', flow.file))).toBe(true);
  const yaml = readFileSync(resolve(maestroDir, 'flows', flow.file), 'utf8');
  expect(yaml).toContain('appId: com.anonymous.kaisermeetingspace');
  for (const selector of flow.selectors) expect(yaml).toContain(`id: ${selector}`);
}
```

Set `requiredFlows` to these exact entries:

```ts
const requiredFlows = [
  {
    file: 'pre-meeting-record.yaml',
    selectors: [
      'setup-meeting-button',
      'meeting-title-input',
      'meeting-language-vi',
      'meeting-continue-button',
      'permission-continue-button',
      'readiness-screen',
      'start-recording-button',
    ],
  },
  {
    file: 'pre-meeting-translate.yaml',
    selectors: [
      'translate-mode',
      'meeting-title-input',
      'meeting-language-en',
      'meeting-continue-button',
      'permission-continue-button',
      'cloud-processing-toggle',
      'cloud-consent-checkbox',
    ],
  },
  {
    file: 'permission-denied.yaml',
    selectors: [
      'setup-meeting-button',
      'meeting-title-input',
      'meeting-continue-button',
      'permission-continue-button',
      'permission-denied-error',
    ],
  },
] as const;
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
pnpm --filter @kms/mobile test:unit -- src/e2e/maestro-suite.test.ts
```

Expected: FAIL because `apps/mobile/maestro/config.yaml` and all three required flow files do not exist; the failure must identify a missing required path, not a Vitest/import configuration error.

- [ ] **Step 3: Add the package E2E command**

In `apps/mobile/package.json`, add this exact script:

```json
"test:e2e": "vitest run src/e2e/maestro-suite.test.ts && maestro test maestro"
```

Do not add Maestro as an npm dependency: it is a device-level CLI prerequisite, not application runtime code.

- [ ] **Step 4: Run the focused test and preserve its expected red state**

Run the Step 2 command again. Expected: it still fails only for the missing Maestro workspace, proving the command change alone does not create a false green.

- [ ] **Step 5: Commit the completed task after Task 2 supplies the flows**

Task 1 cannot pass independently until the files defined by Task 2 exist. Commit both tasks together only after Task 2's green verification:

```powershell
git add apps/mobile/src/e2e/maestro-suite.test.ts apps/mobile/package.json apps/mobile/maestro docs/engineering/DEVELOPMENT.md
git commit -m "test(mobile): add Maestro pre-meeting flows"
```

### Task 2: Implement the three real Android Maestro flows

**Files:**

- Create: `apps/mobile/maestro/config.yaml`
- Create: `apps/mobile/maestro/flows/pre-meeting-record.yaml`
- Create: `apps/mobile/maestro/flows/pre-meeting-translate.yaml`
- Create: `apps/mobile/maestro/flows/permission-denied.yaml`

**Interfaces:**

- Consumes: the stable `testID` selectors listed in Task 1 and the native Android permission request initiated by `PermissionScreen`.
- Produces: three Maestro YAML flows that begin at an already authenticated `home-screen` and never assert a fake recording/provider result.

- [ ] **Step 1: Add recursive workspace discovery**

Create `apps/mobile/maestro/config.yaml`:

```yaml
flows:
  - 'flows/**'
```

- [ ] **Step 2: Add the Record readiness flow**

Create `apps/mobile/maestro/flows/pre-meeting-record.yaml` with this exact behavior. `launchApp` deliberately omits `clearState` so the manually prepared Auth0 session persists; microphone permission is granted by the real Android test harness.

```yaml
appId: com.anonymous.kaisermeetingspace
name: Pre-meeting Record reaches truthful readiness
tags:
  - android
  - pre-meeting
---
- launchApp:
    permissions:
      microphone: allow
- assertVisible:
    id: home-screen
- tapOn:
    id: setup-meeting-button
- assertVisible:
    id: meeting-setup-screen
- tapOn:
    id: meeting-title-input
- inputText: 'Synthetic Maestro Record'
- tapOn:
    id: meeting-language-vi
- tapOn:
    id: meeting-continue-button
- assertVisible:
    id: permission-screen
- tapOn:
    id: permission-continue-button
- assertVisible:
    id: readiness-screen
- assertVisible:
    id: start-recording-button
```

- [ ] **Step 3: Add the Translate cloud-disclosure flow**

Create `apps/mobile/maestro/flows/pre-meeting-translate.yaml`:

```yaml
appId: com.anonymous.kaisermeetingspace
name: Pre-meeting Translate requires explicit cloud consent
tags:
  - android
  - pre-meeting
---
- launchApp:
    permissions:
      microphone: allow
- assertVisible:
    id: home-screen
- tapOn:
    id: translate-mode
- tapOn:
    id: setup-meeting-button
- assertVisible:
    id: meeting-setup-screen
- tapOn:
    id: meeting-title-input
- inputText: 'Synthetic Maestro Translate'
- tapOn:
    id: meeting-language-en
- tapOn:
    id: meeting-continue-button
- assertVisible:
    id: permission-screen
- tapOn:
    id: permission-continue-button
- assertVisible:
    id: readiness-screen
- tapOn:
    id: cloud-processing-toggle
- assertVisible:
    id: cloud-consent-checkbox
- tapOn:
    id: cloud-consent-checkbox
- assertVisible:
    id: start-recording-button
```

The flow intentionally does not assert a successful Start: on development builds where native capture is unavailable, Start remains truthfully disabled regardless of consent.

- [ ] **Step 4: Add the microphone-denied flow**

Create `apps/mobile/maestro/flows/permission-denied.yaml`:

```yaml
appId: com.anonymous.kaisermeetingspace
name: Microphone denial displays remediation
tags:
  - android
  - pre-meeting
---
- launchApp:
    permissions:
      microphone: deny
- assertVisible:
    id: home-screen
- tapOn:
    id: setup-meeting-button
- assertVisible:
    id: meeting-setup-screen
- tapOn:
    id: meeting-title-input
- inputText: 'Synthetic Maestro Permission'
- tapOn:
    id: meeting-continue-button
- assertVisible:
    id: permission-screen
- tapOn:
    id: permission-continue-button
- assertVisible:
    id: permission-denied-error
- assertVisible:
    id: permission-continue-button
```

- [ ] **Step 5: Run the static suite contract to verify green**

Run:

```powershell
pnpm --filter @kms/mobile test:unit -- src/e2e/maestro-suite.test.ts
```

Expected: PASS with one non-zero Vitest test count; it verifies all three flows, the Android app ID, recursive discovery, command, and exact stable selectors.

- [ ] **Step 6: Format and inspect only new flow files**

Run:

```powershell
pnpm exec prettier --check apps/mobile/src/e2e/maestro-suite.test.ts apps/mobile/package.json apps/mobile/maestro/config.yaml apps/mobile/maestro/flows/pre-meeting-record.yaml apps/mobile/maestro/flows/pre-meeting-translate.yaml apps/mobile/maestro/flows/permission-denied.yaml
git diff --check -- apps/mobile/src/e2e/maestro-suite.test.ts apps/mobile/package.json apps/mobile/maestro
```

Expected: both commands exit 0.

### Task 3: Document real-device execution and unavailable prerequisites

**Files:**

- Modify: `docs/engineering/DEVELOPMENT.md`

**Interfaces:**

- Consumes: `pnpm test:e2e:mobile` at the repository root and package command from Task 1.
- Produces: a repeatable operator procedure that separates a successful real device run from unavailable tooling/device/session conditions.

- [ ] **Step 1: Write the failing documentation-coverage assertion**

Extend `apps/mobile/src/e2e/maestro-suite.test.ts` to read `../../../docs/engineering/DEVELOPMENT.md` and assert it contains each of these exact strings:

```ts
expect(developmentGuide).toContain('Maestro CLI');
expect(developmentGuide).toContain('pnpm test:e2e:mobile');
expect(developmentGuide).toContain('authenticated');
expect(developmentGuide).toContain('Android 12+');
expect(developmentGuide).toContain('synthetic');
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
pnpm --filter @kms/mobile test:unit -- src/e2e/maestro-suite.test.ts
```

Expected: FAIL on the new documentation assertion because the Development Guide has no Maestro run procedure yet.

- [ ] **Step 3: Add the Mobile Maestro E2E section to the Development Guide**

Add a section directly after **Test infrastructure** titled `### Android Maestro E2E`. It must state all of the following:

1. This suite covers pre-meeting Record, Translate cloud disclosure/consent, and microphone-denial remediation only.
2. Preconditions: Android 12+ attached device/emulator, installed current development build, Maestro CLI available on `PATH`, and an already authenticated synthetic test account.
3. Before each run, clear only the test app's permission state as needed, sign in manually through Auth0, then return to the app; credentials must never appear in a flow or shell command.
4. Run `pnpm test:e2e:mobile`; it dispatches `pnpm --filter @kms/mobile test:e2e` and runs the three flows.
5. If Maestro, device/build, or authenticated session is absent, record the non-zero result as unavailable/blocked evidence; do not claim the suite passed.
6. The suite does not verify successful recording, upload, provider work, recovery, or iOS.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```powershell
pnpm --filter @kms/mobile test:unit -- src/e2e/maestro-suite.test.ts
```

Expected: PASS with a non-zero test count and no warnings.

- [ ] **Step 5: Run the package regression gates**

Run:

```powershell
pnpm --filter @kms/mobile typecheck
pnpm --filter @kms/mobile test:unit
```

Expected: both exit 0; mobile unit tests report a non-zero executed test count.

- [ ] **Step 6: Run the real command only if prerequisites exist**

Run:

```powershell
pnpm test:e2e:mobile
```

Expected with all preconditions: Maestro executes three flows and exits 0. Expected without a real prerequisite: a non-zero command with a named missing prerequisite; record that outcome without changing a phase to `VERIFIED`.

- [ ] **Step 7: Detect change scope, commit, and record handoff boundary**

Run GitNexus `detect_changes()` against the staged diff. Confirm the changed scope is restricted to mobile E2E contract/test configuration, Maestro flows, and the Development Guide; because no product symbol changes are expected, no product execution flow should be affected. Then run:

```powershell
git diff --check -- apps/mobile/src/e2e/maestro-suite.test.ts apps/mobile/package.json apps/mobile/maestro docs/engineering/DEVELOPMENT.md
git add apps/mobile/src/e2e/maestro-suite.test.ts apps/mobile/package.json apps/mobile/maestro docs/engineering/DEVELOPMENT.md
git commit -m "test(mobile): add Maestro pre-meeting flows"
```

Expected: scope review and diff check are clean; the commit contains only the listed files. If the real Maestro run is unavailable, preserve the code/documentation commit but report the external gate as unavailable rather than claiming device E2E evidence.

## Plan Self-Review

- **Spec coverage:** Task 1 establishes the executable command and a failing structural test. Task 2 implements all three required Android flows with real permissions and existing selectors. Task 3 documents prerequisites, runs static/package gates, conditionally records real-device evidence, and prevents an unavailable tool/device/session from becoming a false pass.
- **Placeholder scan:** No `TBD`, `TODO`, deferred implementation wording, or undefined file names remain.
- **Type and interface consistency:** Every flow uses `com.anonymous.kaisermeetingspace`, every package command is `test:e2e`, and Task 3's documentation assertions are added to Task 1's test file before its focused command is run.
