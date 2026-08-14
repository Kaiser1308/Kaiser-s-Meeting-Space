# P20 Branding, Export, and Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the personal meeting flow with safe brand presets, reproducible exports in six formats, secure artifact history/downloads, and responsive desktop/mobile library views.

**Architecture:** Pin every export to immutable meeting/transcript/minutes/template/brand versions in `ExportManifestV1`. Durable P06 jobs stage validated data into isolated format renderers and store immutable P05 artifacts; library read models extend P10 without becoming authoritative storage.

**Tech Stack:** TypeScript/Zod, Fastify, Drizzle/PostgreSQL, BullMQ, P05 object storage, React/Electron, React Native, DOCX ZIP/XML tooling and isolated Chromium/PDF tooling selected after dependency/license review.

## Global Constraints

- Execute only P20 and stop before P21.
- Consume P10/P19 at `IMPLEMENTED` through the deferred ledger; P20 is feature-complete but not a release gate.
- Exports are pinned to immutable versions and renderer/config/font versions.
- Renderers have no arbitrary network/filesystem/process access and enforce CPU/memory/time/file limits.
- Brand assets reject scripts, external references, polyglots, decompression bombs, and unapproved fonts.
- Downloads are owner-scoped, short-lived, hash-checked; permanent deletion remains P22.

## File Map

- Create `packages/domain/src/export/{brand,manifest,artifact,renderer}.ts` with tests and exports.
- Extend `packages/database/src/schema/{brand,export}.ts`, add repositories `brand.ts`/`export.ts`, migration `0014_brand_exports.sql`, and integration tests.
- Create `packages/export/package.json` with `src/{core,renderers}/{markdown,text,json,audio,docx,pdf}.ts` and tests.
- Create `packages/jobs/src/export/handler.ts` and tests; register with jobs.
- Create `apps/api/src/modules/export/` and extend owner-scoped meeting library routes.
- Create UI under `apps/desktop/src/features/{library,branding,export}/` and `apps/mobile/src/features/{library,export}/`.
- Evidence destination: `docs/execution/evidence/P20/`.

### Task 1: P20-T01 — Safe versioned brand presets

**Interfaces:** Produce `BrandPresetV1Schema`, immutable version/current operations, and validated P05 logo asset refs.

- [ ] Write failing schema/API/storage tests for colors/fonts/header/footer/paper/margins, invalid dimensions/type/size/decode, SVG/external refs, polyglot/bomb, cross-owner access, and version history.
- [ ] Run focused domain/API/storage tests and capture absent validation/lifecycle behavior.
- [ ] Implement strict brand contracts, decoded-image validation, allowlisted fonts/colors, immutable versions, owner scope, and current pointer.
- [ ] Run schema/property, real-storage, API authorization, and malicious fixture tests.
- [ ] Record `brand-security.json`; commit `feat(p20): add safe brand presets`.

### Task 2: P20-T02 — Fully pinned export manifest

**Interfaces:** Produce `ExportManifestV1Schema`, canonical serialization, and SHA-256 input hash over owner/meeting/projection/minutes/template/brand/locale/timezone/renderer/config/font/format/options.

- [ ] Add failing tests for cross-owner/meeting refs, edit during export, stale/deleted/missing version, duplicate/unsupported options, locale/timezone/font differences, and deterministic hash.
- [ ] Run `pnpm --filter @kms/domain exec vitest run src/export/manifest.test.ts` and capture missing contract failure.
- [ ] Implement strict manifest plus repository snapshot resolution in one transaction.
- [ ] Run deterministic/hash/property and PostgreSQL reference tests.
- [ ] Record `export-manifest.json`; commit `feat(p20): pin export manifests`.

### Task 3: P20-T03 — Simple and authorized audio exports

**Interfaces:** `ExportRenderer.render(manifest, stagedInputs): Promise<RenderedArtifact>`; implement Markdown, TXT, JSON, and authorized audio package with stable ordering/encoding/metadata.

- [ ] Create reusable renderer conformance and failing golden tests for vi/en, citations, confirmations, source tracks, gaps manifest, authorization, cancellation, retry, and deterministic semantics.
- [ ] Run the absent renderer/job tests and capture failures.
- [ ] Implement `@kms/export`, simple/audio renderers, staged inputs, P06 handler, P05 write/hash metadata, and idempotency by owner+manifest hash.
- [ ] Run renderer golden, jobs fault, real-storage, and permission tests.
- [ ] Record `simple-export-report.json`; commit `feat(p20): export simple and audio formats`.

### Task 4: P20-T04 — Sandboxed DOCX renderer

