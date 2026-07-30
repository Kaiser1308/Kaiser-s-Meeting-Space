# Báo cáo bàn giao P08 — Cho agent khác tiếp tục

## Tổng quan

Phase P08 (Mobile authentication, start flow, readiness, localization) đang ở trạng thái **IN_PROGRESS**. Đã hoàn thành 2/6 tasks (T01, T02). Còn 4 tasks (T03, T04, T05, T06) + integration gate + final review.

## Những gì đã làm

### Preflight

- Đã kiểm tra dependency gate: P04 (IMPLEMENTED) và P07 (IMPLEMENTED) đều được consume qua orthogonal-gates provision (giống pattern P05/P06 đã dùng). Đã ghi nhận trong `docs/execution/evidence/P08/RUN-20260725-0000.md`.
- Đã xác nhận: P04-A04 (route matrix) và P04-A05 (OS keychain device) là ORTHOGONAL với P08. P07-A06 (real adapter conformance) là ORTHOGONAL. Cả hai dependency đều có evidence cho capability mà P08 cần.

### Test environment setup

- **Vấn đề:** `react-native` ships Flow syntax (`import typeof`) mà vitest/rollup không parse được. `react-test-renderer` bị deprecated và không hoạt động với React 19 concurrent mode (`.root` throws "unmounted test renderer").
- **Giải pháp:** Mock `react-native` primitives trong `apps/mobile/src/test-setup.ts` + custom element-tree renderer trong `apps/mobile/src/test-utils.tsx` (render, findByType, findByProp, getText, press). Components phải là presentational (state qua props, actions qua callbacks).
- `react-test-renderer` đã remove khỏi dependencies.
- Vitest config: `environment: 'node'`, `include: ['src/**/*.test.ts', 'src/**/*.test.tsx']`, `setupFiles: ['./src/test-setup.ts']`.
- **Đã verify:** 85 tests pass với setup này.

### Phase design map

- `docs/execution/evidence/P08/design-map.md` — bản đồ design đầy đủ: TranscriptionPolicyV1 (type, Zod schema, legacy mapping), reducer state machine, readiness model, consent model, command seam, i18n/theme/shell spec.
- Được viết bởi design/architecture subagent. Tài liệu authoritative cho implementer.

### T01 — Mobile shell, navigation, tokens, i18n ✅

**Status: Hoàn thành, đã review và fix, spec ✅ quality Approved**

Files đã tạo:

```
apps/mobile/src/i18n/en.ts              # English catalog (exhaustive)
apps/mobile/src/i18n/vi.ts              # Vietnamese catalog (parity với en)
apps/mobile/src/i18n/index.ts           # createTranslator, Locale type, fallback-to-key
apps/mobile/src/i18n/parity.test.ts     # Gate test: mọi key phải có ở cả 2 catalog
apps/mobile/src/i18n/i18n.test.ts       # Translator tests + variable substitution
apps/mobile/src/theme/tokens.ts         # Colors (WCAG AA), spacing, typography, touch ≥44pt, focus ≥2
apps/mobile/src/theme/index.ts          # createTheme({ largeText })
apps/mobile/src/theme/theme.test.ts     # Touch/focus/contrast verification tests
apps/mobile/src/app/deep-link.ts        # parseDeepLink — only oauth_callback + open allowed
apps/mobile/src/app/deep-link.test.ts   # Deep-link security tests
apps/mobile/src/app/ErrorBoundary.tsx    # Class component, fallback UI via i18n
apps/mobile/src/app/error-boundary.test.tsx
apps/mobile/src/app/AppShell.tsx         # Presentational shell (locale/authed/children)
apps/mobile/src/app/app-shell.test.tsx
```

Đã modify: `apps/mobile/App.tsx` (migrated to render AppShell; smoke test green).
**45 tests** (baseline 7). Fixes applied: WCAG AA contrast documentation, contrast test, variable substitution test, ErrorBoundary fallback test, danger color adjusted từ `#d14b3f` → `#b91010` để đạt AA.

**Fixes đã apply:**

- Critical: WCAG AA contrast ratios documented + tested
- Important: variable substitution tested, ErrorBoundary fallback tested
- All 8 color pairs meet AA ≥4.5:1

### T02 — PKCE session UI và secure-storage adapter ✅

**Status: Hoàn thành, đã fix spec issues, 85 tests pass**

Files đã tạo:

```
apps/mobile/src/features/auth/session/store.ts           # AuthState/AuthAction/authReducer/createAuthStore
apps/mobile/src/features/auth/session/store.test.ts       # 12 tests
apps/mobile/src/features/auth/adapters/secure-storage.adapter.ts  # createPlatformSecureStorage() → fake
apps/mobile/src/features/auth/adapters/secure-storage.adapter.test.ts
apps/mobile/src/features/auth/screens/login.tsx           # Presentational login button
apps/mobile/src/features/auth/screens/login.test.tsx      # 6 tests
apps/mobile/src/features/auth/screens/callback.tsx        # Xử lý OAuth callback
apps/mobile/src/features/auth/screens/callback.test.tsx   # 12 tests
apps/mobile/src/features/auth/auth.test.ts                # Integration tests (5 tests)
```

Không modify files cũ. Tận dụng P04 `ClientAuth` + `createFakeSecureStorage`. I18n keys đã được T01 thêm sẵn.

**Fixes đã apply:**

- `logout` action transitions to `'error'` state (instead of `'loading'`)
- `initialize()` dispatches `login_error` khi `getSession()` returns null

## Trạng thái hiện tại

