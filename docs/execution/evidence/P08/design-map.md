# P08 Design / Boundary Map

**Phase:** P08 — Mobile authentication, start flow, readiness, and localization
**Role:** Design / Architecture subagent (analysis only — no implementation)
**Source packet:** `docs/execution/phases/P08-mobile-start-flow.md` (ACCEPTED)
**Authoritative design:** `docs/superpowers/specs/2026-07-24-local-first-final-transcription-design.md` (Approved; **defines** `TranscriptionPolicyV1` in §3)
**Consumed contracts:** P02 `packages/domain/src/meeting/schemas.ts`; P04 `apps/mobile/src/auth/{auth-client,secure-storage}.ts`; P07 `packages/local-recovery/src/contracts/transport.ts`
**Privacy register:** `docs/execution/evidence/P00/privacy-approval-register.md` — PRIVACY-001 **BLOCKED**, PRIVACY-002 Accepted, PRIVACY-011 Accepted

This map fixes every type, invariant, file path, and boundary an implementer needs. Implementers may copy the code blocks verbatim. It does not modify any contract; it only records what already-accepted documents require.

---

## 1. Architecture decisions

**No architecture change. P08 is strictly additive.** This conforms exactly to the P08 scope firewall ("Allowed: additive shared `TranscriptionPolicyV1` contract/database compatibility, restructure `apps/mobile/` into navigation/screens/features/theme/i18n/auth/setup adapters").

- No new service, no new trust boundary, no new persistence engine.
- `packages/domain` gains one new additive module (`src/transcription/policy.ts`) and one new re-export line in `src/index.ts`. No existing P02 export is renamed, retyped, or removed (verified against `packages/domain/src/index.ts:5-13`). `MeetingSettings.speechMode` (P02) remains as-is; the new policy is additive and is read alongside it.
- `apps/mobile/` is restructured from a single `App.tsx` into the packet's file/ownership map (`src/app/`, `src/i18n/`, `src/theme/`, `src/features/auth/`, `src/features/meeting-setup/`). `App.tsx` is migrated, not deleted; the existing `src/app.test.ts` smoke test stays green (it only checks file existence of `App.tsx` and `vitest.config.ts`).
- The fake `CaptureStarter` and fake `ReadinessPort`s are **extension seams**, explicitly listed in the packet: "setup consumes typed `ReadinessPort` and `CaptureStarter`; P09 replaces the fake starter without changing flow state." P09 swaps the adapter; P08 flow state is unchanged by that swap.

**No ADR is required for this phase.** Recording "no architecture change, additive only" here satisfies the architecture-decision requirement.

---

## 2. TranscriptionPolicyV1 contract specification (T03 prerequisite)

Source of truth: approved design spec §3 (`docs/superpowers/specs/2026-07-24-local-first-final-transcription-design.md:62-101`). Invariants from §3 lines 79-94 and privacy/consent from §7 lines 265-282.

### 2.1 File path and re-export

- **New file:** `packages/domain/src/transcription/policy.ts`
- **Re-export:** add `export * from './transcription/policy.js';` to `packages/domain/src/index.ts` (alongside the existing `export * from './meeting/schemas.js';` block). This is the single additive change to the domain barrel.
- New directory `packages/domain/src/transcription/` (distinct from the existing `transcript/` module, which holds P02 `TranscriptSegment`). Do **not** place policy in `transcript/` — name collision risk with transcript run types.

### 2.2 Exact TypeScript type (copy verbatim)

```ts
// packages/domain/src/transcription/policy.ts
export type TranscriptionPolicyV1 = {
  version: 1;
  language: 'vi' | 'en';
  live: 'off' | 'cloud';
  final: 'none' | 'local' | 'cloud' | 'local_cloud_check';
  cloudCheckScope: 'off' | 'uncertain_ranges' | 'full';
  cloudConsent: 'not_required' | 'required' | 'granted';
};
```

### 2.3 Default policy (spec §2 lines 42-51)

```ts
export const DEFAULT_TRANSCRIPTION_POLICY: TranscriptionPolicyV1 = {
  version: 1,
  language: 'vi',
  live: 'off',
  final: 'local',
  cloudCheckScope: 'off',
  cloudConsent: 'not_required',
};
```

The default `cloudConsent` is `'not_required'` because no cloud path is selected (consistent with spec §3 invariant: a non-off cloud path is what _requires_ consent). `language` defaults to `'vi'` per the spec default object; new drafts still force explicit per-meeting language reconfirmation in the reducer (§3 of this map), so the default is only the initial draft seed.

### 2.4 Legacy `speechMode` mapping (spec §3 lines 95-101)

