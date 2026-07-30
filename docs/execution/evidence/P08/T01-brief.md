# P08-T01 Task Brief — Mobile shell, navigation, design tokens, exhaustive i18n

## Where this task fits

P08 restructures `apps/mobile/` from a single `App.tsx` into a navigation/screens/theme/i18n shell. T01 builds the foundation (i18n, theme, app shell, safe deep-link) that T02 (auth) and T03-T05 (meeting setup) build on. The phase packet is `docs/execution/phases/P08-mobile-start-flow.md`. The design map is `docs/execution/evidence/P08/design-map.md` (read §7 and §8).

## Exclusive file ownership (you may create/modify ONLY these)

- `apps/mobile/src/i18n/**` (new: `en.ts`, `vi.ts`, `index.ts`, `i18n.test.ts`, `parity.test.ts`)
- `apps/mobile/src/theme/**` (new: `tokens.ts`, `index.ts`, `theme.test.ts`)
- `apps/mobile/src/app/**` (new: `AppShell.tsx`, `ErrorBoundary.tsx`, `deep-link.ts`, `app-shell.test.tsx`)
- `apps/mobile/App.tsx` (migrate to render the shell — preserve the existing `src/app.test.ts` smoke checks)
- `apps/mobile/src/test-setup.ts` and `apps/mobile/src/test-utils.tsx` ALREADY EXIST (preflight created them) — you may refine/extend them if needed; they mock `react-native` primitives and provide a custom element-tree renderer.

**Do NOT touch:** `apps/mobile/src/auth/**` (P04, owned by T02), `apps/mobile/src/features/**` (owned by T02-T05), `packages/**` (owned by T03). Do NOT modify `apps/mobile/package.json` dependencies (already set up).

## Test environment (already configured in preflight — use as-is)

- `apps/mobile/vitest.config.ts`: `environment: 'node'`, `include: ['src/**/*.test.ts','src/**/*.test.tsx']`, `setupFiles: ['./src/test-setup.ts']`.
- `react-native` is mocked in `src/test-setup.ts` (Text, View, TouchableOpacity, Pressable, SafeAreaView, ScrollView, TextInput, StatusBar, StyleSheet, Platform). Do NOT import real react-native internals beyond these primitives.
- Component tests use the custom renderer in `src/test-utils.tsx` (`render`, `findByType`, `findByProp`, `getText`, `press`). **Do NOT use `react-test-renderer`** (removed — incompatible with React 19). Components MUST be presentational: receive state/labels via props, dispatch via callbacks. No hooks-based local state in tested components beyond what the custom renderer evaluates (it evaluates function components by calling them once; `useState`/`useEffect` will NOT work — design components to be pure functions of props).
- Run tests with: `pnpm --filter @kms/mobile test:unit`. Typecheck: `pnpm --filter @kms/mobile typecheck`.

## Exact contract requirements

### i18n (`src/i18n/`)

- `Locale = 'vi' | 'en'`. UI locale is INDEPENDENT of meeting language.
- `en.ts` and `vi.ts` each export a `const catalog = { ... }` with IDENTICAL key sets (exhaustive parity). Keys are flat dotted strings or nested objects — pick one and be consistent. Include at minimum these shell keys (T02-T05 will add more keys to BOTH files later):
  - `app.name`, `app.tagline`
  - `shell.error.title`, `shell.error.retry`
  - `auth.login`, `auth.logout`, `auth.loading`, `auth.error.offline`, `auth.error.expired`, `auth.error.revoked`, `auth.error.generic`
  - `start.title` (the meeting-title field label), `start.language.label`, `start.language.vi`, `start.language.en`, `start.mode.label`, `start.mode.meeting_only`, `start.mode.meeting_translate`, `start.source.label`, `start.source.mic`, `start.source.system`, `start.processing.label`, `start.readiness.label`, `start.consent.label`, `start.button`, `start.back`, `start.next`
  - `choice.record_only`, `choice.live_cloud`, `choice.final_local`, `choice.final_cloud`, `choice.final_local_cloud_check` (reader-facing labels per design-map §5.3 — English source strings verbatim from that table; provide vi translations)
  - `readiness.block.microphone_permission`, `readiness.block.audio_source_invalid`, `readiness.block.storage_insufficient`, `readiness.delay.waiting_for_desktop`, `readiness.delay.waiting_for_model`, `readiness.delay.provider_unavailable`, `readiness.delay.offline`, `readiness.delay.translation_unavailable`
  - `consent.copy` (placeholder), `consent.provider`, `consent.scope`, `consent.version`, `consent.grant`, `consent.decline`
- `index.ts` exports: `type Locale`, `LOCALES`, `catalogs: Record<Locale, Catalog>`, `createTranslator(locale: Locale): (key: string, vars?: Record<string,string|number>) => string`. The translator looks up `key` in the selected locale's catalog; if missing, returns the key itself (visible, not a crash) — this is the runtime fallback. `defaultLocale = 'vi'`.
- `parity.test.ts`: the missing-key gate. Asserts `Object.keys(en)` deep-equals `Object.keys(vi)` recursively (both catalogs have exactly the same keys). Also asserts the translator returns the key string for an unknown key (fallback) and the translated value for a known key. This test MUST fail if any key is added to one catalog but not the other.

