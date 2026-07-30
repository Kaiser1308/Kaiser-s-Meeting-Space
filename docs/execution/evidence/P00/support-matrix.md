# Support, Language, and UX Platform Matrix — P00-T02

**Created:** 2026-07-21
**Phase:** P00 (Design closure and repository baseline)
**Task:** P00-T02 — Accept support, language, and UX platform matrix
**Source documents reconciled:** PRD.md, USER_FLOWS.md, ROADMAP.md, TECH_STACK.md, SYSTEM_ARCHITECTURE.md, ADR-004, ADR-006, Locked engineering defaults
**Owner:** Product and Engineering

---

## 1. Platform Support Matrix

### 1.1 Personal Release (alpha)

| Platform    | OS Minimum Version    | Hardware Class                                                | Application Test Class                        | Status           |
| ----------- | --------------------- | ------------------------------------------------------------- | --------------------------------------------- | ---------------- |
| **Windows** | Windows 11 23H2+ x64  | x64 processor, 8 GB RAM, built-in or USB/Bluetooth microphone | Desktop E2E (Playwright), manual device tests | Confirmed target |
| **Android** | Android 12+ (API 31+) | Phone with microphone, 4 GB RAM recommended                   | Mobile E2E (Maestro), manual device tests     | Confirmed target |
| **iOS**     | iOS 17+               | iPhone with microphone, 4 GB RAM recommended                  | Mobile E2E (Maestro), manual device tests     | Confirmed target |

**Notes:**

- Windows 11 23H2 is the minimum; earlier Windows 11 releases and all Windows 10 versions are not supported for alpha.
- Android 12 (API 31) matches Expo SDK 54 minimum requirements.
- iOS 17 matches Expo SDK 54 minimum requirements.
- ARM64 Windows (Surface Pro X, etc.) is not an alpha target but should not be precluded.
- macOS is explicitly excluded from personal alpha (see Section 1.3).

### 1.2 Hardware Classes — Detail

| Class          | Examples                        | Alpha support | Notes                                                    |
| -------------- | ------------------------------- | ------------- | -------------------------------------------------------- |
| Desktop x64    | Standard Windows laptop/desktop | Full          | WASAPI microphone + system audio via Rust native runtime |
| Android phone  | Pixel 6+, Samsung Galaxy S22+   | Full          | Microphone capture via Expo AV                           |
| iPhone         | iPhone 13+                      | Full          | Microphone capture via Expo AV                           |
| Android tablet | Samsung Tab S8+                 | Unverified    | Should work but not in alpha test matrix                 |
| iPad (iPadOS)  | iPad Air/Pro                    | Not alpha     | iOS variant; iPadOS 17 not tested for alpha              |
| ARM Windows    | Surface Pro X                   | Not alpha     | Requires separate WASAPI ARM64 testing                   |
| Linux desktop  | Any distribution                | Not alpha     | No documented support                                    |

### 1.3 Post-Beta Platforms (Provisional)

| Platform                | Target Release         | Owner                  | Review Trigger                                                                                         | Notes                                                                                                       |
| ----------------------- | ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| macOS (system audio)    | Post-beta (beta or GA) | Engineering / Platform | Working Windows capture proves architecture; macOS permission model differs significantly from Windows | Listed in ROADMAP post-beta candidates; ADR-006 allows Electron/Tauri re-evaluation after Windows prototype |
| macOS (microphone only) | Post-beta              | Engineering            | Conditional on system audio capture decisions                                                          | Microphone-only could ship earlier if system audio is the blocker                                           |
| Linux desktop           | Post-beta or v-next    | Product                | Community demand or corporate requirement                                                              | No current roadmap commitment                                                                               |
| iPad (iPadOS)           | Post-beta              | Engineering            | iOS alpha completion + tablet-specific UX                                                              | Shares iOS codebase; tablet form-factor UX not designed                                                     |

---

## 2. UI Locale and Language Support

### 2.1 UI Localization

| Locale          | Alpha support | Notes                                                         |
| --------------- | ------------- | ------------------------------------------------------------- |
| Vietnamese (vi) | Confirmed     | UI copy, labels, error messages                               |
| English (en)    | Confirmed     | UI copy, labels, error messages; also the development default |
| Other locales   | Not alpha     | No plan for additional locales in personal alpha              |

**Localization approach:**

- UI copy supports Vietnamese and English independently of the meeting language (PRD NFR-8).
- Implementation phased in P08 (mobile start flow) and P24 (resilience/performance/a11y).
- i18n framework choice deferred to P08 implementation.

