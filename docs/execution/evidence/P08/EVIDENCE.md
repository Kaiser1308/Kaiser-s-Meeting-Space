# P08 Evidence

- Phase/state: P08 — VERIFIED (manual accessibility closure confirmed 2026-08-06)
- Run records: `RUN-20260725-0000.md`, `RUN-20260805-verify-final.md`, `RUN-20260805-root-path-and-apk.md`
- Date/timezone: 2026-07-25 UTC+7
- Environment and exact tool versions: Node.js v24.18.0, pnpm 10.14.0, TypeScript 5.9.3, Vitest 4.1.10, Expo ~54.0.0, React 19.1.0, React Native 0.81.4, Zod 3.25.76, Windows 11 Pro 10.0.26200
- Starting and ending commit/tree: Starting: 2935261 + P00-P07 working tree. Ending: working tree (P08 additive to `apps/mobile/src/` and `packages/domain/src/transcription/`).
- Pre-existing dirty files preserved: All P00-P07 working-tree changes preserved; only additive changes to mobile and domain packages.

## Requirement and acceptance mapping

| Requirement / acceptance ID | Test or scenario                                                                                                | Result  | Artifact                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P08-A01                     | Start impossible without valid title/language/mode/source/permission/storage + required cloud consent           | PASS    | `start-flow-reducer.test.ts` (no-skip per step), `readiness.test.ts` (blocking), `consent.test.ts` (required consent)                                                              |
| P08-A02                     | Command validates P02 + TranscriptionPolicyV1, defaults to local final, idempotent, meeting-only no translation | PASS    | `command.test.ts`, `policy.test.ts` (domain: 244 tests, 10 files)                                                                                                                  |
| P08-A03                     | Auth/readiness/offline/desktop/model/provider states truthful, localized, content-free, no auto cloud fallback  | PASS    | `store.test.ts` (auth states), `readiness.test.ts` (no-fallback invariant), `fakes.ts`                                                                                             |
| P08-A04                     | vi/en UI, large text, VoiceOver/TalkBack, focus, contrast pass supported-device matrix                          | PASS    | `physical-accessibility-matrix.md`; direct device evidence plus reviewer-confirmed completion of the remaining TalkBack/accessibility manual checks on 2026-08-06 |
| P08-A05                     | No audio capture/provider behavior beyond fake starter                                                          | PASS    | Grep scan of `meeting-setup/` (no AudioRecord/AVAudioEngine/Deepgram/whisper imports)                                                                                              |

## Dependency-consumption evidence

Exposes to P09:

- `TranscriptionPolicyV1` type, `DEFAULT_TRANSCRIPTION_POLICY`, `TranscriptionPolicyV1Schema`, `policyFromLegacySpeechMode` from `@kms/domain`
- `StartMeetingCommand` type and `buildStartMeetingCommand` from `apps/mobile/src/features/meeting-setup/command/`
- `CaptureStarter` interface + `createFakeCaptureStarter` extension seam (P09 replaces the fake with real native adapters)
- `ReadinessPort` / `ReadinessResult` / `ReadinessInput` interfaces from `apps/mobile/src/features/meeting-setup/readiness/`
- `StartFlowState` / `StartFlowAction` types and `startFlowReducer` / `INITIAL_STATE` from `apps/mobile/src/features/meeting-setup/reducer/`
- I18n catalog parity infrastructure (vi/en), theme tokens, accessible primitives
- `SecureStorage` adapter interface from `apps/mobile/src/features/auth/adapters/`

Consumes:

- P02: `MeetingSettings`, `MeetingSettingsSchema`, `MeetingId`, `MeetingLanguage`, `MeetingMode`, `SpeechMode`, `deriveTranslationTarget`
- P04: `ClientAuth` PKCE flow, `SecureStorage` interface + `createFakeSecureStorage`
- P07: `FileSystem`, `Clock`, `Checksum`, `UploadTransport` interface contracts (for `ReadinessPort` design alignment)

## Commands

| Command                               | Exit code | Intended tests | Executed tests | Duration | Report                                                                                          |
| ------------------------------------- | --------: | -------------: | -------------: | -------: | ----------------------------------------------------------------------------------------------- |
| `vitest run --configLoader runner`    |         0 |            246 |            246 |        — | 42 test files, all passing                                                                      |
| `pnpm --filter @kms/domain test:unit` |         0 |            244 |            244 |    1.11s | 10 test files, all passing                                                                      |
| `pnpm --filter @kms/mobile typecheck` |         0 |      All files |      All files |      <5s | Clean                                                                                           |
| `pnpm typecheck` (full repo)          |       N/A |    14 packages |    13 packages |     <15s | Mobile-only typecheck PASS; full workspace blocked by pre-existing domain/desktop config issues |

## Manual, device, and provider matrix

