# Delivery Roadmap

**Status:** Draft  
**Owner:** Product and Engineering  
**Last reviewed:** 2026-07-21

Dates are intentionally omitted until capacity is known. Progress is gate-based, not calendar-based.

## Supported release platforms

The personal release supports Windows 11 23H2+ x64 and Android 12+. Android is
the sole supported mobile platform. Existing iOS configuration and
implementation remain as a dormant, non-gating reserve under ADR-007.

## Phase 0 — Design approval

- Approve PRD, user flows, architecture, data lifecycle, stack and ADRs.
- Approve retention/consent/privacy assumptions for intended test users.
- Create UI wireframes and benchmark plan.

**Exit:** No unresolved decision blocks recording foundation work.

## Phase 1 — Data foundation

- Runtime domain schemas and meeting state machine.
- PostgreSQL migrations, personal auth and owner-scoped authorization.
- S3 storage, chunk manifest/checksum and local recovery model.
- Job queue/outbox plus mock providers.

**Exit:** Integration tests prove idempotent chunks, state transitions and user isolation.

## Phase 2 — Mobile capture alpha

- Required language/mode setup flow.
- Microphone chunks, pause/resume/end, recovery and offline upload.
- Minimal meeting library and audio playback.

**Exit:** Two-hour supported-device tests survive network loss and process interruption without silent loss.

## Phase 3 — Windows desktop capture alpha

- Electron shell plus a versioned, signed Rust native runtime and simulator.
- WASAPI microphone/system/both capture with separate immutable tracks and derived mix.
- Persistent resampling, bounded buffers and atomic 5–10 second chunk manifests (interval selected by benchmark).
- Stable device IDs, disconnect/reconnect, Bluetooth grace, sleep/wake, device changes and Recovery Inbox.
- Shared library/session status.

**Exit:** Zoom/Meet/Teams plus USB/Bluetooth/default-device-change tests pass on supported Windows; two-hour drift, buffer and crash-boundary reports show no silent loss.

## Phase 4 — Speech and translation

- Deepgram realtime adapter, final/interim events and diarization.
- Backfill and completeness calculation.
- Replaceable translation adapter for requested mode.
- Optional local whisper.cpp file transcription with model manifest, resumable verified download, cancellation and resource limits.

**Exit:** Vietnamese/English benchmark and provider-failure scenarios meet agreed thresholds.

## Phase 5 — Review and detailed minutes

- Transcript timeline, revisions, speaker mapping, search and markers.
- Virtualized/paginated two-hour transcript with intelligent auto-follow, new-item indicator and accessible keyboard seek.
- Five detailed minutes templates.
- Versioned data-defined template schemas and fixtures.
- Multi-provider generation drafts, schema/citation/coverage validation and immutable publication/versioning; cancel/failure preserves the selected version.

**Exit:** Evaluation suite meets evidence/coverage thresholds; no source artifact can be overwritten.

## Phase 6 — Editor and export

- TipTap editor, diff-based AI rewrite, citations and version history.
- Branding and DOCX/PDF/MD/TXT/JSON/audio exports.
- Mobile lightweight review/export.

**Exit:** Version-pinned exports pass visual/data consistency tests.

## Phase 7 — Hardening and beta

- Accessibility/localization, security/privacy review and operational controls.
- Load, long-session, recovery, backup/restore and deletion drills.
- Signed installers/builds, staged rollout, monitoring and support process.

**Exit:** PRD release acceptance and test release gates pass with zero critical/high data-loss/security defects.

## Post-beta candidates

- macOS system-audio capture.
- Team workspaces/RBAC and controlled sharing.
- Calendar/email integrations.
- Meeting comparison, recurring follow-up intelligence and organization knowledge search.
- Enterprise retention, SSO, audit and regional processing.
- Immutable audio import and re-transcription with staged progress, cancellation and new transcript projections.
