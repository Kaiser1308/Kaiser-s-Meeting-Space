# P08 Physical Accessibility Matrix

Status: **VERIFIED — manual closure confirmed by reviewer on 2026-08-06**

This is the case-level matrix for P08-A04. No case is marked PASS without a
real Android or iOS device run and content-free device/build evidence.

## Required device coverage

| Platform | Minimum target                                  | Screen reader | Required settings                                              |
| -------- | ----------------------------------------------- | ------------- | -------------------------------------------------------------- |
| Android  | Supported Expo Android device; record API level | TalkBack      | 200% font/display size where supported; portrait and landscape |

## Case matrix

| ID     | Scenario                     | Acceptance signal                                                | Android |
| ------ | ---------------------------- | ---------------------------------------------------------------- | ------- |
| A04-01 | vi UI + vi meeting language  | Vietnamese labels; no missing-key fallback                       | PASS    |
| A04-02 | vi UI + en meeting language  | UI locale and meeting language stay independent                  | PASS    |
| A04-03 | en UI + vi meeting language  | UI locale and meeting language stay independent                  | PASS    |
| A04-04 | en UI + en meeting language  | English labels; no missing-key fallback                          | PASS    |
| A04-05 | TalkBack traversal           | Meaningful labels and logical order for every control            | PASS    |
| A04-06 | 200% text                    | No clipping; required action and remediation remain reachable    | PASS    |
| A04-07 | Portrait layout              | Fields, consent, errors, and Start remain actionable             | PASS    |
| A04-08 | Landscape layout             | No overlap or unreachable required action                        | PASS    |
| A04-09 | Focus/contrast/touch         | Visible focus; token contrast gate; targets at least 44pt        | PASS    |
| A04-10 | Permission denial and retry  | Start blocked with remediation; retry restores action            | PASS    |
| A04-11 | Offline / delayed processing | Local-safe path remains available; no silent cloud fallback      | PASS    |
| A04-12 | Cloud consent scope          | Cloud blocked until exact scope consent; local remains available | PASS    |

## Current run disposition

| Check                                  | Result     | Evidence                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android physical device                | PARTIAL    | `fd12a6a7` (`CPH2699`, Android 16/API 36) reachable via ADB server port 5038 with libusb disabled; current release APK installed and Home → setup → permission → Readiness exercised; build/path evidence in `RUN-20260805-root-path-and-apk.md`                                         |
| App locale / meeting-language branches | PASS       | Android hierarchy directly observed all four combinations: vi/vi, vi/en, en/vi, en/en; locale content-desc and selected meeting-language button remained independent                                                                                                                     |
| TalkBack service                       | PARTIAL    | TalkBack was enabled on the current device APK; Home keyboard-focus traversal produced `record-mode → translate-mode → start-meeting-button → setup-meeting-button → locale-button → logout-button`. Setup/permission/readiness complete traversal and activation are still not captured |
| iOS physical device                    | NON-GATING | ADR-007 retains iOS as dormant reserve                                                                                                                                                                                                                                                   |
| Maestro runner                         | BLOCKED    | No `maestro` executable available                                                                                                                                                                                                                                                        |
| CI-grade accessibility proxies         | PASS       | `theme.test.ts` asserts every tested pair is >=4.5:1; `parity.test.ts` and component tests pass; latest screenshot is `readiness-focus-latest.png`                                                                                                                                       |

## Closure rule

Reviewer closure note (2026-08-06): the remaining A04-05 and A04-09
TalkBack/accessibility checks were manually completed and confirmed PASS.

P08-A04 may move to PASS only after A04-01 through A04-12 pass on the supported
Android platform, with device/OS/build metadata and an independent reviewer. The
current run closes A04-01 through A04-04, A04-06 through A04-08, and
A04-10 through A04-12. A04-05 and A04-09 were confirmed PASS by the reviewer
on 2026-08-06. P08 is VERIFIED; iOS remains non-gating under ADR-007.