Legacy `SpeechMode` is P02 (`api | local`, `packages/domain/src/meeting/schemas.ts:29`). Migration is one-way and **never grants cloud consent** (spec §3 line 101: "not used to silently infer cloud consent"):

```ts
import type { SpeechMode } from '../meeting/schemas.js';
import type { MeetingLanguage } from '../meeting/schemas.js';

export function policyFromLegacySpeechMode(
  speechMode: SpeechMode,
  language: MeetingLanguage,
): TranscriptionPolicyV1 {
  switch (speechMode) {
    case 'api': // legacy cloud path
      return {
        version: 1,
        language,
        live: 'off',
        final: 'cloud',
        cloudCheckScope: 'off',
        // legacy cannot grant consent -> require fresh explicit consent
        cloudConsent: 'required',
      };
    case 'local': // legacy local path
      return {
        version: 1,
        language,
        live: 'off',
        final: 'local',
        cloudCheckScope: 'off',
        cloudConsent: 'not_required',
      };
  }
}
```

Note: `speechMode === 'api'` maps to `final: 'cloud'`, which selects a cloud path, so per the consent invariant (§2.5 rule 3) the migrated record must have `cloudConsent: 'required'` — never `'granted'`. This is the explicit "legacy speechMode cannot grant cloud consent" rule.

### 2.5 Zod schema with `.refine()` invariants (copy verbatim)

```ts
import { z } from 'zod';

export const TranscriptionPolicyV1Schema = z
  .object({
    version: z.literal(1),
    language: z.enum(['vi', 'en']),
    live: z.enum(['off', 'cloud']),
    final: z.enum(['none', 'local', 'cloud', 'local_cloud_check']),
    cloudCheckScope: z.enum(['off', 'uncertain_ranges', 'full']),
    cloudConsent: z.enum(['not_required', 'required', 'granted']),
  })
  .strict()
  // Rule 1: final !== 'local_cloud_check' requires cloudCheckScope === 'off'
  .refine(
    (p) =>
      p.final !== 'local_cloud_check' || p.cloudCheckScope !== 'off'
        ? true
        : p.final !== 'local_cloud_check',
    // (re-stated positively below for clarity)
    { message: 'cloudCheckScope must be "off" when final is not "local_cloud_check"' },
  )
  .refine(
    (p) =>
      p.final === 'local_cloud_check' ? p.cloudCheckScope !== 'off' : p.cloudCheckScope === 'off',
    {
      message:
        'final "local_cloud_check" requires cloudCheckScope "uncertain_ranges" or "full"; any other final requires cloudCheckScope "off"',
    },
  )
  // Rule 3: any cloud path requires cloudConsent to be at least 'required' (i.e. not 'not_required')
  .refine(
    (p) =>
      p.live === 'cloud' || p.final === 'cloud' || p.cloudCheckScope !== 'off'
        ? p.cloudConsent !== 'not_required'
        : true,
    {
      message:
        'any cloud path (live=cloud, final=cloud, or cloudCheckScope!=off) requires cloudConsent "required" or "granted"',
    },
  );
```

The first two `.refine()` calls encode **Rule 1 + Rule 2** together (they are the contrapositive pair from spec §3 lines 81-83):

- `final !== 'local_cloud_check'` ⇒ `cloudCheckScope === 'off'`
- `final === 'local_cloud_check'` ⇒ `cloudCheckScope ∈ {'uncertain_ranges','full'}`

The third `.refine()` encodes **Rule 3** (spec §3 lines 84-86): `live === 'cloud'` OR `final === 'cloud'` OR `cloudCheckScope !== 'off'` ⇒ `cloudConsent !== 'not_required'` (i.e. consent must be `'required'` or `'granted'`).

**Rule 4** (legacy cannot grant consent) is **not** a property of the schema itself — it is enforced by `policyFromLegacySpeechMode` (§2.4) which always emits `cloudConsent: 'required'` (never `'granted'`) for the legacy `api` row. A table-test must assert: for every legacy row, if the mapped policy has any cloud path, `cloudConsent === 'required'`, never `'granted'`.

Implementer note: the schema as written has overlapping refines for readability; collapsing to the single contrapositive pair is acceptable as long as every table-test row passes and branch coverage of `@kms/domain` stays at 100%.

---

## 3. Start-flow reducer state machine (T03)

Lives in `apps/mobile/src/features/meeting-setup/reducer/` (e.g. `start-flow-reducer.ts`). **This is a PURE reducer** — no React import, no I/O, no storage, no async. It must be importable and table-testable in a plain `.test.ts` under node.

### 3.1 Ordered step enum (packet outcome line 14; PRD FR-1 line 83)

