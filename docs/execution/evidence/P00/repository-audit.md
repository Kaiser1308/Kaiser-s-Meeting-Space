# Repository Audit — P00-T01

**Created:** 2026-07-21
**Phase:** P00 (Design closure and repository baseline)
**Task:** P00-T01 — Inventory repository truth and contradictions
**Owner:** Main agent

---

## 1. Toolchain and Environment

| Attribute         | Value                         |
| ----------------- | ----------------------------- |
| OS                | Windows 11 Pro 10.0.26200     |
| Node.js           | v24.18.0                      |
| pnpm              | 10.14.0                       |
| Shell             | Git Bash (Windows)            |
| Repository status | New — zero commits            |
| Branch            | `master` (no baseline commit) |
| File state        | All files untracked           |

---

## 2. Git State

```
$ git status --short --branch
## No commits yet on master
?? .agents/
?? .claude/
?? .env.example
?? .gitignore
?? AGENTS.md
?? CHANGELOG.md
?? CONTRIBUTING.md
?? README.md
?? SECURITY.md
?? apps/
?? docs/
?? package.json
?? packages/
?? pnpm-lock.yaml
?? pnpm-workspace.yaml
?? skills-lock.json
?? tsconfig.base.json
```

- **Commits:** Zero. This is a brand-new repository with no baseline commit.
- **Branch:** `master` (no baseline; `main` is named as the default branch in some docs but `master` is the actual branch).
- **All files are untracked.** No staged or dirty files exist.
- **No `.gitattributes` file** exists (no line-ending or diff policy defined).

---

## 3. Full File Inventory

### 3.1 Root Governance Files

| File                  | Classification | Notes                                                                                 |
| --------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `README.md`           | Governance     | Project overview, principles, status, development setup. References `docs/STATUS.md`. |
| `AGENTS.md`           | Governance     | Agent execution rules for Claude Code workers.                                        |
| `CHANGELOG.md`        | Governance     | Keep a Changelog stub; no releases yet.                                               |
| `CONTRIBUTING.md`     | Governance     | Contribution guidelines.                                                              |
| `SECURITY.md`         | Governance     | Security policy and vulnerability reporting.                                          |
| `package.json`        | Config         | Root workspace config. Defines `typecheck`, `test`, and dev scripts.                  |
| `pnpm-workspace.yaml` | Config         | Workspace package layout: `apps/*`, `packages/*`.                                     |
| `tsconfig.base.json`  | Config         | Shared TypeScript configuration (ES2022, ESNext, Bundler).                            |
| `.env.example`        | Config         | Environment variable template for AI and speech providers.                            |
| `.gitignore`          | Config         | Ignores `node_modules/`, `.pnpm-store/`, `.env`, `dist/`, `.expo/`, etc.              |
| `pnpm-lock.yaml`      | Generated      | Lockfile; appears to have been generated (exists before first commit).                |
| `skills-lock.json`    | Config         | Claude Code skills lockfile.                                                          |

**Note:** `README.md` references `main` as the default branch, but the repository currently uses `master`.

### 3.2 Documentation — Product

| File                         | Classification | Status | Notes                                                                                                     |
| ---------------------------- | -------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `docs/product/PRD.md`        | Doc — Product  | Draft  | 7 FRs, NFRs, release acceptance criteria. Owner: Product.                                                 |
| `docs/product/USER_FLOWS.md` | Doc — Product  | Draft  | 7 flows covering start, live, end, review, minutes, recovery, destructive actions. Owner: Product Design. |
| `docs/ROADMAP.md`            | Doc — Product  | Draft  | 8 phases (P00-P27 plus optional P28). Owner: Product and Engineering.                                     |

### 3.3 Documentation — Architecture

