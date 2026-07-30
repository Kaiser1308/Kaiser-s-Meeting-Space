---
phase: P20
title: Branding, reproducible exports, and complete meeting library
packet_status: ACCEPTED
depends_on: [P10, P19]
requirements: [FR-6, FR-7, NFR-Security, NFR-Accessibility]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Users manage a complete personal meeting library, apply reusable safe brand presets, and asynchronously export a pinned immutable meeting/transcript/minutes/template/brand version to Markdown, TXT, JSON, DOCX, PDF, and authorized audio packages. Artifacts are reproducible, owner-scoped, sandboxed, accessible where supported, and open correctly across target readers.

# Authoritative context

Read PRD FR-6/FR-7, User Flows library/export, Data Model brand/export, API minutes/export/library, Security file/object threats, P10 library/playback, P16 evidence, P19 editor/version evidence, and Operations export incidents.

# Preconditions and external prerequisites

P10/P19 are `VERIFIED`; P06/P05 are transitively available, approved fonts/licenses/rendering dependencies and Office/PDF readers are available. Visual/manual cross-platform reader evidence is required.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P10        | Verified outputs and invariants consumed by this packet. | `../evidence/P10/EVIDENCE.md` | VERIFIED          |
| P19        | Verified outputs and invariants consumed by this packet. | `../evidence/P19/EVIDENCE.md` | VERIFIED          |

# Scope firewall

**Allowed:** brand schemas/assets/UI, export manifest/jobs/renderers/sandbox/history/download, desktop/mobile library/detail/search/filter, golden/visual/security/performance/a11y tests.

**Forbidden/out:** permanent deletion policy (P22), public sharing/team library, client HTML as export source, arbitrary network/filesystem renderer access, macros/scripts, mutable-version export, or new search service without measurements.

**Extension seams:** `ExportRenderer` capability per format and versioned brand/document manifest; renderer workers are isolated.

# Contracts and invariants

- Brand preset pins owner/version/logo asset hash, allowlisted colors/fonts, header/footer/page settings; raw untrusted SVG/script/external URL is rejected/sanitized by policy.
- `ExportManifestV1` pins meeting, transcript projection, minutes/template/brand versions, locale/timezone, renderer/config/font versions, format/options, input hash.
- Job is idempotent by owner/manifest hash; output object metadata/hash/size/provenance immutable.
- Renderers receive only staged validated inputs, no arbitrary network/path/process, with CPU/memory/time/file limits.
- Downloads use P05 short owner-scoped URLs; library queries are owner-scoped/cursor-paginated and respect soft-deleted state.

# File and ownership map

| Path                                   | Responsibility                          | Owner                |
| -------------------------------------- | --------------------------------------- | -------------------- |
| domain brand/export schemas            | preset/request/manifest/artifact        | Export core          |
| API/worker export modules              | auth/jobs/history/storage/download      | Export core          |
| renderer packages/workers              | MD/TXT/JSON/audio/DOCX/PDF              | Renderers            |
| desktop/mobile library/brand/export UI | search/detail/preset/request/history    | Library UI           |
| export golden/visual/security tests    | file readers/malicious input/large docs | Independent reviewer |

# Ordered task packets

## P20-T01 - Safe versioned brand preset and asset lifecycle

Define/runtime-test logo/color/font/header/footer/paper/margins/pagination/locale and immutable versions/current pointer. Validate type/size/dimensions/decode, sanitize/reject SVG/external refs, store via P05, authorize owner, and test malicious/polyglot/bomb/cross-user. Evidence: `evidence/P20/brand-security.json`.

## P20-T02 - Fully pinned export manifest

Define request/manifest/input snapshot/hash and ensure all referenced versions belong to same owner/meeting and remain available. Test edit during export, stale/deleted/missing versions, duplicate options, timezone/locale/font, and deterministic hash. Evidence: `export-manifest.json`.

## P20-T03 - Idempotent simple/audio export jobs

Implement Markdown/TXT/JSON and authorized audio package renderers through P06 jobs, staged validated inputs, P05 output, cancellation/retry, and deterministic metadata/order/encoding. Golden tests compare parsed semantic output and verify audio source tracks/gap manifest/permissions. Evidence: `simple-export-report.json`.

## P20-T04 - Sandboxed deterministic DOCX renderer

Render full structured minutes, tables/checklists/citations/confirmation/headers/footers/page/font/vi-en content with no macros/external relationships. Tests inspect ZIP/XML structure, deterministic semantics, reader compatibility, large docs, malicious inputs, and timeout/resource bounds. Evidence: `docx-golden-report.json`.

