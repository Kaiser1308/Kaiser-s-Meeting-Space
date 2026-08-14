---
phase: P19
title: Structured minutes editor, autosave, version history, and rewrite proposals
packet_status: ACCEPTED
depends_on: [P18]
requirements: [FR-5, FR-6, NFR-Accessibility]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Desktop users can fully edit the supported minutes structure, autosave without silent loss, inspect/seek citations, resolve confirmation items, compare/restore immutable versions, and accept/reject bounded AI rewrite proposals. Every save/restore/rewrite is authorized, conflict-safe, schema-valid, and preserves transcript/audio evidence.

# Authoritative context

Read PRD FR-5/FR-6, User Flows edit/rewrite/export preparation, Data Model MinutesVersion/Evidence, API minutes routes, P16 evidence navigation, P17 rewrite validation, and P18 draft/schema evidence.

# Preconditions and external prerequisites

P18 is `VERIFIED`; approved TipTap/ProseMirror versions, fixed complex document fixtures, and desktop accessibility test environment are available.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P18        | Verified outputs and invariants consumed by this packet. | `../evidence/P18/EVIDENCE.md` | VERIFIED          |

## Deferred end-to-end qualification lane

For implementation only, P19 may consume P18 contracts at `IMPLEMENTED` under
[`../DEFERRED_END_TO_END_QUALIFICATION.md`](../DEFERRED_END_TO_END_QUALIFICATION.md).
Its run record must carry every inherited open row. P19 cannot claim `VERIFIED`
until its dependencies and the inherited qualification rows are closed.

# Scope firewall

**Allowed:** minutes document schema/migrations/serialization, API versions/current/autosave/proposal, desktop editor/citations/history/compare/restore/confirmation UI, offline pending state, a11y/conflict/E2E tests.

**Forbidden/out:** real-time collaboration, export rendering/branding, transcript/source mutation, arbitrary HTML/scripts, silent AI edits, mobile full editor, and last-write-wins conflicts.

**Extension seams:** versioned editor JSON schema and command-based transformations allow future nodes/migrations without changing immutable stored snapshots.

# Contracts and invariants

- Stored `MinutesDocumentV1` is validated JSON with stable node IDs, headings, paragraphs, lists/checklists, tables, citations, confirmation markers, custom fields, and no executable/raw unsafe HTML.
- Save requires owner/document/base version/idempotency/content hash; creates immutable version and atomically selects current.
- Local autosave journal is bounded/versioned and removed only after server acknowledgement.
- Restore creates a new version; rewrite returns a proposal/diff and mutates only after explicit acceptance into a new version.
- Citations pin P16 evidence; broken/stale/unavailable state is visible and cannot be silently stripped.

# File and ownership map

| Path                            | Responsibility                             | Owner                |
| ------------------------------- | ------------------------------------------ | -------------------- |
| domain/editor schema/migrations | document nodes/validation/conversion       | Document model       |
| API minutes versions/proposals  | auth/save/history/compare/restore          | Document model       |
| desktop minutes editor feature  | TipTap commands/autosave/citations/history | Editor UI            |
| editor local journal            | offline pending/conflict/recovery          | Editor UI            |
| editor E2E/a11y/security tests  | malformed/conflict/reload/rewrite          | Independent reviewer |

# Ordered task packets

## P19-T01 - Versioned safe editor document schema

Define nodes/marks/attrs/IDs/citations/confirmation/custom fields and deterministic P18 conversion/serialization/migrations. Fuzz malformed/deep/large/HTML/script/URL/cyclic/duplicate IDs and test old-version migration/round-trip. Evidence: `evidence/P19/editor-schema.json`.

## P19-T02 - Owner-authorized immutable versions and autosave API

Implement get/history/save/current with optimistic base version, idempotency, content hash, size/rate limits, transaction/outbox, and safe conflict payload. Test two users, duplicate save, concurrent tabs, stale base, malformed doc, DB failure, and no source change. Evidence: `minutes-version-api.json`.

## P19-T03 - Flexible accessible desktop editor

Build TipTap editor/toolbar/keyboard commands for all supported structures, drag/reorder where accessible alternative exists, validation, word/status, undo/redo, confirmation resolution, and safe paste. Component tests cover every node/command/paste and vi/en labels. Evidence: `editor-ui-report.json`.