```ts
export type StartFlowStep =
  'title' | 'language' | 'mode' | 'source' | 'processing' | 'readiness' | 'consent' | 'start';
```

Order is fixed: `title → language → mode → source → processing → readiness → consent → start`. The reducer never reorders; `forward` advances exactly one step and is rejected if the current step is not valid.

### 3.2 State type

```ts
import type { TranscriptionPolicyV1 } from '@kms/domain';
import type { MeetingLanguage, MeetingMode, AudioSource } from '@kms/domain';
import type { ReadinessResult } from '../readiness/types.js';
import type { CloudConsentRecord } from '../consent/types.js';

export interface StartFlowSuggestions {
  // Non-sensitive only. Suggested values may prefill but never auto-advance
  // or satisfy a required explicit confirmation (spec: language must be reconfirmed).
  title?: string; // last-used or generated title hint; user may discard
  mode?: MeetingMode;
  source?: Array<'mic' | 'system'>;
  // NOTE: language is intentionally NOT suggested-into-the-answer; the UI may
  // show a hint but the reducer requires an explicit setField('language', ...) each meeting.
}

export interface StartFlowDraft {
  title: string; // min 1, max 500 (matches MeetingSettings.title)
  language: MeetingLanguage | null; // null until explicitly confirmed this meeting
  mode: MeetingMode | null;
  captureSources: Array<'mic' | 'system'>; // P02 allows mic|system; min 1, no duplicates
  policy: TranscriptionPolicyV1;
}

export interface StartFlowState {
  currentStep: StartFlowStep;
  draft: StartFlowDraft;
  suggestions: StartFlowSuggestions;
  readiness: ReadinessResult | null; // injected from ReadinessPort (T04); null until run
  consent: CloudConsentRecord[]; // accumulated consent records (T05)
  // Internal flag: languageConfirmedThisMeeting. Even if a suggestion hint is shown,
  // the reducer only clears this when an explicit setField('language') is dispatched.
  languageConfirmedThisMeeting: boolean;
}
```

### 3.3 Action union

```ts
export type StartFlowAction =
  | { type: 'forward' }
  | { type: 'back' }
  | { type: 'edit'; step: StartFlowStep } // jump back to an earlier step to edit
  | { type: 'setField'; field: 'title' | 'language' | 'mode'; value: string }
  | { type: 'setSources'; sources: Array<'mic' | 'system'> }
  | { type: 'setPolicy'; policy: Partial<TranscriptionPolicyV1> } // live/final/check/consent edits
  | { type: 'setReadiness'; readiness: ReadinessResult }
  | { type: 'grantConsent'; record: CloudConsentRecord }
  | { type: 'reset' } // clear to initial draft + step 'title'
  | { type: 'restore'; persisted: unknown }; // validate then load; corrupt => reset
```

`setPolicy` applies a partial patch onto `draft.policy` and then re-runs `TranscriptionPolicyV1Schema` validation. If the patch would create an invariant violation (e.g. set `final: 'local'` while leaving `cloudCheckScope: 'uncertain_ranges'`), the reducer either normalizes the dependent field (`cloudCheckScope → 'off'`) or rejects the action — implementer picks one and table-tests every transition. Recommendation: **normalize dependents** (set `cloudCheckScope='off'` whenever `final` leaves `local_cloud_check`; reset `cloudConsent` toward `'required'` whenever a cloud path is newly selected) so the UI can never present an invalid policy.

### 3.4 Invariants (each must have a table-test row)

1. **No skip without valid input for the current step.** `forward` from `title` requires `draft.title` length 1-500; from `language` requires `languageConfirmedThisMeeting === true`; from `mode` requires `mode !== null`; from `source` requires ≥1 non-duplicate source; from `processing` requires `TranscriptionPolicyV1Schema.parse(draft.policy)` to pass; from `readiness` requires `readiness.blocking.length === 0`; from `consent` requires every cloud path in `policy` to have a matching granted `CloudConsentRecord`.
2. **Language is explicitly reconfirmed every meeting.** Even if `suggestions` contained a previous language, the initial state has `languageConfirmedThisMeeting: false` and `draft.language: null`. A `restore` that would pre-set `languageConfirmedThisMeeting: true` is treated as corrupt → `reset`. (PRD FR-1 line 90; packet outcome line 14.)
3. **`meeting_only` emits no translation request; `meeting_translate` derives target only.** The reducer does not store a translation target; the command builder (§6) calls `deriveTranslationTarget(language)` (P02, `packages/domain/src/meeting/schemas.ts:34`) only when `mode === 'meeting_translate'`. For `meeting_only`, no translation field is present on the command.
4. **Corrupt/invalid draft resets safely.** `restore` runs `MeetingSettingsSchema`-shaped validation on non-sensitive fields and `TranscriptionPolicyV1Schema` on policy; any parse failure, schema mismatch, or `languageConfirmedThisMeeting: true` in the persisted blob dispatches `reset` and returns the initial state. No throw escapes the reducer.
5. **No deep-link bypass of required steps.** The reducer exposes no action that sets `currentStep` to an arbitrary value. `edit` may only move to a step ≤ the furthest valid step reached; it cannot jump forward past an invalid step. Deep-link handlers in the shell (§7) must dispatch only the documented actions, never mutate `currentStep` directly.