## P20-T05 - Sandboxed deterministic PDF renderer

Render print CSS/Chromium in isolated worker with embedded approved fonts, page breaks/header/footer/bookmarks/links/metadata/tagging where supported and no external fetch/local access. Run visual/glyph/text extraction/reader/a11y/security/large-doc tests. Evidence: `pdf-golden-report.json`.

## P20-T06 - Export history, expiry, and secure download

Implement owner-scoped request/status/cancel/history/retry, artifact manifest/hash/expiry, signed download refresh, storage cleanup eligibility, and safe errors. Test two users, leaked/expired URL, duplicate/retry, artifact missing/hash mismatch, soft delete, and rate/size limits. Evidence: `export-api-security.json`.

## P20-T07 - Complete personal meeting library and detail

Extend P10 library for owner-scoped title/speaker/transcript/minutes search, filters/date/language/duration/completeness/artifact/deletion state, cursor order, detail tabs, version/export history, mobile lightweight/desktop full UI, cache updates and accessibility. Tests cover two owners, large pagination, stale cache, soft deletion, vi/en search, keyboard/screen reader, and latency budgets. Evidence: `library-qualification.json`.

## P20-T08 - Cross-format/reader/security/performance qualification

Run fixed vi/en complex/large documents through every format, inspect/reopen in target readers/platforms, compare pinned content/citations/branding, visual pages, malicious logos/docs/URLs, worker crash, authorization, expiry, and resource budgets. Evidence: `evidence/P20/EVIDENCE.md`.

# Subagent work packages

| Package                   | Tasks       | Exclusive paths                | Depends on  | Review gate                      |
| ------------------------- | ----------- | ------------------------------ | ----------- | -------------------------------- |
| Export core               | T01-T03,T06 | domain/API/jobs/simple formats | P19,P05,P06 | manifest/auth/idempotency review |
| Renderers                 | T04,T05     | isolated renderer workers      | T02         | sandbox/visual review            |
| Library UI                | T07         | desktop/mobile library         | P10,P19     | search/a11y review               |
| Independent qualification | T08         | tests/evidence                 | all         | reader/security/perf review      |

# Failure and debugging matrix

| Failure                   | Classification | Expected behavior                             | Recovery/regression |
| ------------------------- | -------------- | --------------------------------------------- | ------------------- |
| Renderer crashes/hangs    | platform       | Bounded fail/retry; prior/source unaffected   | kill/timeout test   |
| Malicious logo/document   | security       | Reject/sandbox; no fetch/code/path access     | adversarial corpus  |
| Minutes edited mid-export | concurrency    | Artifact remains pinned to requested version  | race test           |
| URL leaked/expired        | security       | Scope/expiry deny; refresh requires owner     | two-user/time test  |
| Missing glyph             | contract       | Golden failure and approved embedded fallback | vi/en glyph test    |

# Integrated verification

Run brand/export contracts, job/storage/auth integration, renderer sandbox/security, DOCX/PDF golden/visual/extraction/reader smoke, simple format snapshots, library search/performance/E2E, download expiry/two-user, a11y/localization, and `pnpm verify`.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P20/EVIDENCE.md` |

# Acceptance gate

- [ ] P20-A01 - All required formats open in target readers and preserve pinned content/citations/branding.
- [ ] P20-A02 - Every artifact is reproducible/auditable from immutable manifest/hash/provenance.
- [ ] P20-A03 - Renderers cannot access arbitrary network/filesystem/process and remain resource bounded.
- [ ] P20-A04 - Personal-scale library search/filter/detail/version/export workflows meet responsiveness/a11y targets.
- [ ] P20-A05 - Export/history/download authorization, expiry, replay, soft-delete, and missing-artifact behavior pass.
- [ ] P20-A06 - Malicious inputs and vi/en glyph/layout cases pass independent qualification.

# Migration, rollout, and rollback

Enable simple formats first, then DOCX/PDF after approval. Renderer version remains pinned for historical reproducibility. Rollback disables new jobs/download generation, preserving prior artifacts per P22 policy.

# Required documentation updates

API/Data Model export/library, User Flows, Security renderer boundary, Operations export runbook, Status/Traceability/Progress, and P20 evidence.

# Conversation boundary

Do not implement permanent deletion policy, public/team sharing, mutable-version exports, arbitrary renderer network/filesystem access, or new search infrastructure. Stop before P21.

# Handoff record

Unblock P21 only.
