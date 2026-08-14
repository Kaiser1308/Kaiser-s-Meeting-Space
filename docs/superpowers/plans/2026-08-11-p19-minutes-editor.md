# P19 Minutes Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe desktop minutes editor with immutable autosaved versions, citation navigation, history/restore, and explicit AI rewrite proposals.

**Architecture:** Define a versioned JSON document model independent of the editor library, persist immutable snapshots with optimistic concurrency, and keep a bounded local autosave journal until server acknowledgement. TipTap/ProseMirror adapts to the domain schema; AI rewrites return validated diffs and never mutate without explicit acceptance.

**Tech Stack:** TypeScript/Zod, TipTap/ProseMirror after version/license approval, React/Electron, Fastify, Drizzle/PostgreSQL, Vitest/fast-check, Playwright.

## Global Constraints

- Execute only P19 and stop before P20.
- Consume P18 at `IMPLEMENTED` through the deferred ledger; open rows cap P19 at `IMPLEMENTED`.
- Stored documents contain no executable/raw unsafe HTML, scripts, macros, or arbitrary URLs.
- Save/restore/rewrite creates immutable versions; no last-write-wins behavior.
- Transcript/audio evidence remains immutable and citations cannot be silently removed.
- Full editing is desktop-only; mobile full editor and collaboration are out of scope.

## File Map

- Create `packages/domain/src/editor/{schema,migrations,serialization,diff}.ts` with tests and exports.
- Extend `packages/database/src/schema/minutes.ts` and `repositories/minutes.ts`; add migration `0013_minutes_editor.sql` and integration tests.
- Create `apps/api/src/modules/minutes-editor/{dto,service,routes,index}.ts` and tests.
- Create `apps/desktop/src/features/minutes-editor/` with editor, toolbar, citations, history, compare, rewrite, journal, and tests.
- Create Playwright scenarios under `apps/desktop/e2e/minutes-editor/editor.spec.ts` and add the missing `test:e2e` script/harness to `apps/desktop/package.json` within P19-T07.
- Evidence destination: `docs/execution/evidence/P19/`.

### Task 1: P19-T01 — Safe versioned document schema

**Interfaces:** Produce `MinutesDocumentV1Schema`, stable node IDs, deterministic P18 conversion, serialization, and version migrations.

- [ ] Write failing schema/property/fuzz tests for all supported nodes/marks, duplicate IDs, malformed/deep/large/cyclic data, script/HTML/URL injection, old-version migration, and round trip.
- [ ] Run `pnpm --filter @kms/domain exec vitest run src/editor/schema.test.ts src/editor/migrations.test.ts`; require missing-model failures.
- [ ] Implement strict document nodes for headings, paragraphs, lists/checklists, tables, citations, confirmations, and custom fields; reject unknown executable content.
- [ ] Run domain tests/typecheck and P18 conversion fixtures.
- [ ] Record `editor-schema.json`; commit `feat(p19): define safe minutes document`.

### Task 2: P19-T02 — Immutable versions and autosave API

**Interfaces:** Produce get/history/save/current API with owner, document, base version, idempotency, content hash, bounds, and typed conflict payload.

- [ ] Add failing API/repository tests for two owners, duplicate save, concurrent tabs, stale base, malformed document, size/rate limits, transaction failure, and source unchanged.
- [ ] Run focused API/PostgreSQL tests and capture missing conflict/version behavior.
- [ ] Add additive schema/repository/migration and routes; atomically insert an immutable snapshot, update current, and emit outbox.
- [ ] Run migration, integration, API contract, idempotency, and source-mutation-negative suites.
- [ ] Record `minutes-version-api.json`; commit `feat(p19): save immutable minutes versions`.

### Task 3: P19-T03 — Accessible desktop editor

**Interfaces:** Adapt TipTap commands to/from `MinutesDocumentV1`; expose toolbar/keyboard operations for every supported structure and an accessible reorder alternative.