---

## 4. Readiness model (T04)

Lives in `apps/mobile/src/features/meeting-setup/readiness/` (e.g. `types.ts`, `ports.ts`, `fakes.ts`).

### 4.1 Blocking vs non-blocking (packet contracts lines 46; failure matrix lines 96-105; spec §8 lines 286-295)

**BLOCKING — Start impossible:**

- microphone permission (denied/restricted)
- audio source valid (≥1 permitted source actually usable on this platform; mobile = mic only per PRD FR-1 line 88)
- storage (free bytes below threshold required to record)

**NON-BLOCKING / DELAYED-PROCESSING — Start allowed, truthful waiting state:**

- API network reachable (KMS API)
- named cloud provider available (only relevant when policy selects a cloud path)
- authorized desktop present (for mobile-originated local final → `waiting_for_desktop`)
- verified local model available (→ `waiting_for_model`)
- translation capability (only relevant when `mode === 'meeting_translate'`)

### 4.2 `ReadinessPort` interface and result union

```ts
// apps/mobile/src/features/meeting-setup/readiness/types.ts
export type BlockingIssueCategory =
  'microphone_permission' | 'audio_source_invalid' | 'storage_insufficient';

export type DelayedWarningCategory =
  | 'api_network_unreachable'
  | 'cloud_provider_unavailable'
  | 'desktop_absent' // waiting_for_desktop
  | 'local_model_unavailable' // waiting_for_model
  | 'translation_unavailable';

export interface BlockingIssue {
  category: BlockingIssueCategory;
  // Content-free, safe operational detail only (SECURITY_AND_PRIVACY §Transcription locality).
  // e.g. required bytes for storage, OS remediation step id for permission. Never meeting content.
  detail?: string;
  remediationKey: string; // i18n key for the localized remediation copy
}

export interface DelayedWarning {
  category: DelayedWarningCategory;
  waitingStateLabel:
    'waiting_for_desktop' | 'waiting_for_model' | 'provider_unavailable' | 'offline';
  detail?: string;
}

export interface ReadinessResult {
  blocking: BlockingIssue[]; // empty => Start is permitted (modulo consent)
  delayed: DelayedWarning[]; // empty => no waiting states; non-empty => truthful warnings only
  checkedAt: number; // monotonic-ish timestamp; used to discard stale results (race test)
  sequence: number; // increment per check; older sequence results are ignored
}

export interface ReadinessInput {
  policy: import('@kms/domain').TranscriptionPolicyV1;
  mode: import('@kms/domain').MeetingMode | null;
  captureSources: Array<'mic' | 'system'>;
}

export interface ReadinessPort {
  check(input: ReadinessInput): Promise<ReadinessResult>;
  cancel(): Promise<void>; // in-flight checks for stale inputs are cancelled (race test)
}
```

### 4.3 Critical invariant (spec §3 lines 87-91; §8 lines 288-289; packet line 46)

> **Missing desktop / model / provider NEVER changes `policy` to cloud and NEVER prevents safe local capture.**

This is enforced structurally: desktop/model/provider/cloud-provider map exclusively to `DelayedWarningCategory` (non-blocking). The reducer (§3) permits `forward` past `readiness` when `blocking.length === 0`, regardless of how many `delayed` warnings exist. There is **no** code path in T04/T05 that mutates `policy.final` in response to a readiness result. A test must assert: given `{ desktop_absent, local_model_unavailable }` and a `final: 'local'` policy, the result has `blocking: []` and the policy passed to the command is unchanged.

### 4.4 Fake adapters

Each port has a fake in `fakes.ts` with injectable state, mirroring the P07 reference-fake pattern (`FakeFileSystem`, `FakeClock`, etc. in `packages/local-recovery/src/adapters/`). Fakes:

- `FakeMicrophoneReadiness({ permission: 'granted' | 'denied' | 'restricted' })`
- `FakeStorageReadiness({ freeBytes: number })`
- `FakeSourceReadiness({ available: Array<'mic' | 'system'> })`
- `FakeApiNetworkReadiness({ reachable: boolean })`
- `FakeCloudProviderReadiness({ providerAvailable: boolean })`
- `FakeDesktopReadiness({ authorized: boolean })`
- `FakeLocalModelReadiness({ verified: boolean })`
- `FakeTranslationReadiness({ capable: boolean })`

A `createFakeReadinessPort(parts)` composer returns a `ReadinessPort` that aggregates the parts into one `ReadinessResult`. Fakes must be synchronous-deterministic where possible; network/desktop/model fakes may accept a `delayMs` and an incrementing `sequence` to exercise the stale-result race test.

---

## 5. Consent model (T05)

Lives in `apps/mobile/src/features/meeting-setup/consent/` (e.g. `types.ts`, `consent.ts`).

### 5.1 `CloudConsentRecord` (packet line 48; spec §7 lines 277-282; SECURITY_AND_PRIVACY §Transcription locality lines 77-78)

```ts
// apps/mobile/src/features/meeting-setup/consent/types.ts
export type CloudConsentScope = 'live' | 'final' | 'cloud_check';
export type CloudCheckApproval = 'uncertain_ranges' | 'full';

export interface CloudConsentRecord {
  providerName: string; // exact named provider entity (PRIVACY-002 Accepted)
  providerRegion?: string; // disclosed processing region (PRIVACY-010 provisional)
  scope: CloudConsentScope; // which cloud use this consent covers
  cloudCheckApproval?: CloudCheckApproval; // present only when scope === 'cloud_check'
  copyVersion: string; // PRIVACY-001 BLOCKED => placeholder copy version constant
  policyVersion: 1; // TranscriptionPolicyV1.version at grant time
  grantedAt: string; // ISO datetime
}
```

### 5.2 Cross-purpose isolation rule (spec §7 lines 281-282; SECURITY_AND_PRIVACY line 78)

> **Consent for cloud speech never authorizes cloud minutes AI or auto-recording.**

Enforced by: (a) `CloudConsentScope` has no `'minutes_ai'` variant and no `'auto_record'` variant; (b) the command builder (§6) does not read consent records for any purpose other than validating the selected speech policy; (c) a test asserts that no `CloudConsentRecord` field can be interpreted as authorizing generative AI or auto-recording. Recording itself is authorized by the **separate** recording consent reminder (PRIVACY-011 Accepted), which is a pre-Start gate expressed in the reducer's `consent` step, not a `CloudConsentRecord`.

### 5.3 Reader-facing choice labels (spec §2 lines 53-60; PRD §8 line 167; USER_FLOWS §8 lines 109-119)

The UI must render **reader-facing labels**, never the internal `local`/`cloud`/`local_cloud_check` tokens. The exact labels (English source; vi catalog is a translated equivalent keyed identically):

| Policy value                      | Reader-facing label (en)                                       |
| --------------------------------- | -------------------------------------------------------------- |
| `final: 'none'` (+ `live: 'off'`) | Record only                                                    |
| `live: 'cloud'`                   | Show live transcript using cloud                               |
| `final: 'local'`                  | Create transcript on this computer after the meeting           |
| `final: 'cloud'`                  | Create transcript with cloud after the meeting                 |
| `final: 'local_cloud_check'`      | Create locally, then check approved difficult parts with cloud |

These five labels are i18n keys (§7). Consent UI renders the **exact provider disclosure, approved scope, and copy/policy version** at grant time — i.e. `providerName`, `providerRegion`, `scope` (and `cloudCheckApproval` if applicable), `copyVersion`, and `policyVersion` are all surfaced to the reader before the affirmative action. Consent is never auto-granted (PRIVACY-011 line 26: "requires explicit affirmative action (button press, not mere navigation)").

### 5.4 Consent copy handling (PRIVACY-001 BLOCKED)

Consent copy text is **BLOCKED** until Product + Legal provide it. T05 must use a **single versioned placeholder constant** (e.g. `CONSENT_COPY_VERSION = 'v0.1-placeholder'` and a `CONSENT_PLACEHOLDER_COPY` string sourced from the i18n catalog) so that when real copy lands it is swapped in one place and the version bumps. The `CloudConsentRecord.copyVersion` always stores this constant; it must never be empty. See §9 risk (c).

---

## 6. Capture-start command (T05)

Lives in `apps/mobile/src/features/meeting-setup/command/` (e.g. `command.ts`, `capture-starter.ts`).

### 6.1 `StartMeetingCommand` (packet A02 lines 118; spec §3; P02 `MeetingSettings`)