| Scenario                      | Environment/version          | Result      | Artifact                                                                                                                                                           | Reviewer |
| ----------------------------- | ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Physical device a11y (A04)    | Android 16/API 36, CPH2699   | PASS        | `physical-accessibility-matrix.md` (12 cases); direct device evidence plus reviewer-confirmed completion of remaining TalkBack/accessibility checks on 2026-08-06 | Reviewer |
| Maestro E2E flows             | Maestro Runner               | BLOCKED     | Matrix ready; Maestro/device unavailable                                                                                                                           | —        |
| OS keychain persistence (A04) | expo-secure-store + Keychain | IMPLEMENTED | `secure-storage.adapter.ts` dynamically loads Expo SecureStore; adapter test verifies native backend delegation; real device restart retained Home auth, logout cleared it, and post-logout restart remained on login | —        |

## Security, privacy, and data-integrity review

- No secrets in any committed file
- All test fixtures use synthetic data only
- A05 scan confirms no real audio capture, provider, or upload imports in `meeting-setup/` feature
- `CaptureStarter` is the only extension seam; it is a fake in P08, replaced in P09
- Consent records use placeholder `CONSENT_COPY_VERSION = 'v0.1-placeholder'` (PRIVACY-001 BLOCKED)
- `CloudConsentScope` has no `minutes_ai` or `auto_record` variants (cross-purpose isolation verified)
- Deep-link parser rejects mid-flow bypass attempts; only `oauth_callback` and `open` intents allowed
- Error boundary renders fallback UI via i18n; never a white screen
- Content-free: readiness `detail` fields are operational only (bytes, remediation IDs); no meeting content in any log/message

## Defects and root-cause fixes

| Defect                                                  | Classification | Root cause                                                    | Regression test                             | Fix commit   |
| ------------------------------------------------------- | -------------- | ------------------------------------------------------------- | ------------------------------------------- | ------------ |
| WCAG AA contrast: danger color `#d14b3f`                | Accessibility  | Color ratio 3.4:1 < AA 4.5:1                                  | `theme.test.ts` contrast test               | Working tree |
| `logout` action transitions to `'loading'` state        | Logic          | Missing error path in reducer                                 | `store.test.ts` logout transition tests     | Working tree |
| `initialize()` dispatches `login_error` on null session | Logic          | Missing null check in auth store init                         | `store.test.ts` init error path             | Working tree |
| Mobile typecheck: branded `MeetingId` in test fixtures  | Test           | Test used plain `string` where `MeetingId` (branded) required | `command.test.ts` `as MeetingSettings` cast | Working tree |

## Migration, rollout, rollback, and recovery

- P08 is strictly additive: new `transcription/` module in `@kms/domain`, restructured `apps/mobile/src/` into features/app/i18n/theme
- No database migrations required (P08 is client-side only)
- Existing `App.tsx` smoke test preserved; migration path is render `AppShell` with `ErrorBoundary`
- `TranscriptionPolicyV1` is additive to `MeetingSettings.speechMode`; no P02 contract is renamed, retyped, or removed
- Rollback: remove `TranscriptionPolicyV1` re-export from domain barrel; revert `App.tsx` to pre-shell version

## Residual risks and owner actions

| Risk                                      | Severity | Owner         | Action required                                                                        |
| ----------------------------------------- | -------- | ------------- | -------------------------------------------------------------------------------------- |
| Consent copy placeholder (PRIVACY-001)    | HIGH     | Product+Legal | Provide real consent copy text; swap `CONSENT_COPY_VERSION` constant                   |
| Physical device a11y matrix (P08-A04)     | CLOSED   | Engineering   | Android A04/TalkBack manual closure confirmed by reviewer on 2026-08-06              |
| No Maestro E2E tests                      | LOW      | Engineering   | Install Maestro runner; add E2E flow tests when device builds available                |
| OS keychain device evidence (P04-A05→P08) | CLOSED   | Engineering   | Real-device restart/logout/restart sequence recorded in the current APK run; retain evidence for P26 signing |

## Final state rationale

P08 is **VERIFIED**. All 5 CI-grade tasks (T01-T05) are complete with 247 mobile tests and 244 domain tests passing, mobile typecheck clean. A01-A05 have direct or reviewer-confirmed evidence. The root-path, release APK, and real-device SecureStore evidence is recorded in `RUN-20260805-root-path-and-apk.md`.

P08-A04 (Android TalkBack matrix: orientation, 200% font) has a case-level execution artifact in `physical-accessibility-matrix.md`; the remaining manual checks were confirmed passed by the reviewer on 2026-08-06. iOS remains non-gating under ADR-007.

P09 is unblocked: P08 provides the `CaptureStarter` extension seam, `StartMeetingCommand` contract, `TranscriptionPolicyV1` contract, readiness model, and mobile shell foundation that P09 consumes.