### 2.2 Meeting Languages

| Language                                  | Alpha support        | Source                                               |
| ----------------------------------------- | -------------------- | ---------------------------------------------------- |
| Vietnamese (vi)                           | Confirmed            | ADR-004, locked engineering defaults                 |
| English (en)                              | Confirmed            | ADR-004, locked engineering defaults                 |
| Mixed-language (vi+en within one meeting) | **Excluded from v1** | ADR-004; deferred until benchmarks prove reliability |

**Rules (from PRD FR-1, ADR-004):**

- One language is selected before each meeting starts.
- The selected language is fixed for the duration of the meeting.
- Translation mode derives the target as the other supported language (vi -> en or en -> vi).
- Mixed-language mode is deferred; no detection or switching mid-meeting.
- The user must explicitly confirm language each time; latest choice may be suggested.

---

## 3. Meeting Modes

| Mode                       | Alpha support | Code enum value (current) | Design value          | Notes                                                  |
| -------------------------- | ------------- | ------------------------- | --------------------- | ------------------------------------------------------ |
| Meeting only (record)      | Confirmed     | `"record"`                | `"meeting_only"`      | **Naming inconsistency** — must be resolved during P02 |
| Meeting + live translation | Confirmed     | `"record_translate"`      | `"meeting_translate"` | **Naming inconsistency** — must be resolved during P02 |
| Monitor mode (listen only) | Not alpha     | N/A                       | N/A                   | Not in any requirement doc                             |

---

## 4. Capture Sources

| Source                         | Windows                       | Android                  | iOS                 | Notes                                                                     |
| ------------------------------ | ----------------------------- | ------------------------ | ------------------- | ------------------------------------------------------------------------- |
| Built-in microphone            | Confirmed (WASAPI via Rust)   | Confirmed (Expo AV)      | Confirmed (Expo AV) | Primary source for all platforms                                          |
| External USB microphone        | Confirmed (WASAPI)            | N/A (USB-OTG not tested) | N/A                 | Windows only for alpha                                                    |
| Bluetooth microphone           | Confirmed (with grace period) | N/A                      | N/A                 | Bluetooth disconnect/reconnect handling required (P12)                    |
| System audio (WASAPI loopback) | Confirmed                     | N/A                      | N/A                 | Windows only; captures Zoom/Meet/Teams output                             |
| System-audio + microphone mix  | Confirmed (separate tracks)   | N/A                      | N/A                 | Both sources captured independently; mix is derived (SYSTEM_ARCHITECTURE) |

**Background limitations:**

| Scenario                   | Behavior                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| App minimized (desktop)    | Recording continues; WASAPI capture via Rust runtime is independent of UI process                       |
| App in background (mobile) | Recording continues; iOS requires "audio" background mode; Android requires foreground service          |
| Lock screen (mobile)       | Recording continues (iOS background audio mode / Android foreground service)                            |
| App force-closed           | Recording stops; local chunks up to last fsync are preserved; recovery flow on next launch (see Flow 6) |
| Network loss               | Local recording continues; chunks queue for upload; persistent offline banner shown                     |
| Low storage                | Early warning; current chunk finalized before capture must stop                                         |
| Device sleep (Windows)     | Sleep/wake events monitored; gap recorded in timeline; recovery check on wake                           |
| Device sleep (mobile)      | OS manages sleep during recording (iOS background audio / Android partial wake lock)                    |

---

## 5. Permissions Required

### 5.1 Windows (Desktop)

| Permission           | Required for           | User-facing rationale                                                            | Runtime check     |
| -------------------- | ---------------------- | -------------------------------------------------------------------------------- | ----------------- |
| Microphone           | All recording          | "KMS needs microphone access to record meeting audio."                           | Yes, at start     |
| WASAPI system audio  | System-audio capture   | "KMS needs system audio access to capture computer audio from online meetings."  | Yes, at start     |
| Notifications        | Recovery/status alerts | "KMS will notify you when a recording is recovered or finalized."                | Yes, conditional  |
| Background execution | Capture continuity     | "KMS needs background execution to keep recording when the window is minimized." | Via Electron/Rust |

### 5.2 Android (Mobile)