```ts
// apps/mobile/src/features/meeting-setup/command/types.ts
import type { MeetingSettings, TranscriptionPolicyV1, MeetingLanguage } from '@kms/domain';

export interface StartMeetingCommand {
  // P02 MeetingSettings, validated by MeetingSettingsSchema.parse(...)
  settings: MeetingSettings;
  // P08 additive policy, validated by TranscriptionPolicyV1Schema.parse(...)
  policy: TranscriptionPolicyV1;
  // Idempotency: stable key so a double-tap or replay does not start twice
  // (SECURITY_AND_PRIVACY §Threat model "Replay/duplicate requests").
  idempotencyKey: string;
  // meeting_only => no translation field present on the command at all.
  // meeting_translate => translationTarget is derived via deriveTranslationTarget(language).
  translationTarget?: MeetingLanguage;
}
```

Construction rules (each is a test):

1. `MeetingSettingsSchema.parse(command.settings)` passes (P02 contract, including `title` 1-500, `captureSources` ≥1 unique mic|system, `speechMode` present).
2. `TranscriptionPolicyV1Schema.parse(command.policy)` passes (§2.5).
3. `idempotencyKey` is non-empty and deterministic for the same draft+policy+consent tuple (so a double-tap produces the same key and the starter de-duplicates).
4. If `settings.mode === 'meeting_only'`, the command has **no** `translationTarget` field (it must not be present, not merely undefined). If `settings.mode === 'meeting_translate'`, `translationTarget === deriveTranslationTarget(settings.language)`.
5. `settings.language === policy.language` (the two must agree; the reducer enforces this but the command builder re-validates).

### 6.2 Fake `CaptureStarter` (P09 extension seam; packet Extension seams line 37; Conversation boundary line 133)

```ts
// apps/mobile/src/features/meeting-setup/command/capture-starter.ts
export interface StartInput {
  command: StartMeetingCommand;
}

export interface StartOutput {
  started: boolean; // fake always returns true (or controlled by test state)
  // No real audio, no provider call, no upload. Content-free.
}

export interface CaptureStarter {
  start(input: StartInput): Promise<StartOutput>;
}

export function createFakeCaptureStarter(options: { started?: boolean } = {}): CaptureStarter {
  return {
    async start() {
      return { started: options.started ?? true };
    },
  };
}
```

**Start calls `CaptureStarter.start(...)` ONLY AFTER:**

1. the reducer is at step `start` (i.e. every prior step validated), AND
2. `readiness.blocking.length === 0` was re-checked immediately before the call (stale-result guard, packet failure matrix line 102), AND
3. every cloud path selected by `policy` has a granted `CloudConsentRecord` matching its scope.

The fake is the **only** starter in P08. Real audio capture, provider calls, upload, and translation execution are forbidden (packet Conversation boundary; acceptance A05).

---

## 7. i18n + theme + shell (T01)

### 7.1 i18n — `apps/mobile/src/i18n/`

- `vi.ts` and `en.ts` are **exhaustive catalogs** with identical key sets. Every UI string used anywhere in `apps/mobile/src/` has a key, and every key exists in **both** files. This includes: all 5 reader-facing choice labels (§5.3), every readiness remediation label and waiting-state label (§4.2 `remediationKey`, `waitingStateLabel`), all consent copy (§5.4 placeholder), and all shell/auth strings.
- A **catalog parity test** (`i18n/parity.test.ts`) fails the suite if any key is present in one catalog but missing in the other, or if any code-referenced key is absent from both. This is the "missing-key failure" behavior: build/test fails on missing key. No silent fallback to the other language at runtime for a missing key — but the **runtime fallback policy** for an unknown key at render time is to render the key itself (visible, not crash) and emit a parity-test-detectable reference; the parity test is the gate.
- **UI locale is independent of meeting language** (packet line 47; PRD §6 line 148). The UI locale selector writes to one store; `MeetingLanguage` is part of `StartFlowDraft` and is per-meeting. A test asserts that selecting UI locale `en` while meeting `language === 'vi'` renders the en catalog and produces a `vi` meeting.

### 7.2 theme — `apps/mobile/src/theme/`

- Design tokens: color (WCAG AA contrast minimums per PRD §6 line 147), spacing, typography scale, focus rings, touch-target size ≥ 44pt (packet T01 "visible focus/touch sizes"; accessibility matrix in A04).
- Accessible primitives (buttons, focusable rows, labeled controls) consume tokens; raw hex values are forbidden outside `theme/` (a lint/test can assert this).

### 7.3 shell — `apps/mobile/src/app/`