### theme (`src/theme/`)

- `tokens.ts`: design tokens object with:
  - `colors`: dark surface `#173128`, sheet `#f5f3ed`, accent `#d8ff6a`, danger `#d14b3f`, text-on-dark `#ffffff`, muted-on-dark `#b7c3be`, text-on-light `#17201d`, muted-on-light `#707874` (carry over from current App.tsx). Add a `focusRing` color. All color pairs used for text/background must meet WCAG AA contrast (4.5:1 for normal text) — document the ratio in a comment.
  - `spacing`: scale in px (4, 8, 12, 16, 24, 28, 44...).
  - `touchTarget`: minimum 44 (pt/dp) for accessible touch targets.
  - `typography`: font sizes including a scale that supports 200% enlargement (the structure should make a `largeText` variant available, e.g. `typography.base` and `typography.large` with ~2x sizes).
  - `focus`: border/ring width (≥2) for visible focus.
- `index.ts` exports `tokens` and a `createTheme({ largeText }: { largeText?: boolean })` returning a resolved theme (tokens with large-text variants). Add a `theme.test.ts` asserting: touchTarget ≥ 44, focus width ≥ 2, and that `createTheme({largeText:true})` produces ≥1.5x larger base font than default.

### app shell (`src/app/`)

- `ErrorBoundary.tsx`: a React class component (error boundary) that catches render errors and renders a fallback using the error i18n keys (`shell.error.title`, `shell.error.retry`). It must NEVER silently white-screen. (Class components work with the custom renderer? The renderer only evaluates function components — so ErrorBoundary as a class component is fine for production but not unit-tested via the custom renderer. Test it via a function-component wrapper or just assert it exports and typechecks; its catch behavior is exercised in T06/manual. Keep the ErrorBoundary thin.)
- `deep-link.ts`: a `parseDeepLink(url: string): DeepLinkIntent` function where `DeepLinkIntent = { kind: 'oauth_callback'; code: string; state: string; nonce?: string } | { kind: 'open'; surface: 'meeting_setup' | 'library' } | { kind: 'unknown' } | { kind: 'rejected' }`. The deep-link policy: ONLY `oauth_callback` and top-level `open` intents are allowed. It MUST NOT produce any intent that sets a start-flow step or bypasses a required step (design-map §3.4 rule 5). Unknown/malformed schemes return `{ kind: 'unknown' }`; any attempt to deep-link into the middle of the start flow returns `{ kind: 'rejected' }`. Pure function, fully unit-testable.
- `AppShell.tsx`: the root shell. Presentational — receives `{ locale, authed, onLocaleChange, children }` (or similar) and renders providers + navigation. In P08 it does not need a real navigator library; a simple switch on `authed` (login vs app) is fine. It composes ErrorBoundary. Keep it presentational so it renders under the custom renderer.
- Migrate `apps/mobile/App.tsx`: replace its body to render `AppShell` (and the existing visual content moves into a screen the shell hosts, OR keep the visual as the default screen). The existing `src/app.test.ts` smoke test (checks `App.tsx` and `vitest.config.ts` exist) MUST stay green. Do not delete `App.tsx`.

### Tests you must write (TDD — write failing test first, then implement)

- `src/i18n/parity.test.ts` — catalog parity gate (above).
- `src/i18n/i18n.test.ts` — translator lookup, fallback-to-key, var substitution, `defaultLocale`, and that selecting UI locale `en` is independent of any meeting-language concept.
- `src/theme/theme.test.ts` — touch target ≥44, focus ≥2, large-text ≥1.5x.
- `src/app/deep-link.test.ts` — oauth_callback parsed; open surfaces parsed; unknown scheme; rejected mid-flow bypass attempt.
- `src/app/app-shell.test.tsx` — AppShell renders children; when `authed=false` shows login affordance; when `authed=true` shows children; ErrorBoundary fallback renders on a thrown child (use a function component that throws + ErrorBoundary wrapper; if class-component catch can't be exercised by the custom renderer, at minimum assert the fallback render path directly).

## Non-goals (do NOT implement)

- No real authentication logic (T02). No meeting-setup reducer/screens/readiness/consent/command (T03-T05). No audio. No Maestro (T06). No new dependencies. No changes to `packages/**`. Do not weaken the `src/app.test.ts` smoke test.

## TDD loop (mandatory)

For each deliverable: write the failing narrow test → run `pnpm --filter @kms/mobile test:unit` and confirm it fails for the right reason → implement → confirm non-zero pass → run `pnpm --filter @kms/mobile typecheck`. Do not skip the failing-test step.

## Report

Write your full report to `docs/execution/evidence/P08/T01-report.md` covering: files changed, the exact test command + exit code + test count (before and after), typecheck result, any deviations from this brief, and unresolved concerns. Return in your final message: status (DONE / DONE_WITH_CONCERNS / BLOCKED), the list of files you created/modified, the final test count, and a one-line summary.