| Permission                                                 | Required for                | User-facing rationale                                       | Runtime check |
| ---------------------------------------------------------- | --------------------------- | ----------------------------------------------------------- | ------------- |
| `RECORD_AUDIO`                                             | Microphone recording        | "KMS needs microphone access to record meeting audio."      | Yes, at start |
| `FOREGROUND_SERVICE`                                       | Background recording        | "KMS needs to run in the background to continue recording." | Yes, at start |
| `POST_NOTIFICATIONS` (Android 13+)                         | Recording indicator         | "KMS shows a persistent notification while recording."      | Yes, at start |
| `READ_EXTERNAL_STORAGE` / `READ_MEDIA_AUDIO` (Android 13+) | Optional audio import (P28) | Only if import feature enabled                              | Future        |

### 5.3 iOS (Mobile)

| Permission           | Required for             | User-facing rationale                                                                | Runtime check |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------ | ------------- |
| Microphone           | Microphone recording     | "KMS needs microphone access to record meeting audio."                               | Yes, at start |
| Background audio     | Background recording     | "KMS needs background mode to continue recording when the app is in the background." | Yes, at start |
| Local network access | Optional future features | Not alpha                                                                            | Future        |

---

## 6. Speech Processing

| Feature                    | Provider                                  | Alpha support   | Notes                                                       |
| -------------------------- | ----------------------------------------- | --------------- | ----------------------------------------------------------- |
| API realtime transcription | Deepgram                                  | Confirmed (P13) | Default speech provider                                     |
| Diarization                | Deepgram                                  | Confirmed (P13) | Alpha target; not fully offline guaranteed                  |
| Local file transcription   | whisper.cpp                               | Optional (P28)  | After API capture stabilizes                                |
| Translation (real-time)    | Provider adapter (Google/Azure/DeepL/LLM) | Confirmed (P15) | Replaceable adapter; preserves source transcript separately |

---

## 7. Speech Processing — Provisional Entries

| Entry                              | Owner                   | Review Trigger                                                                                 | Deadline          |
| ---------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| Deepgram as default provider       | AI Platform Engineering | Before P13 startup; confirm Deepgram API key exists and Vietnamese/English diarization quality | P13 gate          |
| Local Whisper (P28)                | AI Platform Engineering | After API transcription is stable and benchmark baseline exists                                | Optional P28 gate |
| Translation provider selection     | AI Platform Engineering | Before P15 implementation; evaluate cost, quality, latency                                     | P15 gate          |
| Provider fallback (cross-provider) | Product + Engineering   | Before external beta; requires explicit user policy and opt-in                                 | P27 gate          |

---

## 8. Post-Beta Platform Entries (Provisional)

| Platform                        | Owner       | Review Trigger                                                                                                          | Target Window                          |
| ------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| macOS system audio capture      | Engineering | Windows capture (P12) complete; macOS permission model evaluated                                                        | Post-beta                              |
| macOS microphone-only           | Engineering | Conditional on system audio; could ship earlier                                                                         | Subject to macOS system audio decision |
| Linux desktop                   | Product     | Community/customer demand evaluated                                                                                     | No commitment                          |
| iPad (iPadOS)                   | Engineering | iOS alpha complete; tablet UX designed                                                                                  | Post-beta                              |
| ARM64 Windows                   | Engineering | Customer demand or benchmark justification                                                                              | No commitment                          |
| Tauri migration (from Electron) | Engineering | After signed Rust capture prototype measures memory, package size, update complexity on supported Windows (per ADR-006) | Post-alpha evaluation                  |

---

## 9. Deployment and Infrastructure (Provisional)

| Decision          | Provisional Default                        | Owner                | Review Trigger                                                             | Deadline    |
| ----------------- | ------------------------------------------ | -------------------- | -------------------------------------------------------------------------- | ----------- |
| Deployment region | Singapore/APAC preferred                   | Platform Engineering | Confirm selected services support APAC region; disclose processing regions | Before beta |
| Object storage    | S3-compatible; MinIO dev, S3/R2 production | Platform Engineering | Before P05 implementation; cost and regional availability                  | P05 gate    |
| Database          | PostgreSQL (via Docker for dev)            | Platform Engineering | Before P03 implementation                                                  | P03 gate    |
| Queue             | Redis + BullMQ (via Docker for dev)        | Platform Engineering | Before P06 implementation                                                  | P06 gate    |
| Authentication    | OIDC/PKCE with short-lived tokens          | Platform Engineering | Before P04 implementation                                                  | P04 gate    |

---

## 10. Validation Against Release Requirements