- Providers (auth session, i18n locale, theme), authenticated routes (login → app), error boundary (never a silent white screen), safe deep-link policy.
- **Safe deep-link policy:** deep links may only open the app to a top-level surface or dispatch a documented `StartFlowAction`. They must never set `currentStep` directly or bypass a required step (reducer invariant §3.4 rule 5). The OAuth callback deep link is the one allowed entry during auth and is consumed by the P04 `ClientAuth.completeLogin` (T02).
- `App.tsx` migrates to render the shell root; the existing `src/app.test.ts` smoke checks (file existence of `App.tsx` and `vitest.config.ts`) remain green.

---

## 8. Test strategy and environment

Current state (`apps/mobile/vitest.config.ts`):

- `include: ['src/**/*.test.ts']` — **only `.test.ts`, no `.tsx`**. So React Native component render tests cannot run today.
- `coverage` includes `src/**/*.ts`, excludes tests and `src/index.ts`. Thresholds are 0 (P08 may raise these but the packet does not mandate a number; leave thresholds to the implementer unless the gate requires).
- No `environment` set — vitest defaults to `node`.
- `apps/mobile/package.json` has `react@19.1.0`, `react-native@0.81.4`, Expo ~54.0.0; **`react-test-renderer` is NOT installed** (`devDependencies` has only `@types/react` and `typescript`).

### 8.1 Recommendation

- **Pure logic as `.ts` / `.test.ts` (node env, fast):** the `TranscriptionPolicyV1` schema/mapping (in `@kms/domain`), the start-flow reducer, readiness types/fakes logic, consent logic, command builder, and the i18n catalog parity check. These are the majority of P08 logic and need no React.
- **Thin component render tests as `.test.tsx` (node env, react-test-renderer):** shell renders without crashing, auth callback screen calls `completeLogin`, setup screens dispatch the right reducer actions, consent UI shows provider/scope/version. Keep these thin — assert behavior, not style.
- **Add** `react-test-renderer@19.1.0` (must match React `19.1.0` exactly — see risk (a)) and `@types/react-test-renderer` to `apps/mobile/devDependencies`.
- **Update** `apps/mobile/vitest.config.ts`:
  - `include: ['src/**/*.test.ts', 'src/**/*.test.tsx']`
  - `environment: 'node'` (explicit; `react-test-renderer` works in node — it does not need jsdom).
- The `@kms/domain` TranscriptionPolicyV1 tests run under the domain package's own vitest config (already at 100% branches per the domain gate). New branches added by `policy.ts` must keep that gate at 100%.

### 8.2 Test types mapped to tasks

| Task | Primary test type                              | Notable cases                                                                                                                              |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| T01  | `.test.tsx` render + `.test.ts` catalog parity | navigation between authed/unauthed; parity vi↔en; error boundary; deep-link refusal to bypass                                              |
| T02  | `.test.ts` + `.test.tsx`                       | loading/offline/expired/revoked; callback replay (`completeLogin` throws); cancel; localized errors; recovery-manifest preserved on logout |
| T03  | `.test.ts` pure table tests                    | every (state,event) pair; all policy invariant rows; legacy rows without consent; corrupt draft → reset; no skip; language reconfirmation  |
| T04  | `.test.ts` port/fake logic                     | denial; low disk; offline; provider/desktop/model unavailable; **no auto-fallback**; stale-result race; cancel                             |
| T05  | `.test.ts` + `.test.tsx`                       | double-tap idempotency; stale permission; unconsented cloud blocked; meeting-only no translation; local default; command snapshot          |
| T06  | `.test.tsx` + Maestro (device)                 | every policy/readiness branch; orientation; 200% font; contrast/focus/touch; VoiceOver/TalkBack; vi/en UI × vi/en meeting                  |

---

## 9. Sequencing and risks

### 9.1 Task order (confirmed): T01 → T02 → T03 → T04 → T05 → T06

Dependency reasons:

- **T01 first:** defines `app/`, `i18n/`, `theme/` skeletons and the vitest/tsconfig changes that every later task's tests depend on. Auth and setup features import from i18n and theme.
- **T02 after T01:** the auth feature UI needs the shell, theme, and i18n. T02 also depends on P04 (VERIFIED capability).
- **T03 after T01,T02 (and P07):** T03 lands the `TranscriptionPolicyV1` contract in `@kms/domain` (consumed by T04/T05 and by the reducer) and the pure reducer. The reducer references `ReadinessResult`/`CloudConsentRecord` types, so T03 may stub those types and T04/T05 fill them — or T03 owns the type imports from T04/T05 modules (recommend T03 imports the types and T04/T05 implement them; the types are fixed in this map so there is no circular risk).
- **T04 after T03:** readiness depends on `TranscriptionPolicyV1` to decide which warnings are relevant (e.g. cloud-provider warning only if a cloud path is selected).
- **T05 after T03,T04:** the command needs the validated policy and the non-blocking readiness result; consent needs the policy's cloud path.
- **T06 last:** independent QA over all branches; needs devices/Maestro for the a11y matrix.

