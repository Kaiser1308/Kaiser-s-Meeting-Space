---
phase: P10
title: Mobile sync, Recovery Inbox, library, and source playback
packet_status: ACCEPTED
depends_on: [P05, P09]
requirements: [FR-2, FR-4, FR-7]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Mobile reconciles P09 local chunks with the authenticated P05 cloud manifest, survives auth/network/process failures, exposes Recovery Inbox actions and truthful local/cloud/completeness state, and provides an offline-capable personal library/detail/source playback without premature source cleanup or cross-user access.

# Authoritative context

Read API Contracts meeting/audio/library sections, User Flows recovery/library, P04/P05/P07/P09 evidence, Data Model, and Security signed URL/cache controls.

# Preconditions and external prerequisites

P05/P09 are `VERIFIED`; real local API/PostgreSQL/MinIO/OIDC stack and supported physical devices are available. P06/P14 processing is not yet available; the UI must label server finalization/transcript as unavailable/pending truthfully.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P05        | Verified outputs and invariants consumed by this packet. | `../evidence/P05/EVIDENCE.md` | VERIFIED          |
| P09        | Verified outputs and invariants consumed by this packet. | `../evidence/P09/EVIDENCE.md` | VERIFIED          |

# Scope firewall

**Allowed:** mobile sync transport/scheduler/state UI, Recovery Inbox screens/actions, meeting end request boundary, library/detail/cache, audio playback, and mobile integration/E2E/security/fault tests.

**Forbidden/out:** transcript review, minutes/export, permanent cloud deletion, speech/backfill, hidden background guarantees, and cleanup of unverified source.

**Extension seams:** sync uses P07 transport; library/API clients use generated/runtime-validated contracts and cursor pagination.

# Contracts and invariants

- Sync follows persisted P07 states and P05 register -> direct upload -> complete -> reconcile; token refresh/restart is idempotent.
- Local-safe and cloud-verified are distinct; End/finalization request occurs only after local manifest closure and can remain pending.
- Recovery Delete is local-only unless an authenticated cloud meeting deletion command explicitly exists; permanent deletion is P22.
- Playback prefers valid local source, otherwise an owner-scoped short URL, and shows pauses/gaps/unavailable ranges.
- Cache cleanup requires P07 eligibility/server verification and never affects active/recovery/conflict sessions.

# File and ownership map

| Path                                    | Responsibility                                       | Owner                |
| --------------------------------------- | ---------------------------------------------------- | -------------------- |
| mobile sync feature                     | transport, scheduler, persisted status, auth refresh | Sync                 |
| mobile recovery feature                 | inbox/preview/actions                                | Recovery             |
| mobile library/player feature           | cursor cache/detail/playback/timeline                | Library              |
| API meeting/library endpoints if absent | owner-scoped metadata only                           | Sync/API             |
| mobile integration/E2E tests            | network/auth/crash/two-user/playback                 | Independent reviewer |

# Ordered task packets

## P10-T01 - Authenticated P05 sync transport

Implement register/sign/upload/complete/manifest client with runtime parsing, idempotency, progress, timeout/cancel, token refresh, and signed upload outside API. Tests cover offline, expiry mid-upload, duplicate/out-of-order, object uploaded/call lost, malformed response, and wrong owner. Evidence: `evidence/P10/sync-transport.json`.

## P10-T02 - Foreground/background-safe persisted scheduling

Connect P07 queue to mobile lifecycle/network/power policy with bounded concurrency and visible pending/retry/conflict. Test OS task not run, app kill, rapid network flap, backoff persistence, manual retry, queue pressure, and capture priority. Evidence: `sync-scheduler-report.json`.

## P10-T03 - Recovery Inbox UI/actions

Render preview/status/chunks/storage/actions and implement Continue/Finalize/Delete through P07 commands with confirmation and source preservation. Test every P07 crash state, corrupt/read-only manifests, offline/cloud mismatch, and action interruption. Evidence: `recovery-ui-matrix.json`.

## P10-T04 - End request and restart reconciliation