- [ ] Approve/pin dependency versions and add failing component tests for every node/command, undo/redo, safe paste, confirmation resolution, reorder, validation, word/status, vi/en labels, keyboard and screen reader semantics.
- [ ] Run focused desktop tests and capture missing editor behavior.
- [ ] Implement editor adapter/components/styles; sanitize paste by converting only allowlisted document nodes.
- [ ] Run component tests/typecheck and keyboard/focus/200% text checks.
- [ ] Record `editor-ui-report.json`; commit `feat(p19): build accessible minutes editor`.

### Task 4: P19-T04 — Citation rendering and evidence navigation

**Interfaces:** Citation nodes pin P16 evidence refs and invoke an owner-scoped player target with focus-return token.

- [ ] Add failing tests for exact seek, projection revision, stale/broken/gap state, missing audio, invalid citation proposal, keyboard activation, focus return, and arbitrary URL rejection.
- [ ] Run editor/player/API tests and capture intended failures.
- [ ] Implement citation node/view and P16 evidence adapter; preserve visible warnings and never silently strip invalid refs.
- [ ] Run P16 evidence regressions plus component/E2E tests.
- [ ] Record `editor-citation-report.json`; commit `feat(p19): navigate minutes citations`.

### Task 5: P19-T05 — History, compare, and restore-as-new

**Interfaces:** Produce cursor-paginated immutable history, structural diff, read-only preview, and restore command requiring current base version.

- [ ] Add failing API/component tests for pagination, generated-vs-edited provenance, schema-migrated old versions, concurrent restore/edit, cache refresh, and history immutability.
- [ ] Run focused tests and confirm missing history/restore behavior.
- [ ] Implement structural diff with stable node IDs and restore that creates a new current version without deleting history.
- [ ] Run API/database/component tests and deterministic diff snapshots.
- [ ] Record `version-history-report.json`; commit `feat(p19): add minutes history and restore`.

### Task 6: P19-T06 — Bounded AI rewrite proposals

**Interfaces:** Selected node/range goes through P17 and returns a schema/citation-valid `RewriteProposal`; accept requires unchanged selection/base and creates a new version.

- [ ] Add failing tests for reject/no mutation, accept/new version, stale selection/base, malformed/injected output, broken citation, provider failure, cancel, and oversized selection.
- [ ] Run focused P17/API/editor tests and capture missing proposal boundary.
- [ ] Implement proposal request, validation, visible structural/text/citation diff, explicit accept/reject, and current-base recheck.
- [ ] Run adversarial, API authorization, version, and UI diff tests.
- [ ] Record `rewrite-proposal-report.json`; commit `feat(p19): add bounded rewrite proposals`.

### Task 7: P19-T07 — Offline journal, accessibility, and handoff

**Interfaces:** Produce bounded/versioned local journal entries removed only after matching server acknowledgement; corruption yields recoverable read-only state.

- [ ] Add failing E2E tests for network loss/reload/crash, pending retry, concurrent tabs, server rejection, schema upgrade, corrupt journal, restore/rewrite, large document, malformed paste, keyboard/screen reader/focus/200% text.
- [ ] Implement journal bounds, atomic local writes, acknowledgement matching, conflict UI, and safe corruption recovery.
- [ ] Run desktop unit/E2E/performance/a11y/security suites and `pnpm verify`; record exact results.
- [ ] Map P19-A01 through P19-A06; manual/environment gaps remain open and inherited rows cap verification.
- [ ] Update evidence/status/traceability/progress, run GitNexus change detection, and stop before P20.

## Final Review Checklist

- [ ] Every supported structure is editable through schema-valid commands.
- [ ] Offline/reload/concurrent paths cannot silently lose or overwrite edits.
- [ ] Restore and rewrite always create attributable immutable versions.
- [ ] Unsafe paste/provider output cannot enter storage or execute.
- [ ] Citation and accessibility states have direct evidence or remain open.
