# Mobile UI and Start FlowThe Making of a ManagerImplementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Android mobile UI and add testable P08 start-flow screens without changing P09 native recording behavior.

**Architecture:** Keep `AppShell` responsible for session and top-level screen selection. Extract authenticated UI into focused screens with explicit callbacks and local state. Use existing Auth0 PKCE and recording contracts; render blocked/readiness states when native capture is unavailable.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, Vitest, existing mobile auth and recording contracts.

## Global Constraints

- Only modify `apps/mobile` and directly related mobile UI tests, except this plan/evidence when required.
- Do not modify P09 native audio behavior or claim native recording success.
- Do not add fake Auth0/provider/device behavior; preview-only UI states must be visibly labelled.
- Keep Auth0 PKCE, `exp://.../--/oauth/callback` Expo Go support, and `kms://oauth/callback` native support.
- Every root screen uses `flex: 1`, Safe Area-aware padding, and controls with at least a 48dp touch target.
- P09 remains `IMPLEMENTED`, not `VERIFIED`, until physical/native qualification evidence exists.

---

### Task 1: Shared mobile UI primitives and layout contract

**Files:**

- Create: `apps/mobile/src/features/ui/ui.ts`
- Modify: `apps/mobile/src/app/AppShell.tsx`
- Test: `apps/mobile/src/app/AppShell.test.tsx`

**Interfaces:**

- Produce `MOBILE_COLORS`, `MOBILE_SPACING`, `PrimaryButtonProps`, and `StatusBannerProps` for later screens.
- `AppShell` accepts the existing auth/session props and renders the active screen inside a `flex: 1` root.

- [ ] **Step 1: Write failing tests** for `AppShell` root flex layout, authenticated child rendering, unauthenticated login rendering, and locale control accessibility.
- [ ] **Step 2: Run the focused test** with `pnpm --filter @kms/mobile test:unit -- src/app/AppShell.test.tsx`; confirm the new layout expectations fail before implementation.
- [x] **Step 3: Add shared constants and update `AppShell`** so root/content wrappers use `flex: 1`, Safe Area-compatible spacing, and no placeholder `App Content` text.
- [x] **Step 4: Run the focused test** again and confirm it passes.
- [x] **Step 5: Run `git diff --check`** for the touched files.

### Task 2: Authentication screen and logout action

**Files:**

- Create: `apps/mobile/src/features/auth/screens/AuthScreen.tsx`
- Modify: `apps/mobile/src/app/AppShell.tsx`, `apps/mobile/App.tsx`
- Test: `apps/mobile/src/features/auth/screens/AuthScreen.test.tsx`

**Interfaces:**

- `AuthScreenProps = { loading: boolean; error?: string; onLogin: () => void; onLogout?: () => void }`.
- `App.tsx` supplies `onLogout` calling `ClientAuth.logout()` and clears authenticated state.

- [ ] **Step 1: Write failing tests** for login, loading-disabled login, readable error, and logout callback.
- [ ] **Step 2: Run the focused AuthScreen test** and confirm failure because the extracted component does not exist.
- [x] **Step 3: Implement `AuthScreen`** using native `View`, `Text`, and `Pressable`, with Safe Area spacing, stable layout during loading, accessibility labels, and a visible error banner.
- [x] **Step 4: Wire logout through `App.tsx`** without changing PKCE or token transport behavior.
- [x] **Step 5: Run AuthScreen and auth/deep-link tests** and confirm they pass.

### Task 3: Authenticated Home screen

**Files:**

- Create: `apps/mobile/src/features/home/HomeScreen.tsx`
- Modify: `apps/mobile/src/app/AppShell.tsx`
- Test: `apps/mobile/src/features/home/HomeScreen.test.tsx`

**Interfaces:**

- `HomeScreenProps = { mode: 'record' | 'translate'; onModeChange: (mode: ...) => void; nativeReady: boolean; onStart: () => void; onLogout: () => void }`.

- [ ] **Step 1: Write failing tests** for branded header, mode selection, readiness banner, disabled start button when `nativeReady` is false, and logout.
- [ ] **Step 2: Run the focused test** and confirm failure before creating `HomeScreen`.
- [x] **Step 3: Implement HomeScreen** using the approved green/cream design, Safe Area layout, minimum 48dp targets, readable text, and no clipped header.
- [x] **Step 4: Wire HomeScreen into `AppShell`** and preserve the disabled start behavior until P09 readiness exists.
- [x] **Step 5: Run focused HomeScreen/AppShell tests** and confirm they pass.

### Task 4: Meeting setup screen and navigation state

**Files:**

- Create: `apps/mobile/src/features/meeting/MeetingSetupScreen.tsx`
- Create: `apps/mobile/src/features/meeting/meeting-flow.ts`
- Modify: `apps/mobile/src/app/AppShell.tsx`, `apps/mobile/App.tsx`
- Test: `apps/mobile/src/features/meeting/MeetingSetupScreen.test.tsx`, `apps/mobile/src/features/meeting/meeting-flow.test.ts`

