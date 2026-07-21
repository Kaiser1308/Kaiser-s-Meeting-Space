---
phase: P08
title: Mobile authentication, start flow, readiness, and localization
status: NOT_STARTED
depends_on: [P04, P07]
requirements: [FR-1, NFR-Accessibility, NFR-Localization]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

The Expo development app authenticates and completes the exact pre-meeting sequence `title -> vi|en -> meeting_only|meeting_translate -> microphone -> API/local availability -> readiness -> consent -> Start`. Start remains impossible until required inputs/permission/storage/source are valid, while offline/provider unavailability is represented truthfully without preventing local capture when policy permits.

# Authoritative context

Read PRD FR-1/FR-2, User Flows start/live/failure sections, P00 support/consent/provider decisions, P02 settings/command/state contracts, P04 client auth, P07 capture/recovery adapter contract, and Security privacy copy.

# Preconditions and external prerequisites

P04/P07 are `VERIFIED`; Expo development builds and supported Android/iOS SDKs are available. CI may use fake readiness/keychain adapters; physical-device permission/keychain/a11y evidence is required for `VERIFIED`.

# Scope firewall

**Allowed:** restructure `apps/mobile/` into navigation/screens/features/theme/i18n/auth/setup adapters, test IDs, component tests, and Maestro start-flow tests.

**Forbidden/out:** audio byte capture, background recording, upload/library, speech/translation calls, arbitrary local AI, visual redesign beyond accessible tokens, or storing secrets/settings unsafely.

**Extension seams:** setup consumes typed `ReadinessPort` and `CaptureStarter`; P09 replaces the fake starter without changing flow state.

# Contracts and invariants

- `StartMeetingDraft` validates P02 settings; language is explicitly confirmed every meeting even if suggested.
- Translation target is derived only for `meeting_translate`; meeting-only emits no translation request.
- Readiness separates blocking permission/source/storage from non-blocking network/provider delayed-processing warnings per accepted policy.
- UI locale is independent of meeting language and both catalogs are exhaustive.
- Consent acknowledgement records copy/policy version but never silently persists permission to auto-record.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| `apps/mobile/src/app/` | navigation, providers, error boundary | Shell/i18n |
| `apps/mobile/src/i18n/`, `theme/` | vi/en catalogs, tokens, accessible primitives | Shell/i18n |
| `apps/mobile/src/features/auth/` | P04 auth/session UI | Auth integration |
| `apps/mobile/src/features/meeting-setup/` | reducer/screens/readiness/consent/command | Setup flow |
| `apps/mobile/e2e/` and feature tests | branches/a11y/Maestro | Independent reviewer |

# Ordered task packets

## P08-T01 - Mobile shell, navigation, design tokens, and exhaustive i18n

Add failing render/navigation/catalog parity tests; implement app providers, authenticated routes, error boundary, safe deep-link policy, tokens, visible focus/touch sizes, vi/en catalogs/fallback, and missing-key failure. Migrate `App.tsx` to the shell without product behavior loss. Evidence: `evidence/P08/mobile-shell-report.json`.

## P08-T02 - PKCE session UI and secure-storage adapter wiring

Wire P04 client contract for login/callback/session refresh/logout and fake/platform secure storage. Test loading, offline, expired/revoked, callback replay, cancel, error localization, and recovery-manifest preservation on logout. Evidence: `mobile-auth-report.json`.

## P08-T03 - Pure start-flow reducer and persisted suggestions

Implement ordered step state, back/forward/edit, draft persistence of non-sensitive suggestions, reset, explicit language reconfirmation, and P02 schema validation. Table-test every event/state pair, restore/corrupt draft, and no skip/deep-link bypass. Evidence: `start-reducer-report.json`.

## P08-T04 - Permission, source, storage, network, and processing readiness

Implement typed readiness ports/fakes and UI states for microphone permission, source availability, storage estimate/margin, API network, configured speech/translation/local capability, retry/settings remediation, and stale results. Test denied/restricted/permanent denial, low disk, offline policy, provider unavailable, and race/cancel. Evidence: `readiness-matrix.json`.

## P08-T05 - Consent and validated capture-start command

Render approved consent/provider disclosure/version and final settings review; construct one P02 command with title/timezone/language/mode/source/processing and idempotency. Start calls fake `CaptureStarter` only after current readiness. Test double tap, stale permission, missing consent/version, meeting-only no translation, and command snapshot. Evidence: `start-command-report.json`.

## P08-T06 - Mobile branch, accessibility, localization, and platform qualification

Run component and Maestro scenarios for every setup branch on Android/iOS, orientation, 200% font, contrast/focus/touch target, VoiceOver/TalkBack labels/order, vi/en UI with both meeting languages, permission denial/retry, offline/delayed processing, and auth expiry. Evidence: `evidence/P08/EVIDENCE.md`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Shell/i18n | T01 | app/i18n/theme | P04 | navigation/a11y review |
| Auth | T02 | auth feature | T01 | PKCE/secure-store review |
| Setup | T03-T05 | meeting-setup feature | T01,T02,P07 | state/consent review |
| Independent QA | T06 | tests/evidence only | all | physical-device/a11y review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Permission denied/restricted | platform | Start disabled; exact OS remediation | permission matrix |
| API/provider offline | provider | Local recording allowed only by approved delayed policy; no silent downgrade | readiness test |
| Low storage | environment | Block Start with required/free estimate | boundary test |
| Stale async readiness | timing | Ignore old result; recheck before command | race test |
| Missing catalog/consent version | contract | Fail build/start safely | parity/version test |

# Integrated verification

Run mobile typecheck/unit/component/catalog/a11y tests, P02/P04/P07 contracts, Maestro start-flow on supported Android/iOS, bundle secret scan, and `pnpm verify`. Record physical OS/device and executed cases.

# Acceptance gate

- [ ] P08-A01 - Start is impossible without explicit valid title/language/mode/source/permission/storage/consent.
- [ ] P08-A02 - Produced command validates P02, is idempotent, and meeting-only requests no translation.
- [ ] P08-A03 - Auth/readiness/offline/provider errors are truthful, localized, recoverable, and content-free.
- [ ] P08-A04 - Vietnamese/English UI, large text, VoiceOver/TalkBack, focus, and contrast pass supported-device matrix.
- [ ] P08-A05 - No audio capture/provider behavior beyond the fake starter was implemented.

# Migration, rollout, and rollback

Use a feature flag; distributable builds keep Start connected to the fake/unavailable adapter until P09. Draft-state migration is versioned and discards invalid non-sensitive suggestions safely.

# Required documentation updates

User Flows screenshots/copy identifiers, mobile development setup, Status/Traceability/Progress, and P08 evidence.

# Handoff record

Unblock P09 only.