| Task | Status      | Tests      | Files                                             |
| ---- | ----------- | ---------- | ------------------------------------------------- |
| T01  | ✅ Complete | 45         | 16 created + 1 modified                           |
| T02  | ✅ Complete | 85 (total) | 9 created                                         |
| T03  | ⏳ Pending  | —          | TranscriptionPolicyV1 trong @kms/domain + reducer |
| T04  | ⏳ Pending  | —          | Readiness ports/fakes                             |
| T05  | ⏳ Pending  | —          | Consent + command + fake CaptureStarter           |
| T06  | ⏳ Pending  | —          | Branch/a11y tests + Maestro stubs                 |

**Tổng tests hiện tại trên mobile:** 85 tests, 14 test files, typecheck clean.

## Những gì cần làm tiếp (cho agent tiếp theo)

### Quan trọng: Domain coverage gate

`@kms/domain` có 100% branch coverage. Khi thêm `TranscriptionPolicyV1` (T03), cần viết table tests cho mọi refine arm + legacy mapping case để giữ 100%. Lệnh: `pnpm --filter @kms/domain test:unit -- --coverage`.

### Thứ tự thực hiện: T03 → T04 → T05 → T06

### T03 — Start-flow reducer + TranscriptionPolicyV1

Tài liệu cần đọc:

- `docs/execution/evidence/P08/design-map.md` sections 2 (TranscriptionPolicyV1) và 3 (reducer state machine)
- `docs/superpowers/specs/2026-07-24-local-first-final-transcription-design.md` sections 2-3
- Các file type từ T04/T05 cần thiết: implementer có thể định nghĩa `ReadinessResult` và `CloudConsentRecord` types inline hoặc trong shared types file.

File cần tạo:

- `packages/domain/src/transcription/policy.ts` — TranscriptionPolicyV1 type, DEFAULT_TRANSCRIPTION_POLICY, policyFromLegacySpeechMode, TranscriptionPolicyV1Schema (Zod với .refine() invariants)
- `packages/domain/src/transcription/policy.test.ts` — Table tests: policy invariants, legacy rows, default
- Update `packages/domain/src/index.ts` — thêm `export * from './transcription/policy.js'`
- `apps/mobile/src/features/meeting-setup/types.ts` — Shared types: StartFlowStep, StartFlowDraft, StartFlowSuggestions, StartFlowState, StartFlowAction
- `apps/mobile/src/features/meeting-setup/reducer/start-flow-reducer.ts` — Pure reducer
- `apps/mobile/src/features/meeting-setup/reducer/start-flow-reducer.test.ts` — Table tests mọi (state,event)

**Lưu ý:** Reducer là PURE — không import React, không I/O, không async. Test trong `.test.ts` (node).

### T04 — Readiness ports/fakes

File cần tạo:

- `apps/mobile/src/features/meeting-setup/readiness/types.ts` — ReadinessResult, BlockingIssue, DelayedWarning, ReadinessInput, ReadinessPort
- `apps/mobile/src/features/meeting-setup/readiness/ports.ts` — Interface ReadinessPort
- `apps/mobile/src/features/meeting-setup/readiness/fakes.ts` — Fakes (FakeMicrophoneReadiness, FakeStorageReadiness, etc.), createFakeReadinessPort composer
- `apps/mobile/src/features/meeting-setup/readiness/readiness.test.ts`

Invariant: Missing desktop/model/provider NEVER changes policy to cloud và NEVER prevents safe local capture (chỉ là delayed warning).

### T05 — Consent + capture-start command

File cần tạo:

- `apps/mobile/src/features/meeting-setup/consent/types.ts` — CloudConsentRecord, CloudConsentScope
- `apps/mobile/src/features/meeting-setup/consent/consent.ts` — Consent logic
- `apps/mobile/src/features/meeting-setup/consent/consent.test.ts`
- `apps/mobile/src/features/meeting-setup/command/types.ts` — StartMeetingCommand
- `apps/mobile/src/features/meeting-setup/command/command.ts` — buildCommand()
- `apps/mobile/src/features/meeting-setup/command/command.test.ts`
- `apps/mobile/src/features/meeting-setup/command/capture-starter.ts` — CaptureStarter interface + createFakeCaptureStarter

**Conversation boundary:** Chỉ fake CaptureStarter. Không real audio, provider, upload, speech.

### T06 — QA tests

- Branch/a11y/catalog tests qua các file .test.tsx hiện có
- Maestro stubs (nếu có thể)
- Grep scan để verify A05 (không có real capture imports)

### Integration gate

- Run `pnpm verify` (root)
- Secret scan
- Update `docs/execution/evidence/P08/EVIDENCE.md`
- Update `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`
- Final whole-phase review per `docs/execution/templates/HANDOFF_TEMPLATE.md`

### Expected outcome

- A01, A02, A03, A05: có thể đạt VERIFIED qua CI-grade tests
- A04 (device matrix VoiceOver/TalkBack): cần physical devices — **không có sẵn** → P08 sẽ kết thúc ở trạng thái **IMPLEMENTED** (giống P04)
- P09 được unblock

## Các quyết định kiến trúc quan trọng

1. **Không ADR mới** — P08 strictly additive. `TranscriptionPolicyV1` là module mới trong `@kms/domain`, không sửa `MeetingSettings.speechMode`.
2. **Test setup:** react-native mocked, custom renderer (không react-test-renderer, không jest). Components phải presentational.
3. **Consent copy:** PRIVACY-001 BLOCKED → dùng placeholder `CONSENT_COPY_VERSION = 'v0.1-placeholder'` (chưa implement, cần T05 thêm).
4. **Meeting language vs UI locale:** độc lập. `start.language` là field riêng trong StartFlowDraft.
5. **Task ordering do các implementer serial:** T01→T02→T03→T04→T05→T06. File ownership không overlap giữa các task active đồng thời.
