# P08-T02 Task Brief — PKCE session UI and secure-storage adapter wiring

## Where this task fits

P08-T02 wires the P04-authenticated PKCE client contract into mobile session UI. P04 provides `ClientAuth` (`apps/mobile/src/auth/auth-client.ts` with `beginLogin`, `completeLogin`, `refresh`, `logout`, `withAccessToken`) and `SecureStorage` with a fake adapter (`createFakeSecureStorage`). T02 consumes these to build the auth feature UI screens (`apps/mobile/src/features/auth/`) and adapters. T01 built the shell/i18n/theme foundation. The design map §2 describes the adapter seam, and the design map §4.2/§7 describes the non-blocking/auth-related readiness states.

## Exclusive file ownership (you may create/modify ONLY these)

- `apps/mobile/src/features/auth/**` (new: session/store.ts, screens/login.tsx, screens/callback.tsx, adapters/secure-storage.adapter.ts)
- You may EDIT the existing `apps/mobile/src/auth/**` (auth-client.ts, secure-storage.ts, pkce.ts) ONLY to wrap them or export from features/auth if needed for cleaner imports (do NOT break the existing 7 auth tests — they must still pass).
- **Do NOT touch:** `apps/mobile/src/app/**` (shell, owned by T01), `apps/mobile/src/features/meeting-setup/**` (T03-T05), `packages/**` (domain owned by T03+, local-recovery owned by P07), `apps/mobile/i18n/*` (T01 adds auth keys later).

## Test environment (same as T01)

- Vitest with node env, react-native mocked, custom renderer from `test-utils.tsx`.
- Presentational components: receive state/actions via props, dispatch via callbacks.
- Run tests with: `pnpm --filter @kms/mobile test:unit`. Typecheck: `pnpm --filter @kms/mobile typecheck`.

## P04 contract you consume (read these before implementing)

- `apps/mobile/src/auth/auth-client.ts` — `ClientAuth`, `OAuthTransport`, `AuthConfig`, `LoginRequest`, `SessionInfo`, methods: `beginLogin()`, `completeLogin()`, `refresh()`, `logout()`, `getSession()`, `withAccessToken()`.
- `apps/mobile/src/auth/secure-storage.ts` — `SecureStorage` interface, `createFakeSecureStorage()`.

## Exact contract requirements

### Session store (`session/store.ts`)

- Pure TypeScript (no React, no I/O). Manages auth session state and P04's client instance.
- Export: `type AuthState = { kind: 'loading' } | { kind: 'authenticated'; session: SessionInfo } | { kind: 'error'; error: string }`.
- Export: `type AuthAction = { type: 'login_start' } | { type: 'login_complete'; session: SessionInfo } | { type: 'login_error'; error: string } | { type: 'refresh_success'; session: SessionInfo } | { type: 'refresh_error'; error: string } | { type: 'logout' }`.
- Export: `function authReducer(state: AuthState, action: AuthAction): AuthState` — pure reducer, table-testable.
- Export: `function createAuthStore({ client, onSessionChange }: { client: ClientAuth; onSessionChange: (s: SessionInfo | null) => void })` — returns `{ getState, dispatch, initialize, refresh, logout }`. The `initialize()` method calls `getSession()` on the client and dispatches accordingly. `refresh()` calls `client.refresh()`. `logout()` calls `client.logout()` then dispatches `logout`. All methods are async and update state via dispatch; errors are dispatched as `login_error` or `refresh_error`.

### Secure-storage adapter (`adapters/secure-storage.adapter.ts`)

- The P04 `SecureStorage` interface uses a Promise-based fake for CI. The real adapter (for device evidence) would wrap iOS Keychain / Android Keystore. P08 only needs to expose the CONTRACT seam; the fake is sufficient for CI. Provide: `export function createPlatformSecureStorage(): SecureStorage`. For CI, return the fake from P04. Later (device evidence) this would import Expo SecureStore or native modules — you MUST NOT do that here. Just export a factory that calls `createFakeSecureStorage()` for now.

### Login screen (`screens/login.tsx`)

- Presentational component: receives `{ onLogin, loading }: { onLogin: () => void; loading: boolean }` and renders a login button. Uses the i18n keys `auth.login`, `auth.loading`. T01 didn't add these keys yet — add them to `apps/mobile/src/i18n/en.ts` and `apps/mobile/src/i18n/vi.ts` (maintain parity! add the same keys to BOTH files). For simplicity: "Log in" / "Đăng nhập" and "Loading..." / "Đang tải...". When pressed, call `onLogin()`. When `loading`, disable the button.
- Test: using `render`, assert button renders with login text, pressing calls `onLogin`, loading disables button.

### Callback screen (`screens/callback.tsx`)

- Presentational component: receives `{ code: string; state: string; nonce?: string; onComplete: (success: boolean) => void }` and calls `P04 ClientAuth.completeLogin` via an injected callback (pass `client` from session store via parent container, not imported directly in the screen). This screen is rendered by the deep-link handler (T01's `parseDeepLink` parses the oauth_callback kind). Use the i18n keys `auth.error.offline`, `auth.error.expired`, `auth.error.revoked`, `auth.error.generic` — add these to BOTH en and vi catalogs (maintain parity). Show these messages if `completeLogin` throws.
- Test: using `render`, mock `completeLogin` behavior (success/throws), assert UI shows correct state and calls `onComplete(success)`.

### Integration requirements (testing with the auth client and fake storage)

- `features/auth/auth.test.ts`: integration test that wires `ClientAuth` with fake storage and OAuthTransport, then exercises the full flow: `beginLogin()` → `completeLogin()` → `refresh()` → `logout()`. Use the existing P04 tests as a pattern (`apps/mobile/src/auth/auth-client.test.ts` has similar tests). Verify `createPlatformSecureStorage()` returns a working fake (the P04 `createFakeSecureStorage` already works; just ensure the adapter factory wraps it).
- Verify that `callback replay` throws: call `completeLogin` twice with the same state/nonce — the second should throw (P04 enforces this via storage.transaction deletion). Test this explicitly.

### Error localization and recovery-manifest preservation

- All errors shown to the user must use the i18n error keys (`auth.error.*`). Do NOT show raw error strings in production components. In tests, you can assert the error key.
- `logout()` must call the P04 client's `logout()`. The P04 client revokes the refresh token if available, removes tokens from secure storage, and clears its internal session. The session store then dispatches `logout`. Verify in integration test.

## Non-goals (do NOT implement)

- No real iOS Keychain / Android Keystore (device evidence — P04-A05). Use the fake adapter.
- No real OAuth provider. Use the P04 `OAuthTransport` interface's mock in tests.
- No auth screens beyond login and callback (no signup, no profile settings).
- Do NOT add new dependencies.

## TDD loop (mandatory)

For each deliverable: write failing test → run → confirm failure → implement → confirm pass → typecheck.

## Report

Write your full report to `docs\execution\evidence\P08\T02-report.md` covering: files changed, the exact test command + exit code + test count (before and after), typecheck result, i18n keys added, any deviations, concerns, and the list of added/modified files. Return in your final message: status (DONE / DONE_WITH_CONCERNS / BLOCKED), files created/modified, final test count, and a one-line summary.