| PRD Release Acceptance Criterion                                        | Matrix Coverage                                                    | Gap                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| RA-1: Critical flows pass on supported Windows, Android, iOS            | Covered — Windows 11 23H2+, Android 12+, iOS 17+                   | No explicit tablet support in alpha         |
| RA-2: 2-hour recording, network loss, crash recovery, low-storage tests | Covered — all platforms support local-first recording and recovery | Testing infrastructure not yet built (P01+) |
| RA-3: Source/derived boundaries and revision history                    | Covered — architecture and ADRs enforce immutability               | No runtime enforcement yet                  |
| RA-4: Citation validation                                               | Covered — evidence references required by all minutes schemas      | No validator yet (P17-P18)                  |
| RA-5: Secrets not in bundles/logs/API responses                         | Covered — provider credentials stay server-side                    | No scanning/verification yet                |
| RA-6: Backup/restore and permanent deletion                             | Not alpha                                                          | P22, P25                                    |
| RA-7: Known limitations and consent/privacy copy                        | Partially — consent reminder designed but not implemented          | P08, P22                                    |

---

## 11. Engineering Defaults Applied

These defaults from the P00 phase packet and locked engineering defaults are accepted as provisional until product/legal approval:

| Default                      | Value                                  | Provisional?                      | Owner                        | Review Trigger                                                           |
| ---------------------------- | -------------------------------------- | --------------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| Personal release OS minimums | Windows 11 23H2+, Android 12+, iOS 17+ | Yes (provisional)                 | Product                      | Before beta — confirm device telemetry/inventory supports these minimums |
| macOS system audio           | Post-beta                              | Yes (provisional)                 | Engineering                  | After P12 windows capture prototype                                      |
| UI locales                   | vi, en                                 | Yes (provisional)                 | Product                      | Confirm vi translation coverage before beta                              |
| Meeting languages            | vi, en (no mixed)                      | **Locked** — confirmed by ADR-004 | Engineering                  | N/A (not provisional)                                                    |
| Deployment preference        | Singapore/APAC                         | Yes (provisional)                 | Platform Engineering         | Before beta — confirm service regional availability                      |
| Soft delete window           | 30 days                                | Yes (provisional)                 | Product + Legal              | Before beta — legal review required                                      |
| Backup expiry                | 35 days after permanent deletion       | Yes (provisional)                 | Platform Engineering + Legal | Before beta — provider capability dependent                              |
| Cross-provider fallback      | Off by default                         | Yes (provisional)                 | Product + Security           | Before beta — requires explicit user policy                              |
| Provider allowlists          | Mandatory before beta                  | Yes (provisional)                 | Engineering + Security       | Before beta                                                              |
| Account budget/caps          | Mandatory before beta                  | Yes (provisional)                 | Product + Engineering        | Before beta                                                              |
| Separate mic/system tracks   | Locked (ADR-001, 002, 006)             | **Locked**                        | Engineering                  | N/A                                                                      |

---

## 12. Unresolved Naming Inconsistencies (Requiring P02 Resolution)

| Concept                  | Code (domain)              | Design docs (PRD/DATA_MODEL/USER_FLOWS)                                       | Desktop UI    | Recommended resolution                                          |
| ------------------------ | -------------------------- | ----------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| Meeting mode             | `"record"`                 | `"meeting_only"`                                                              | `"record"`    | Align on design: `meeting_only`                                 |
| Meeting + translate mode | `"record_translate"`       | `"meeting_translate"`                                                         | `"translate"` | Align on design: `meeting_translate`                            |
| Detail level             | `"verbatim" \| "detailed"` | PRD: `Detailed \| Executive Summary`; USER_FLOWS: `Detailed \| Near-verbatim` | N/A           | Resolve in P02 — recommend design's `detailed \| near_verbatim` |
| Meeting field name       | `primaryLanguage`          | `language`                                                                    | N/A           | Align with DATA_MODEL: `language`                               |
| Language value           | `"vi" \| "en" \| "mixed"`  | `vi \| en`                                                                    | N/A           | Remove `mixed` per ADR-004                                      |

---

## 13. Matrix Completeness Check

All required columns from P00-T02 spec are present:

- [x] Platform
- [x] OS minimum version
- [x] Hardware class
- [x] Application test class
- [x] UI locale support
- [x] Meeting languages
- [x] Meeting modes
- [x] Capture sources
- [x] Permissions required
- [x] Background limitations
- [x] Speech processing
- [x] Post-beta platforms
- [x] Owner (for every provisional entry)
- [x] Review trigger (for every provisional entry)

Every release matrix mentioned in later phases (ROADMAP Phase 3, Phase 7, PRD Release Acceptance) has a supported target in this matrix.