| File                                           | Classification     | Status       | Notes                                                                                                           |
| ---------------------------------------------- | ------------------ | ------------ | --------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/SYSTEM_ARCHITECTURE.md`     | Doc — Architecture | Draft        | Components, flows, state machine, security boundaries, technology defaults. Owner: Engineering.                 |
| `docs/architecture/TECH_STACK.md`              | Doc — Architecture | **Accepted** | Technology choices, guardrails, replacement triggers. Owner: Engineering.                                       |
| `docs/architecture/DATA_MODEL.md`              | Doc — Architecture | Draft        | Entity map, core entities, data classes, deletion lifecycle, migration rules. Owner: Engineering.               |
| `docs/architecture/API_CONTRACTS.md`           | Doc — Architecture | Draft        | REST API contract, conventions, endpoints for alpha. Owner: Backend Engineering.                                |
| `docs/architecture/AI_AND_SPEECH_PROVIDERS.md` | Doc — Architecture | Draft        | Speech and generative contracts, routing policy, validation, prompt governance. Owner: AI Platform Engineering. |

### 3.4 Documentation — Decisions (ADRs)

| File                                                     | Classification | Status   | Notes                                                 |
| -------------------------------------------------------- | -------------- | -------- | ----------------------------------------------------- |
| `docs/decisions/ADR-001-local-first-recording.md`        | ADR            | Accepted | Local-first chunked recording.                        |
| `docs/decisions/ADR-002-source-evidence-immutability.md` | ADR            | Accepted | Immutable source evidence.                            |
| `docs/decisions/ADR-003-provider-neutral-ai.md`          | ADR            | Accepted | Provider-neutral AI adapters.                         |
| `docs/decisions/ADR-004-explicit-meeting-language.md`    | ADR            | Accepted | Explicit meeting language (vi or en, no mixed in v1). |
| `docs/decisions/ADR-005-modular-monolith.md`             | ADR            | Accepted | Modular monolith plus workers.                        |
| `docs/decisions/ADR-006-rust-native-runtime-boundary.md` | ADR            | Accepted | Rust native runtime for desktop audio/local AI.       |
| `docs/decisions/README.md`                               | ADR index      | Accepted | ADR catalog.                                          |

### 3.5 Documentation — Security and Operations

| File                                        | Classification   | Status | Notes                                                                                                                    |
| ------------------------------------------- | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `docs/security/SECURITY_AND_PRIVACY.md`     | Doc — Security   | Draft  | Threat model, identity, data protection, privacy lifecycle, AI handling, incident response. Owner: Security/Engineering. |
| `docs/operations/DEPLOYMENT_AND_RUNBOOK.md` | Doc — Operations | Draft  | Environments, CI/CD, SLOs, monitoring, incident runbooks, backup. Owner: Platform Engineering.                           |

### 3.6 Documentation — Engineering

| File                                | Classification    | Status   | Notes                                                                                  |
| ----------------------------------- | ----------------- | -------- | -------------------------------------------------------------------------------------- |
| `docs/engineering/DEVELOPMENT.md`   | Doc — Engineering | Accepted | Setup, commands, conventions, workflow, definition of done.                            |
| `docs/engineering/TEST_STRATEGY.md` | Doc — Engineering | Draft    | Test layers, critical scenarios, test data, release gates. Owner: Quality Engineering. |

### 3.7 Documentation — Execution Framework

| File                                               | Classification | Status     | Notes                                                     |
| -------------------------------------------------- | -------------- | ---------- | --------------------------------------------------------- |
| `docs/execution/README.md`                         | Execution      | Accepted   | Execution plan hub.                                       |
| `docs/execution/EXECUTION_PROTOCOL.md`             | Execution      | Accepted   | Mandatory phase execution protocol.                       |
| `docs/execution/MASTER_PLAN.md`                    | Execution      | Accepted   | Master plan: 29 phases, release trains, dependency graph. |
| `docs/execution/PROGRESS.md`                       | Execution      | Accepted   | Progress ledger; all phases NOT_STARTED.                  |
| `docs/execution/TRACEABILITY.md`                   | Execution      | Accepted   | Requirement-to-phase traceability.                        |
| `docs/execution/VALIDATION_CHECKLIST.md`           | Execution      | Accepted   | Plan integrity validation checklist.                      |
| `docs/execution/AGENT_PROMPT.md`                   | Execution      | Accepted   | Copy-paste phase prompt template.                         |
| `docs/execution/PHASE_PROMPTS.md`                  | Execution      | Accepted   | Ready-to-copy phase prompts (P00-P28).                    |
| `docs/execution/evidence/README.md`                | Execution      | Accepted   | Evidence directory policy.                                |
| `docs/execution/evidence/P00/RUN-20260721-0000.md` | Execution      | Run record | Pre-existing preflight run record for P00.                |

### 3.8 Documentation — Other

| File                                                                 | Classification | Status         | Notes                                                                                            |
| -------------------------------------------------------------------- | -------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `docs/README.md`                                                     | Doc — Hub      | Accepted       | Documentation hub/index.                                                                         |
| `docs/GLOSSARY.md`                                                   | Doc            | Accepted       | Canonical domain terminology.                                                                    |
| `docs/STATUS.md`                                                     | Doc            | Accepted       | Implementation status table. **File exists** — contradicts earlier preflight claim.              |
| `docs/PRODUCT_AND_TECHNICAL_PLAN.md`                                 | Doc            | **Superseded** | Original bilingual (Vietnamese/English) consolidated planning draft; superseded by focused docs. |
| `docs/research/MEETILY_REFERENCE_REVIEW.md`                          | Doc — Research | N/A            | Clean-room reference review of Meetily.                                                          |
| `docs/superpowers/specs/2026-07-21-phase-execution-system-design.md` | Doc — Design   | N/A            | Superpowers skill design spec.                                                                   |

### 3.9 Execution Phase Packets

| File                                                       | Phase | Status in ledger       |
| ---------------------------------------------------------- | ----- | ---------------------- |
| `docs/execution/phases/P00-design-closure.md`              | P00   | NOT_STARTED            |
| `docs/execution/phases/P01-quality-foundation.md`          | P01   | NOT_STARTED            |
| `docs/execution/phases/P02-domain-contracts.md`            | P02   | NOT_STARTED            |
| `docs/execution/phases/P03-persistence.md`                 | P03   | NOT_STARTED            |
| `docs/execution/phases/P04-auth-authorization.md`          | P04   | NOT_STARTED            |
| `docs/execution/phases/P05-object-storage-chunks.md`       | P05   | NOT_STARTED            |
| `docs/execution/phases/P06-jobs-outbox-events.md`          | P06   | NOT_STARTED            |
| `docs/execution/phases/P07-local-recovery-engine.md`       | P07   | NOT_STARTED            |
| `docs/execution/phases/P08-mobile-start-flow.md`           | P08   | NOT_STARTED            |
| `docs/execution/phases/P09-mobile-recording.md`            | P09   | NOT_STARTED            |
| `docs/execution/phases/P10-mobile-sync-recovery.md`        | P10   | NOT_STARTED            |
| `docs/execution/phases/P11-desktop-rust-foundation.md`     | P11   | NOT_STARTED            |
| `docs/execution/phases/P12-windows-audio-capture.md`       | P12   | NOT_STARTED            |
| `docs/execution/phases/P13-speech-deepgram.md`             | P13   | NOT_STARTED            |
| `docs/execution/phases/P14-finalization-backfill.md`       | P14   | NOT_STARTED            |
| `docs/execution/phases/P15-translation.md`                 | P15   | NOT_STARTED            |
| `docs/execution/phases/P16-transcript-review.md`           | P16   | NOT_STARTED            |
| `docs/execution/phases/P17-ai-provider-platform.md`        | P17   | NOT_STARTED            |
| `docs/execution/phases/P18-detailed-minutes-evaluation.md` | P18   | NOT_STARTED            |
| `docs/execution/phases/P19-minutes-editor.md`              | P19   | NOT_STARTED            |
| `docs/execution/phases/P20-branding-export-library.md`     | P20   | NOT_STARTED            |
| `docs/execution/phases/P21-application-security.md`        | P21   | NOT_STARTED            |
| `docs/execution/phases/P22-privacy-deletion-governance.md` | P22   | NOT_STARTED            |
| `docs/execution/phases/P23-observability-support.md`       | P23   | NOT_STARTED            |
| `docs/execution/phases/P24-resilience-performance-a11y.md` | P24   | NOT_STARTED            |
| `docs/execution/phases/P25-deployment-backup-dr.md`        | P25   | NOT_STARTED            |
| `docs/execution/phases/P26-packaging-signing-updates.md`   | P26   | NOT_STARTED            |
| `docs/execution/phases/P27-production-qualification.md`    | P27   | NOT_STARTED            |
| `docs/execution/phases/P28-local-ai-import-extension.md`   | P28   | NOT_STARTED (optional) |

### 3.10 Execution Templates

| File                                            | Classification     |
| ----------------------------------------------- | ------------------ |
| `docs/execution/templates/PHASE_TEMPLATE.md`    | Execution template |
| `docs/execution/templates/RUN_TEMPLATE.md`      | Execution template |
| `docs/execution/templates/EVIDENCE_TEMPLATE.md` | Execution template |
| `docs/execution/templates/HANDOFF_TEMPLATE.md`  | Execution template |

### 3.11 Source Code — Applications

#### `apps/api/` — Backend API (skeleton)

| File                     | Classification | Notes                                                               |
| ------------------------ | -------------- | ------------------------------------------------------------------- |
| `apps/api/package.json`  | Config         | `@kms/api` v0.1.0; Fastify 5, `@kms/ai`, `@kms/domain`.             |
| `apps/api/src/server.ts` | Prototype      | Fastify server with `/health` and `/v1/minutes/generate` endpoints. |
| `apps/api/tsconfig.json` | Config         | TypeScript config.                                                  |

**Capabilities:**

- Fastify HTTP server on port 4310 (configurable via `API_PORT`).
- CORS enabled (all origins).
- Health endpoint (`GET /health`) returns provider health status.
- Minutes generation endpoint (`POST /v1/minutes/generate`) sorts transcript by sequence, delegates to AI provider.
- Returns 400 if transcript is empty.
- Supports two provider modes: `mock` (default) and `openai-compatible`.

**Absent capabilities:**

- No authentication/authorization middleware.
- No database connection (no PostgreSQL, Drizzle ORM).
- No object storage integration (no S3/MinIO).
- No job queue (no Redis/BullMQ).
- No SSE/WebSocket for realtime events.
- No input validation (no Zod schemas).
- No error handling beyond bare 400 response.
- No logging content policy applied.
- No idempotency key support.
- No session management.
- Not production-ready in any dimension.

#### `apps/desktop/` — Desktop client (UI prototype)

| File                          | Classification | Notes                                                              |
| ----------------------------- | -------------- | ------------------------------------------------------------------ |
| `apps/desktop/package.json`   | Config         | `@kms/desktop` v0.1.0; Vite, React 19. **No Electron dependency.** |
| `apps/desktop/tsconfig.json`  | Config         | TypeScript config.                                                 |
| `apps/desktop/vite.config.ts` | Config         | Vite config.                                                       |
| `apps/desktop/index.html`     | Prototype      | Minimal HTML shell.                                                |
| `apps/desktop/src/main.tsx`   | Prototype      | Static React UI component.                                         |
| `apps/desktop/src/styles.css` | Prototype      | CSS for the UI prototype.                                          |

**Capabilities:**

- React 19 static UI with mode toggle (Record / Translate).
- Branded layout with navigation sidebar.
- New meeting card with mode selection buttons and source indicators.
- Start/End meeting button with pause/resume capability (client-side state only).
- Evidence promise section (marketing copy).
- Recent meetings library (empty state).
- Responsive layout (media query at 850px).

**Absent capabilities:**

- **No Electron shell** — reads like a standard Vite web app; no `electron`, `electron-builder`, or main process file.
- No audio capture (no WASAPI, no Rust native runtime).
- No native device enumeration or health monitoring.
- No real recording — all state is local React `useState`.
- No network communication with API.
- No authentication.
- No TipTap editor.
- No branding/export controls.
- No real persistence or recovery.

#### `apps/mobile/` — Mobile client (UI prototype)

| File                        | Classification | Notes                                                    |
| --------------------------- | -------------- | -------------------------------------------------------- |
| `apps/mobile/App.tsx`       | Prototype      | Static Expo React Native UI component.                   |
| `apps/mobile/tsconfig.json` | Config         | TypeScript config.                                       |
| `apps/mobile/package.json`  | Config         | `@kms/mobile` v0.1.0; Expo ~54.0.0, React Native 0.81.4. |

**Capabilities:**

- Expo/React Native static UI with mode toggle (Record / Translate).
- Branded hero section and setup sheet.
- Start/End meeting button (client-side state only).
- "Recording securely" indicator.
- Mode selection (Record / Translate).

**Absent capabilities:**

- No microphone recording implementation.
- No permissions handling.
- No offline queue or recovery.
- No network communication.
- No authentication.
- No background task handling.
- No real persistence.

### 3.12 Source Code — Packages

#### `packages/domain/` — Shared domain types (prototype)

| File                            | Classification | Notes                                             |
| ------------------------------- | -------------- | ------------------------------------------------- |
| `packages/domain/package.json`  | Config         | `@kms/domain` v0.1.0; no runtime dependencies.    |
| `packages/domain/src/index.ts`  | Prototype      | TypeScript types and interfaces for domain model. |
| `packages/domain/tsconfig.json` | Config         | TypeScript config.                                |

**Types defined:**

- `Language` — `"vi" | "en" | "mixed"`
- `MeetingMode` — `"record" | "record_translate"`
- `MeetingStatus` — `"draft" | "recording" | "paused" | "processing" | "ready" | "failed"`
- `MinutesTemplate` — `"team" | "one_on_one" | "direct_report" | "leadership" | "recurring"`
- `TranscriptSegment`, `TranscriptRevision`, `AudioAsset`, `Meeting`
- `MinutesSection`, `ActionItem`, `DetailedMinutes`
- `GenerateMinutesInput` with `detailLevel: "verbatim" | "detailed"`
- `EvidenceRef` with `segmentId`, `startMs`, `endMs`

**Absent:**

- No runtime validation (no Zod schemas alongside types).
- No state machine implementation.
- No command/event types.
- No error type hierarchy.
- No repository interfaces.
- No provider capability interfaces.
- No persistence schemas or migrations.

#### `packages/ai/` — AI provider abstraction (prototype)

| File                        | Classification | Notes                                                                 |
| --------------------------- | -------------- | --------------------------------------------------------------------- |
| `packages/ai/package.json`  | Config         | `@kms/ai` v0.1.0; depends on `@kms/domain`.                           |
| `packages/ai/src/index.ts`  | Prototype      | `AiProvider` interface, `MockAiProvider`, `OpenAiCompatibleProvider`. |
| `packages/ai/tsconfig.json` | Config         | TypeScript config.                                                    |

**Capabilities:**

- `AiProvider` interface with `generateDetailedMinutes()` and `healthcheck()`.
- `MockAiProvider` — deterministic development provider; creates sections from transcript segments, but `decisions`, `openQuestions`, and `actionItems` are always empty.
- `OpenAiCompatibleProvider` — calls any OpenAI-compatible chat completions API with structured output.
- `createAiProvider()` factory function.

**Absent:**

- No output validation (no schema/citation validation).
- No speech provider interface (only generative AI).
- No translation provider interface.
- No capability negotiation.
- No provider routing or policy.
- No cost/budget tracking.
- No provider health aggregation.

### 3.13 Config Files

| File                      | Classification | Notes                                                              |
| ------------------------- | -------------- | ------------------------------------------------------------------ |
| `.env.example`            | Config         | Template for AI provider config, speech provider config, API port. |
| `.gitignore`              | Config         | Standard ignores.                                                  |
| `tsconfig.base.json`      | Config         | Shared TypeScript options.                                         |
| `pnpm-workspace.yaml`     | Config         | Package discovery layout.                                          |
| `skills-lock.json`        | Config         | Claude Code skills version lock.                                   |
| `pnpm-lock.yaml`          | Generated      | pnpm lockfile.                                                     |
| `apps/*/tsconfig.json`    | Config         | Per-package TypeScript configs (5 files).                          |
| `apps/*/package.json`     | Config         | Per-package configs (3 files).                                     |
| `packages/*/package.json` | Config         | Per-package configs (2 files).                                     |

---

## 4. Prototype Capabilities Summary

| Capability                | State                 | Location                                                      |
| ------------------------- | --------------------- | ------------------------------------------------------------- |
| Monorepo workspace        | Working               | Root, pnpm-workspace.yaml                                     |
| Shared domain types       | Prototype, incomplete | packages/domain/src/index.ts                                  |
| Generative AI abstraction | Prototype             | packages/ai/src/index.ts                                      |
| Mock AI provider          | Prototype             | packages/ai/src/index.ts (always empty actionItems/decisions) |
| OpenAI-compatible adapter | Prototype             | packages/ai/src/index.ts                                      |
| Fastify API skeleton      | Skeleton              | apps/api/src/server.ts                                        |
| Desktop static UI         | UI prototype          | apps/desktop/src/main.tsx                                     |
| Mobile static UI          | UI prototype          | apps/mobile/App.tsx                                           |
| Phase execution framework | Accepted docs         | docs/execution/                                               |
| Architecture decisions    | 6 ADRs accepted       | docs/decisions/                                               |

---

## 5. Absent Production Capabilities

| Capability                      | Required by phase | Notes                              |
| ------------------------------- | ----------------- | ---------------------------------- |
| Runtime domain validation (Zod) | P02               | Types exist but no runtime schemas |
| Meeting state machine           | P02               | No server-enforced transitions     |
| Command/event types             | P02               | Not defined                        |
| Error type hierarchy            | P02               | Not defined                        |
| Database (PostgreSQL)           | P03               | No migrations, no connection       |
| Drizzle ORM schemas             | P03               | Not created                        |
| Object storage (S3/MinIO)       | P05               | No integration                     |
| Authentication (OIDC/PKCE)      | P04               | No auth middleware                 |
| Authorization (owner-scoped)    | P04               | No resource isolation              |
| Job queue (Redis/BullMQ)        | P06               | Not configured                     |
| Audio capture                   | P08/P09/P12       | Not implemented in any client      |
| Local recovery engine           | P07               | Not implemented                    |
| Speech transcription (Deepgram) | P13               | Not connected                      |
| Translation                     | P15               | Not implemented                    |
| Transcript review/editor        | P16               | Not implemented                    |
| Detailed minutes generation     | P17-P18           | Mock only; not real                |
| Minutes editor (TipTap)         | P19               | Not started                        |
| Export (DOCX/PDF/MD/TXT/JSON)   | P20               | Not started                        |
| Library and search              | P10/P20           | Not implemented                    |
| Branding                        | P20               | Not started                        |
| Monitoring/observability        | P23               | Not configured                     |
| CI/CD pipeline                  | P01               | No CI config                       |
| Tests (any framework)           | P01               | Zero tests exist                   |
| Electron packaging              | P11               | No Electron dependency             |
| Rust native runtime             | P11               | No Rust code                       |
| Docker/infrastructure           | P01/P25           | No Docker compose                  |
| Accessibility (WCAG)            | P24               | Not addressed                      |
| Localization (vi/en UI)         | P08               | Not implemented                    |

---

## 6. Doc/Code Contradictions

### C01 — Language type mismatch (doc vs. code)

**Location:** `packages/domain/src/index.ts` line 1 vs. ADR-004 and locked engineering defaults.

**Code:** `Language = "vi" | "en" | "mixed"` includes `"mixed"`.

**Design:** ADR-004 states "the user must choose Vietnamese or English" and "automatic/mixed-language mode is deferred." Locked engineering defaults confirm "meeting language is explicitly one of `vi | en`" with no mixed in v1.

**Severity:** HIGH — the type allows a value the architecture explicitly prohibits.

### C02 — MeetingStatus state machine mismatch

**Location:** `packages/domain/src/index.ts` line 3 vs. `SYSTEM_ARCHITECTURE.md` line 112 and `USER_FLOWS.md` line 45.

**Code:** `MeetingStatus = "draft" | "recording" | "paused" | "processing" | "ready" | "failed"` (6 states).

**Design:** `draft -> checking -> recording <-> paused -> finalizing -> processing -> ready`, with error branches `recovery_required` and `partial_ready` (9 states).

**Missing from code:** `checking`, `finalizing`, `recovery_required`, `partial_ready`.
**Present in code but not in design:** `failed`.

**Severity:** HIGH — the state machine has different states and transitions. `failed` is not defined in the architecture.

### C03 — MeetingMode naming mismatch

**Location:** `packages/domain/src/index.ts` line 2 vs. PRD page 2, DATA_MODEL.md, and FR-1.

**Code:** `MeetingMode = "record" | "record_translate"` (underscore-separated, verb-based).

**Design:** PRD/FR-1: `meeting_only | meeting_translate`. DATA_MODEL.md: `mode(meeting_only|meeting_translate)`. USER_FLOWS Flow 1: `Meeting only | Meeting + translation`.

**Severity:** MEDIUM — same semantics, different names across code and docs.

### C04 — Desktop mode name mismatch

**Location:** `apps/desktop/src/main.tsx` line 5 vs. `packages/domain/src/index.ts` line 2.

**Desktop code:** Local `Mode` type is `"record" | "translate"`.
**Domain type:** `"record" | "record_translate"`.

The desktop uses `"translate"` which matches neither the domain type (`"record_translate"`) nor the design docs (`"meeting_translate"`).

**Severity:** MEDIUM — introduces a third naming variant.

### C05 — Minutes detail level inconsistency

**Location:** PRD vs. USER_FLOWS vs. `GenerateMinutesInput.detailLevel`.

**PRD (FR-5):** "Detailed minutes are the default; executive summary is a separate user action." Implies `"detailed" | "executive_summary"`.

**USER_FLOWS Flow 5:** "Choose output language and `Detailed` or `Near-verbatim` level." Uses `"detailed" | "near_verbatim"`.

**Code (`GenerateMinutesInput`):** `detailLevel: "verbatim" | "detailed"`. Uses `"detailed" | "verbatim"`.

Three different sets of terminology for what may be the same concept.

**Severity:** MEDIUM — no implementation exists yet, but naming will cause confusion during P17-P18.

### C06 — MockAiProvider produces incomplete minutes

**Location:** `packages/ai/src/index.ts` lines 27-48.

`MockAiProvider.generateDetailedMinutes()` returns `DetailedMinutes` where `decisions`, `openQuestions`, and `actionItems` are always empty arrays. The schema expects these to be populated. No real AI provider would return empty arrays for all meetings.

**Severity:** LOW — mock provider is acceptable for development, but it doesn't demonstrate the full schema or validate downstream consumers.

### C07 — Zero tests

**Location:** No test files exist anywhere in the repository.

Root `package.json` defines `"test": "pnpm -r --if-present test"` but no package has a test script or test configuration. The TEST_STRATEGY.md documents Vitest, Playwright, Maestro, and Testcontainers, but none are installed or configured.

**Severity:** HIGH — every coding phase from P01 onward requires tests.

### C08 — `docs/STATUS.md` existence (run record contradiction)

**Location:** `docs/execution/evidence/P00/RUN-20260721-0000.md` vs. actual filesystem.

**Run record claim:** `docs/STATUS.md` is "Missing - will be created."

**Reality:** `docs/STATUS.md` exists at the documented path, with content (31 capabilities with states, definitions, acceptance date 2026-07-21).

This is a factual error in the run record. It also was referenced in the preflight research as missing.

**Severity:** MEDIUM — the run record contains incorrect state.

### C09 — `docs/STATUS.md` referenced but ambiguous

Multiple docs (README.md, CONTRIBUTING.md, SYSTEM_ARCHITECTURE.md landing page, EXECUTION_PROTOCOL.md) reference `STATUS.md` for implementation status. The file exists, but the P00 phase packet's "Authoritative context" and the pre-existing run record both suggest it was expected to be missing. This reflects a coordination gap between documents at different revision times.

**Severity:** LOW — file exists; confusion is in the audit trail only.

### C10 — All product/architecture docs are "Draft" status

| Document                   | Status | Owner                   |
| -------------------------- | ------ | ----------------------- |
| PRD.md                     | Draft  | Product                 |
| USER_FLOWS.md              | Draft  | Product Design          |
| ROADMAP.md                 | Draft  | Product and Engineering |
| SYSTEM_ARCHITECTURE.md     | Draft  | Engineering             |
| DATA_MODEL.md              | Draft  | Engineering             |
| API_CONTRACTS.md           | Draft  | Backend Engineering     |
| AI_AND_SPEECH_PROVIDERS.md | Draft  | AI Platform Engineering |
| SECURITY_AND_PRIVACY.md    | Draft  | Security/Engineering    |
| DEPLOYMENT_AND_RUNBOOK.md  | Draft  | Platform Engineering    |
| TEST_STRATEGY.md           | Draft  | Quality Engineering     |

Only TECH_STACK.md, DEVELOPMENT.md, all ADRs, GLOSSARY.md, STATUS.md, and execution docs are "Accepted."

**Severity:** LOW by itself for pre-alpha — expected at P00. Must be resolved before alpha release (P27).

### C11 — No license selected

**Location:** README.md "No license has been selected. Until one is added, the repository is private/proprietary and reuse is not granted."

**Severity:** LOW for pre-alpha; must be resolved before distribution.

### C12 — Branch name mismatch

**Location:** README.md mentions `main` as the default branch. But `git status` shows branch `master`.

This is the initial condition (no commits yet), but the mismatch between documented convention and actual branch name will cause confusion when the first commit is made.

**Severity:** LOW — can be resolved during P00-T06 (initial commit).

### C13 — Desktop app has no Electron dependency

**Location:** `apps/desktop/package.json` vs. README.md and TECH_STACK.md.

**Documented:** Desktop uses "Electron / React + Rust runtime."
**Reality:** `apps/desktop/package.json` lists `@vitejs/plugin-react`, `vite`, `react`, `react-dom` only. No `electron`, `electron-builder`, or any Electron-related packages. No `main.js`, `preload.js`, or Electron main process files exist.

The desktop app is currently a plain Vite + React web application, not an Electron application.

**Severity:** HIGH — the prototype can't be packaged or run as a desktop application.

### C14 — Missing infrastructure dependencies

**Location:** Architecture docs vs. actual dependencies.

Architecture expects PostgreSQL, Redis, MinIO/S3, Docker. None of these are configured:

- No `docker-compose.yml` or equivalent.
- No database connection strings in `.env.example`.
- No Redis config.
- No S3/MinIO config.
- No Drizzle ORM schema files.

`.env.example` only contains AI provider and speech provider config plus API port.

**Severity:** MEDIUM — blocks P01+ infrastructure setup.

### C15 — Detail level enum has three definitions

**Summary of variants:**

| Source                                    | Values                            |
| ----------------------------------------- | --------------------------------- |
| `GenerateMinutesInput.detailLevel` (code) | `"verbatim" \| "detailed"`        |
| PRD (FR-5)                                | `Detailed` vs `Executive summary` |
| USER_FLOWS (Flow 5)                       | `Detailed` vs `Near-verbatim`     |

Three different schema/value sets exist across docs and code. The code uses `"verbatim"` which appears in neither PRD nor USER_FLOWS. The PRD's "Executive summary" appears in neither code nor USER_FLOWS.

**Severity:** MEDIUM — will cause integration issues during P17-P18.

### C16 — Desktop uses Vite config but missing Vite plugin details

**Location:** `apps/desktop/vite.config.ts` vs. `apps/desktop/package.json`.

The Vite config exists but the desktop uses a standard Vite React setup without any Electron integration plugin (e.g., `vite-plugin-electron`). The `package.json` has `"main": "dist-electron/main.js"` which references a path that does not exist in the repository.

**Severity:** MEDIUM — dead configuration path.

### C17 — DATA_MODEL field name mismatch vs. domain types

`DATA_MODEL.md` describes Meeting entity with field `language(vi|en)` and `mode(meeting_only|meeting_translate)`. The domain type `Meeting` uses:

- `primaryLanguage: Language` (not `language`)
- `mode: MeetingMode` with values `"record" | "record_translate"` (not `"meeting_only" | "meeting_translate"`)

The field names and value sets differ between documented design and code.

**Severity:** MEDIUM — will cause confusion during P02 contract implementation.

### C18 — README says Node.js 22+, environment has 24.18.0

**Location:** `README.md` line 39 vs. actual runtime.

README specifies "Node.js 22+, pnpm 10+." The actual environment is Node.js v24.18.0 (current LTS). This is not a contradiction per se (22+ includes 24), but it's stale.

**Severity:** LOW — documentation should be updated to match actual version.

### C19 — `docs/PRODUCT_AND_TECHNICAL_PLAN.md` is bilingual superseded document

This file contains Vietnamese content alongside English. It is marked "Superseded" but still exists as a planning artifact. No remaining doc references it.

**Severity:** LOW — irrelevant but should be noted for cleanup.

### C20 — `.gitignore` does not cover all generated/transient paths

`.gitignore` omits `.tsbuildinfo` files, `.turbo/` (if Turborepo is added), and IDE-specific directories (`.vscode/`, `.idea/`). No `.gitattributes` exists for line-ending normalization.

**Severity:** LOW — can be resolved during development setup.

---

## 7. Encoding and Link Issues

### Link Resolution Check

| Source                      | Link Target                                 | Resolves? | Notes                        |
| --------------------------- | ------------------------------------------- | --------- | ---------------------------- |
| `README.md`                 | `docs/STATUS.md`                            | Yes       | File exists                  |
| `README.md`                 | `docs/README.md`                            | Yes       |                              |
| `README.md`                 | `docs/product/PRD.md`                       | Yes       |                              |
| `README.md`                 | `docs/product/USER_FLOWS.md`                | Yes       |                              |
| `README.md`                 | `docs/architecture/SYSTEM_ARCHITECTURE.md`  | Yes       |                              |
| `README.md`                 | `docs/security/SECURITY_AND_PRIVACY.md`     | Yes       |                              |
| `README.md`                 | `docs/ROADMAP.md`                           | Yes       |                              |
| `README.md`                 | `CONTRIBUTING.md`                           | Yes       |                              |
| `docs/README.md`            | `docs/security/SECURITY_AND_PRIVACY.md`     | Yes       |                              |
| `docs/README.md`            | `../SECURITY.md`                            | Yes       |                              |
| `docs/decisions/ADR-006.md` | `docs/research/MEETILY_REFERENCE_REVIEW.md` | Yes       | Implicit reference confirmed |
| `SECURITY.md`               | `docs/security/SECURITY_AND_PRIVACY.md`     | Yes       | Implicit reference           |

All relative Markdown links found during audit resolve correctly.

### Encoding Check

No UTF-8 replacement characters (`�`, `￾`) were found in any maintained doc. `docs/PRODUCT_AND_TECHNICAL_PLAN.md` contains Vietnamese Unicode characters (e.g., "Tieng Viet", "Bao toan du lieu") encoded correctly in UTF-8.

---

## 8. File Classification Summary

| Category                   | Count | Details                                                                                                  |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| Governance (root)          | 6     | AGENTS, CHANGELOG, CONTRIBUTING, README, SECURITY, .gitignore                                            |
| Config (root)              | 5     | package.json, pnpm-workspace.yaml, tsconfig.base.json, .env.example, skills-lock.json                    |
| Generated (root)           | 1     | pnpm-lock.yaml                                                                                           |
| Docs — Product             | 3     | PRD, USER_FLOWS, ROADMAP                                                                                 |
| Docs — Architecture        | 5     | SYSTEM_ARCHITECTURE, TECH_STACK, DATA_MODEL, API_CONTRACTS, AI_AND_SPEECH_PROVIDERS                      |
| Docs — Decisions           | 7     | ADR-001 through ADR-006, decisions/README                                                                |
| Docs — Security/Operations | 2     | SECURITY_AND_PRIVACY, DEPLOYMENT_AND_RUNBOOK                                                             |
| Docs — Engineering         | 2     | DEVELOPMENT, TEST_STRATEGY                                                                               |
| Docs — Hub/Status/Glossary | 4     | README.md, STATUS, GLOSSARY, PRODUCT_AND_TECHNICAL_PLAN                                                  |
| Docs — Research/Design     | 2     | MEETILY_REFERENCE_REVIEW, superpowers design spec                                                        |
| Execution framework        | 8     | Protocol, Master Plan, Progress, Traceability, Validation, Agent Prompt, Phase Prompts, Execution README |
| Execution templates        | 4     | Phase, Run, Evidence, Handoff                                                                            |
| Execution phases           | 29    | P00 through P28 packets                                                                                  |
| Execution evidence         | 2     | Evidence README, RUN-20260721-0000                                                                       |
| Source — API               | 3     | server.ts, package.json, tsconfig.json                                                                   |
| Source — Desktop           | 5     | main.tsx, styles.css, index.html, package.json, tsconfig.json, vite.config.ts                            |
| Source — Mobile            | 3     | App.tsx, package.json, tsconfig.json                                                                     |
| Source — Domain            | 2     | index.ts, package.json, tsconfig.json                                                                    |
| Source — AI                | 2     | index.ts, package.json, tsconfig.json                                                                    |

**All files are untracked (new repository). Total: ~85 files.**

---

## 9. Key Findings Count

1. **6 ADRs** accepted covering recording, evidence, providers, language, architecture, and native runtime.
2. **10 docs** in Draft status requiring approval before alpha.
3. **20+ contradictions** between docs and/or code documented above.
4. **Zero tests** exist despite test strategy documentation.
5. **Zero production capabilities** implemented — all source code is prototype/skeleton.
6. **Zero infrastructure** configured despite documented PostgreSQL, Redis, S3 dependencies.
7. **No license** selected.
8. **Branch name** mismatch (`master` vs. documented `main`).
9. **Desktop missing Electron** despite being documented as an Electron app.
10. **State machine** in code has 6 states vs. 9 states in architecture design.