**Interfaces:** Produce macro-free DOCX ZIP/XML with internal-only relationships, pinned styles/fonts, and complete structured minutes semantics.

- [ ] Approve/pin DOCX dependencies and add failing ZIP/XML/golden tests for headings, paragraphs, tables, checklists, citations, confirmations, headers/footers, pagination, vi/en glyphs, external relationships, macros, malicious inputs, timeout, and large docs.
- [ ] Run focused renderer tests and verify expected missing implementation failure.
- [ ] Implement isolated DOCX renderer with allowlisted relationship/content types and deterministic semantic output.
- [ ] Run parsed ZIP/XML tests plus target Office/LibreOffice reader smoke where available.
- [ ] Record `docx-golden-report.json`; commit `feat(p20): render deterministic DOCX`.

### Task 5: P20-T05 — Sandboxed PDF renderer

**Interfaces:** Produce PDF through an isolated renderer with embedded approved fonts, blocked external fetch/local paths, resource bounds, metadata, links/bookmarks, and tagging where supported.

- [ ] Approve/pin PDF tooling and add failing visual/text/glyph/security/resource tests for page breaks, headers/footers, citations, vi/en, malicious URLs/files, worker hang/crash, and large docs.
- [ ] Run focused renderer tests and capture missing sandbox behavior.
- [ ] Implement print renderer with network disabled, staged-only input, approved embedded fonts, deterministic layout/config version, and hard timeout/resource cleanup.
- [ ] Run PDF parse/text extraction, visual golden, reader smoke, accessibility checks, and sandbox probes.
- [ ] Record `pdf-golden-report.json`; commit `feat(p20): render sandboxed PDF`.

### Task 6: P20-T06 — Export API, history, expiry, download

**Interfaces:** Produce owner-scoped request/status/cancel/history/retry and artifact manifest/hash/expiry/download refresh operations.

- [ ] Add failing API/database/storage tests for two owners, leaked/expired URL, duplicate/retry, missing/hash-mismatch artifact, soft-deleted meeting, rate/size bounds, and renderer failure.
- [ ] Run focused integration and capture missing behavior.
- [ ] Add export repository/migration/routes/services, short scoped P05 URLs, cancellation/retry, immutable artifacts, and cleanup eligibility only.
- [ ] Run PostgreSQL/MinIO/API/jobs integration and security tests.
- [ ] Record `export-api-security.json`; commit `feat(p20): secure export lifecycle`.

### Task 7: P20-T07 — Complete personal library

**Interfaces:** Extend P10 cursor library to search title/speaker/transcript/minutes and filter date/language/duration/completeness/artifact/deletion; detail exposes transcript/minutes/export/playback states.

- [ ] Add failing repository/API/client tests for two owners, vi/en search, deterministic cursor pagination, stale cache, soft deletion, large result sets, filters, detail tabs, export history, playback, keyboard/screen reader, and latency.
- [ ] Run P10 library regressions and new focused tests; capture missing read-model/UI behavior.
- [ ] Implement PostgreSQL read model/indexes, API response contracts, desktop full UI, mobile lightweight UI, and cache invalidation from outbox/SSE events.
- [ ] Run database query-plan/performance, API contract, mobile/desktop component/E2E, accessibility, and playback regressions.
- [ ] Record `library-qualification.json`; commit `feat(p20): complete personal meeting library`.

### Task 8: P20-T08 — Cross-format qualification and handoff

**Interfaces:** Produce reader/security/performance evidence for Markdown, TXT, JSON, audio, DOCX, and PDF from the same pinned manifest.

- [ ] Run fixed vi/en complex/large documents through all renderers and compare parsed semantics, citations, branding, hashes, and provenance.
- [ ] Open DOCX/PDF in required target readers/platforms and run malicious logo/document/URL, worker crash/hang, owner/expiry, missing glyph, and resource-budget cases.
- [ ] Run library/export E2E, security/a11y/localization/performance suites and `pnpm verify`; record exact outputs and unavailable manual gates.
- [ ] Map P20-A01 through P20-A06; keep P20 and inherited rows at `IMPLEMENTED` until integrated physical/provider/reader evidence closes.
- [ ] Update evidence/status/traceability/progress, run GitNexus change detection, and stop before P21.

## Final Review Checklist

- [ ] All six formats resolve the same pinned immutable inputs.
- [ ] Renderer sandbox probes prove no arbitrary network/path/process access.
- [ ] Artifacts and downloads are owner-scoped, expiring, and hash verified.
- [ ] Library search/detail/playback/export works on desktop and lightweight mobile.
- [ ] P20 is reported as feature-complete implementation, never release or verification while ledger rows are open.