## P19-T04 - Citation rendering and evidence navigation

Render stable citation nodes with source/current projection/time, stale/broken/gap warnings, keyboard activation, and P16 seek/focus return. Test revision/projection change, missing audio, invalid citation proposal, and no arbitrary URL. Evidence: `editor-citation-report.json`.

## P19-T05 - Version list, compare, and restore-as-new

Implement paginated history/provenance, structural diff, selected-version preview, restore command creating a new current version, and cache refresh. Test restored schema migration, concurrent restore/edit, generated-vs-edited lineage, and history immutability. Evidence: `version-history-report.json`.

## P19-T06 - Bounded AI rewrite proposal/diff/accept/reject

Send selected node/range plus schema/context/evidence policy through P17; validate proposal and visible structural/text/citation diff. Reject leaves document unchanged; accept requires current base and creates new version. Test injection/malformed/broken citation/provider failure/cancel/stale selection. Evidence: `rewrite-proposal-report.json`.

## P19-T07 - Offline/conflict/migration/a11y E2E qualification

Run autosave network loss/reload/crash, bounded local journal, concurrent tabs, server rejection, schema upgrade, corrupt journal, restore/rewrite, keyboard-only, screen reader, focus, 200% text, large doc, and malformed paste. Evidence: `evidence/P19/EVIDENCE.md`.

# Subagent work packages

| Package        | Tasks           | Exclusive paths    | Depends on  | Review gate                   |
| -------------- | --------------- | ------------------ | ----------- | ----------------------------- |
| Model/API      | T01,T02,T05 API | domain/API minutes | P18         | schema/auth/version review    |
| Editor UI      | T03-T05 UI      | desktop editor     | T01,T02     | a11y/data-loss review         |
| AI proposal    | T06             | rewrite boundary   | P17,T01,T02 | validation/diff review        |
| Independent QA | T07             | tests/evidence     | all         | conflict/a11y/security review |

# Failure and debugging matrix

| Failure              | Classification | Expected behavior                                     | Recovery/regression |
| -------------------- | -------------- | ----------------------------------------------------- | ------------------- |
| Autosave interrupted | timing         | Bounded local pending state/retry                     | reload/crash E2E    |
| Concurrent update    | concurrency    | Visible conflict, no silent overwrite                 | multi-tab test      |
| Invalid AI proposal  | provider       | Reject before mutation                                | adversarial fixture |
| Restore old version  | state          | New version, full history retained                    | restore test        |
| Broken citation      | contract       | Visible warning and publish policy; no hidden removal | citation test       |

# Integrated verification

Run editor schema property/fuzz/migration, API IDOR/concurrency/idempotency, component/clipboard, offline/reload/multi-tab E2E, citation seek, rewrite failure/diff, performance, keyboard/screen-reader/localization, content/secret scan, and `pnpm verify`.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P19/EVIDENCE.md` |

# Acceptance gate

- [ ] P19-A01 - Users can change every structure/content type supported by the approved schema safely.
- [ ] P19-A02 - Autosave/offline/reload/concurrent conflicts cannot silently lose or overwrite edits.
- [ ] P19-A03 - Save/restore/rewrite produces authorized auditable immutable versions with full provenance.
- [ ] P19-A04 - Transcript/audio evidence remains immutable, reachable, and visibly stale/broken when applicable.
- [ ] P19-A05 - Invalid paste/document/AI output cannot execute or enter stored current document.
- [ ] P19-A06 - Keyboard/screen-reader/large-document critical flows meet targets.

# Migration, rollout, and rollback

Internal synthetic meetings first. Schema migration reads old/write new and retains old snapshot. Rollback opens unsupported newer docs read-only rather than corrupting them.

# Required documentation updates

Data Model/API editor/version/proposal, User Flows controls, Security untrusted document handling, Status/Traceability/Progress, and P19 evidence.

# Conversation boundary

Do not implement export/branding, real-time collaboration, transcript/source mutation, arbitrary HTML/scripts, silent AI edits, or last-write-wins. Stop before P20.

# Handoff record

P20 also requires P10; if verified, report newly unblocked and stop.