### 9.2 Top risks

(a) **`react-test-renderer` version must match React exactly.** React is `19.1.0` (`apps/mobile/package.json:14`). Install `react-test-renderer@19.1.0` (and matching `@types`). A mismatch causes "Hooks not defined" / render crashes that are easy to misattribute to reducer logic. Verify with a trivial render test before writing component suites.

(b) **`TranscriptionPolicyV1` must be additive and must not break `@kms/domain` 100% branch coverage.** The new `policy.ts` adds branches (every `.refine()` arm, the `switch` in `policyFromLegacySpeechMode`). The domain gate is 100% branches; every branch must be exercised by table tests, including the contrapositive refine arms and both `api`/`local` legacy cases. The re-export line in `index.ts` is non-branching.

(c) **Consent copy is BLOCKED (PRIVACY-001).** Do not invent final consent text. Use a single versioned placeholder constant (e.g. `CONSENT_COPY_VERSION = 'v0.1-placeholder'`) referenced by every `CloudConsentRecord.copyVersion`, so the eventual Product+Legal copy swap is one localized edit + a version bump. Provider disclosure copy (PRIVACY-002 Accepted) and the consent-reminder mechanism (PRIVACY-011 Accepted) **are** permitted and required.

(d) **No real audio/provider behavior.** Only the fake `CaptureStarter` (§6.2). Real capture, upload, speech, translation, provider, and model execution are forbidden (packet Conversation boundary; A05). Readiness fakes simulate desktop/model/provider absence but the policy is never mutated in response (§4.3).

(e) **Stale-result race.** Readiness is async; a faster late check must override a slower earlier one, and Start must re-check immediately before invoking the starter (packet failure matrix "Stale async readiness"). The `sequence`/`checkedAt` fields (§4.2) and `ReadinessPort.cancel()` exist for this; a dedicated race test is required.

---

## 10. Acceptance gate mapping

| Gate                                                                                                                                    | Evidence produced by                                                | Test types                                                       | Notes                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P08-A01** Start impossible without explicit valid title/language/mode/source/permission/storage + required cloud consent              | T03 (reducer no-skip), T04 (blocking readiness), T05 (consent gate) | `.test.ts` table tests, `.test.tsx` Start-button-disabled states | Reducer invariant §3.4 rules 1,2 + readiness `blocking` + consent matching.                                                                                                                                                                                   |
| **P08-A02** Command validates P02 + `TranscriptionPolicyV1`, defaults to local final, idempotent, meeting-only no translation           | T03 (default policy), T05 (command builder)                         | `.test.ts` snapshot/property tests                               | §2.3 default `final:'local'`; §6.1 construction rules 1-5; `idempotencyKey`.                                                                                                                                                                                  |
| **P08-A03** Auth/readiness/offline/desktop/model/provider states truthful, localized, recoverable, content-free, no auto cloud fallback | T02 (auth states), T04 (readiness states)                           | `.test.ts` + `.test.tsx`                                         | §4.3 no-fallback invariant; all warnings are `delayed`, never `blocking`; copy from i18n; no content in `detail`.                                                                                                                                             |
| **P08-A04** vi/en UI, large text, VoiceOver/TalkBack, focus, contrast pass supported-device matrix                                      | T06                                                                 | `.test.tsx` (CI-grade) **+ Maestro/physical device**             | **REQUIRES physical Android/iOS devices with VoiceOver/TalkBack.** Devices are MISSING (RUN record preflight). Expected terminal state: **IMPLEMENTED**, not VERIFIED. CI-grade catalog/contrast/focus/touch tests run now; the device matrix gates VERIFIED. |
| **P08-A05** No audio capture/provider behavior beyond fake starter                                                                      | T05 (fake `CaptureStarter` only), T06 (scan)                        | `.test.ts` + bundle/secret scan                                  | §6.2 fake only; grep/scan assert no real capture/provider imports in `apps/mobile/src/features/meeting-setup/`.                                                                                                                                               |

**Expected phase terminal state:** **IMPLEMENTED.** A01, A02, A03, A05 can be fully evidenced by CI-grade unit/component/catalog/contract tests. **A04's device/a11y matrix requires physical devices that are not available** (RUN-20260725-0000 preflight), so A04 cannot reach device evidence in this run; VERIFIED is gated on devices. This matches the packet's precondition that "physical-device permission/keychain/a11y evidence is required for `VERIFIED`."