After P09 local-safe close, issue idempotent server End/finalization request contract and reconcile response/restart. Until P14 exists, expose accepted/pending/unavailable accurately and do not fake processing completion. Test duplicate End, late upload, auth expiry, app kill, and server partial state. Evidence: `mobile-end-report.json`.

## P10-T05 - Offline-capable owner-scoped library/detail

Implement cursor pagination, refresh/cache/version merge, title/date/language/duration/local/cloud/completeness/artifact state and empty/error/offline UI. Test large personal dataset, pagination duplicates, explicit soft-deleted exclusion state, stale cache, two owners, and no content in telemetry. Evidence: `library-report.json`.

## P10-T06 - Local/cloud source playback and cache policy

Implement validated local file playback fallback to scoped URL, source selection, pause/gap timeline, seeking, missing/corrupt range state, URL expiry refresh, and P07 cleanup eligibility. Test offline, local missing/hash mismatch, token/URL expiry, route interruption, and independent source metadata. Evidence: `playback-report.json`.

## P10-T07 - Physical-device sync/recovery/security qualification

Run network flap, airplane mode, token expiry, process kill at each upload/End boundary, checksum conflict, queue backlog, local/server mismatch, library paging, playback, and two-user attempts on supported Android. Inspect local files/manifests/DB/objects. Evidence: `evidence/P10/EVIDENCE.md`.

# Subagent work packages

| Package        | Tasks       | Exclusive paths                    | Depends on | Review gate                  |
| -------------- | ----------- | ---------------------------------- | ---------- | ---------------------------- |
| Sync/API       | T01,T02,T04 | sync feature + needed metadata API | P05,P09    | auth/idempotency review      |
| Recovery       | T03         | recovery UI/service                | P07,T02    | destructive/data-loss review |
| Library/player | T05,T06     | library/player/cache               | T01        | URL/cache/a11y review        |
| Independent QA | T07         | tests/evidence only                | all        | device/two-user/fault review |

# Failure and debugging matrix

| Failure                       | Classification | Expected behavior                                  | Recovery/regression |
| ----------------------------- | -------------- | -------------------------------------------------- | ------------------- |
| Token expires mid-upload      | security       | Refresh/retry same idempotent chunk; retain source | expiry test         |
| Kill after object upload      | timing         | HEAD/reconcile/complete after restart              | boundary test       |
| Checksum conflict             | security       | Stop auto-retry, preserve diagnostic/source        | conflict E2E        |
| Cloud unavailable             | environment    | Record/recovery/cached library remain usable       | offline matrix      |
| Signed URL/local file missing | persistence    | Truthful unavailable/retry, never fake playback    | player fault test   |

# Integrated verification

Run mobile sync/library/player unit/component tests, real API/PostgreSQL/MinIO/OIDC integration, P07/P05 conformance, resilience/crash suite, two-user security tests, supported-device Maestro/offline/playback matrix, and `pnpm verify`.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P10/EVIDENCE.md` |

# Acceptance gate

- [ ] P10-A01 - Local/server manifests reconcile idempotently without duplicate or silent loss.
- [ ] P10-A02 - Recovery actions pass every P07/P09 crash boundary and never imply unintended cloud deletion.
- [ ] P10-A03 - End/pending/cloud/local/completeness states remain truthful across restart/outage.
- [ ] P10-A04 - Offline library/playback works within cached/local limits and cross-user resources are denied.
- [ ] P10-A05 - Cleanup cannot remove active/unverified/conflicted source.
- [ ] P10-A06 - Supported Android physical sync/recovery matrices pass.

# Migration, rollout, and rollback

Internal alpha flag. Disable new sync/library requests while retaining local queue/recovery/playback. Do not delete source on rollback.

# Required documentation updates

API library/end contract, User Flows recovery/status, mobile runbook, Status/Traceability/Progress, and P10 evidence.

# Conversation boundary

Do not implement transcript review, speech/backfill, minutes/export, or permanent deletion. Do not fake P14 processing completion. Stop after P10.

# Handoff record

P14 remains blocked on P13/P06; record P10 complete and stop.