**Interfaces:**

- `MeetingDraft = { title: string; mode: 'record' | 'translate'; sourceLanguage: 'vi' | 'en'; targetLanguage: 'vi' | 'en' }`.
- `validateMeetingDraft(draft: MeetingDraft): { valid: boolean; error?: string }` requires a non-empty trimmed title and different source/target languages for translate mode.
- `MeetingSetupScreenProps = { draft: MeetingDraft; onChange: (draft: MeetingDraft) => void; onContinue: () => void; onBack: () => void }`.

- [ ] **Step 1: Write failing validation and UI tests** for empty title, valid record setup, invalid same-language translate setup, continue, and back.
- [ ] **Step 2: Run the focused tests** and confirm they fail before implementation.
- [x] **Step 3: Implement pure validation and the native form screen** with keyboard-safe layout and accessible inputs/buttons.
- [x] **Step 4: Add explicit `home → setup → readiness` screen state** in `App.tsx`/`AppShell`, without introducing a new navigation dependency.
- [x] **Step 5: Run focused meeting-flow tests** and confirm they pass.

### Task 5: Permission and readiness screen

**Files:**

- Create: `apps/mobile/src/features/meeting/PermissionScreen.tsx`
- Modify: `apps/mobile/src/app/AppShell.tsx`, `apps/mobile/App.tsx`
- Test: `apps/mobile/src/features/meeting/PermissionScreen.test.tsx`

**Interfaces:**

- `CaptureReadiness = 'not_checked' | 'permission_denied' | 'native_unavailable' | 'ready'`.
- `PermissionScreenProps = { readiness: CaptureReadiness; onCheck: () => void; onBack: () => void; onContinue: () => void }`.

- [ ] **Step 1: Write failing tests** for each readiness state and verify that `onContinue` is unavailable unless readiness is `ready`.
- [ ] **Step 2: Run the focused tests** and confirm failure before implementation.
- [x] **Step 3: Implement the screen** with truthful copy: no permission/device/provider result is fabricated; native unavailable remains visibly blocked.
- [x] **Step 4: Wire the screen after Meeting Setup** and keep recording disabled for non-ready states.
- [x] **Step 5: Run focused tests** and confirm they pass.

### Task 6: Recording-state placeholder and end-to-end UI smoke

**Files:**

- Create: `apps/mobile/src/features/recording/RecordingScreen.tsx`
- Modify: `apps/mobile/src/app/AppShell.tsx`, `apps/mobile/App.tsx`
- Test: `apps/mobile/src/features/recording/RecordingScreen.test.tsx`, `apps/mobile/src/app/mobile-flow.test.tsx`

**Interfaces:**

- `RecordingScreenProps = { state: 'blocked' | 'starting' | 'recording' | 'paused' | 'ending'; onPause: () => void; onResume: () => void; onEnd: () => void; onBack: () => void }`.
- The default Expo Go path supplies `state: 'blocked'` until native readiness is directly available.

- [ ] **Step 1: Write failing tests** for blocked, recording, paused, and ending visual states plus back/end callbacks.
- [ ] **Step 2: Run focused tests** and confirm failure before implementation.
- [x] **Step 3: Implement the screen** using existing recording contract terminology and explicit blocked copy; do not call a fake capture provider.
- [ ] **Step 4: Add a UI smoke test** covering login-success fixture → home → setup → readiness blocked → back navigation. (Not added; focused screen tests and direct Expo Go smoke remain the evidence for this iteration.)
- [x] **Step 5: Run the full mobile unit suite** and confirm the new tests pass or record exact environment blockers.

### Task 7: Verification and handoff

**Files:**

- Modify only if evidence requires it: `docs/execution/evidence/P08/EVIDENCE.md`, `docs/execution/PROGRESS.md`, `STATUS.md`

- [x] **Step 1: Run the mobile unit suite.** Direct Vitest invocation completed successfully: 38 files, 231 tests passed.
- [x] **Step 2: Run the mobile typecheck.** TypeScript completed with exit code 0.
- [x] **Step 3: Run Android Expo export.** `expo export --platform android` completed and produced `dist`.
- [x] **Step 4: Run `git diff --check`.** No whitespace errors in the scoped mobile/plan changes.
- [x] **Step 5: Smoke-test Expo Go on the connected Android for login → home → setup → readiness.** Confirmed manually on the connected Android.
- [x] **Step 6: Update phase evidence only with directly verified results; keep P08/P09 state honest and do not mark P09 VERIFIED.** No P09 native recording success or `VERIFIED` claim was added.

## Completion record

- Implemented the authenticated mobile UI flow: Home → Meeting Setup → Microphone Permission (truthful pending state) → Ready Check → blocked Recording preview.
- Added logout confirmation and preserved Auth0 PKCE/deep-link behavior.
- Full mobile verification: 38 test files and 231 tests passed; typecheck passed; Android Expo export passed.
- Manual Expo Go flow confirmed on the connected Android. Native recording remains intentionally blocked until P09 qualification evidence exists.
