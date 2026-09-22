# P20 integrated evidence

Status: IN_PROGRESS under the deferred qualification policy. P20-T01 now
hardens the safe brand validator against malformed input, empty owner/id,
unversioned metadata, non-string arrays, non-allowlisted fonts/colors, and
unsafe text without throwing. Focused domain export tests pass 3/3, domain
typecheck passes, and simple renderer tests pass 1/1. Audio/DOCX/PDF
renderers, durable export jobs/downloads, library UI, reader/security/
performance, and manual cross-platform gates remain open. P20-T02/T03
continuation adds strict export-manifest validation, idempotent immutable
in-memory job semantics, and deterministic audio package manifest rendering;
domain export tests pass 4/4, exporter tests pass 3/3, and typechecks pass.
Evidence: `RUN-20260813-1550.md`.

P20-T01 asset continuation adds raster-only brand asset validation, active
content/external-reference rejection, 5 MB size and 4096px dimension bounds;
domain export tests pass 5/5 and typecheck passes. Object-store/decode,
polyglot/bomb, authorization and independent security gates remain open.
Evidence: `RUN-20260813-1605.md`.

P20-T01 payload continuation adds declared-content-type magic-byte checks for
PNG/JPEG/WEBP; domain export tests pass 6/6 and typecheck passes. Full decoder,
decompression-bomb/polyglot, storage, authorization and security gates remain
open. Evidence: `RUN-20260813-1606.md`.

P20-T03/T06 continuation adds owner-scoped cancel/retry/history, immutable
completion and expiring download metadata; export job tests pass 2/2 and
export typecheck passes. This is not yet durable P05/P06 integration.
Evidence: `RUN-20260813-1555.md`.

P20-T04 continuation adds a deterministic internal-only DOCX ZIP renderer;
renderer tests pass 3/3 and exporter typecheck passes. The current seam is
not yet the full branded minutes renderer: fonts, tables/citations/layout,
large-document limits, reader and independent security/golden gates remain
open. Evidence: `RUN-20260813-1558.md`.

Mobile P20-T07 continuation adds a title/language/date-bound query helper
with deterministic newest-first ordering; focused library query tests pass
2/2 and mobile typecheck passes. This is a query seam only; complete
desktop/mobile library UI, API filtering, detail/history tabs, cache
synchronization and accessibility qualification remain open.

P20-T07 continuation adds ID-keyed cursor-page merging so later pages replace
stale duplicate records without reordering existing entries; focused library
tests pass 3/3 and mobile typecheck passes. Full API/UI/cache/a11y/latency
qualification remains open. Evidence: `RUN-20260813-1610.md`.

P20-T05 continuation adds a deterministic self-contained PDF 1.4 seam;
renderer tests pass 4/4 and exporter typecheck passes. Approved font/glyph,
print layout, reader, visual/security and large-document qualification remain
open. Evidence: `RUN-20260813-1600.md`.

P20-T04/T05 continuation adds shared fail-closed renderer resource bounds
(100 sections/1,000,000 aggregate characters) before MD/TXT/JSON/DOCX/PDF
rendering; renderer tests pass 5/5 and exporter typecheck passes. Worker CPU,
memory and timeout enforcement plus reader qualification remain open.
Evidence: `RUN-20260813-1608.md`.

P20-T07 API continuation validates the owner-scoped `/v1/meetings` cursor-page
response against `MeetingListResponseSchema` before sending it; isolated
meeting service tests pass 5/5 and API typecheck passes. Route/database,
two-owner E2E, detail/history UI and cache/a11y/latency gates remain open.
Evidence: `RUN-20260813-1613.md`.

P20-T07 detail continuation validates `/v1/meetings/:meetingId` through
`MeetingDetailResponseSchema`; focused meeting service tests pass 5/5 and API
typecheck passes. Real route/database, two-owner E2E, detail/history UI and
cache/a11y/latency gates remain open. Evidence: `RUN-20260813-1615.md`.

P20-T07 DTO continuation makes list-item/list/detail response schemas strict;
unknown fields are rejected rather than stripped. DTO tests pass 2/2, meeting
service tests pass 5/5, and API typecheck passes. Real route/database,
two-owner E2E, UI/cache/a11y/latency gates remain open.
Evidence: `RUN-20260813-1617.md`.

P20-T07 query continuation makes `MeetingListQuerySchema` strict; unsupported
filter fields are rejected. DTO tests pass 2/2, meeting service tests pass
5/5 and API typecheck passes. Route/database/two-owner E2E and full search/UI
qualification remain open. Evidence: `RUN-20260813-1619.md`.

P20-T03 continuation makes `audio` a first-class export job format; same
manifest audio/text requests remain distinct and export tests pass 8/8 with
typecheck passing. Real audio packaging, permission checks, durable worker/
storage integration and cross-format qualification remain open. Evidence:
`RUN-20260813-1622.md`.

P20-T03/T04/T05 continuation makes DOCX and PDF first-class export job
formats alongside MD/TXT/JSON/audio; same-manifest formats remain distinct.
Exporter tests pass 9/9 and typecheck passes. Durable worker/storage,
artifact/download and reader qualification remain open. Evidence:
`RUN-20260813-1624.md`.

P20-T03/T06 continuation adds immutable artifact SHA-256, byte length and
manifest/renderer provenance to completed jobs; exporter tests pass 9/9 and
typecheck passes. Storage-object verification, durable persistence, signed
downloads, cleanup and qualification remain open. Evidence:
`RUN-20260813-1626.md`.

P20-T03/T06 correction measures DOCX/PDF provenance over decoded binary bytes
rather than base64 text; exporter tests pass 10/10 and typecheck passes.
Storage-object verification and durable downloads remain open. Evidence:
`RUN-20260813-1628.md`.

P20-T06 continuation adds provider-neutral stored-artifact verification for
existence, byte length, SHA-256 and content type; exporter tests pass 11/11 and
typecheck passes. P05 ObjectStore/worker/download wiring, signed refresh,
cleanup and real storage integration remain open. Evidence:
`RUN-20260813-1630.md`.

P20-T03/T06 correction (2026-08-14): aligned the exporter format contract with
the persisted `markdown` value and added verified download resolution. Exporter
tests pass 2 files / 11 tests and package typecheck exits 0. The integrated
`pnpm verify` gate is blocked before execution by the pre-existing frozen
lockfile mismatch. Evidence: `RUN-20260814-1918.md`.

Windows desktop qualification continuation (2026-09-22): desktop unit tests
pass 183/183, packaged Electron smoke passes 3/3, Playwright desktop E2E
passes 3/3, TypeScript typecheck and Windows x64 packaging pass. The native
Windows suite passes 78/78 after fixing combined WASAPI flag reporting; the
optional `local-speech` feature passes 101/101 with an MSVC toolchain and its
release sidecar builds. The packaged smoke records synthetic physical audio
into isolated temporary user data, verifies SQLite/hash/provenance, reopens
Library, and exports Markdown. This does not close P20-A01 through P20-A06:
DOCX/PDF target-reader, durable P05/P06 storage/download, two-owner
route/database, accessibility/manual, long-session/provider, and real
model/corpus gates remain open. `pnpm verify` stops at 155 Prettier errors and
desktop ESLint has 5 errors. See `RUN-20260922-windows-desktop.md` and
`windows-desktop-test-report.md`.

Navigation audit continuation (2026-09-22): the Windows E2E suite now executes
8 tests through the root wrapper; 5 pass and 3 expected-failures capture the
simulated-mode title-validation defect and the non-functional Templates and
Settings sidebar buttons. Library refresh and source-mode interactions pass.

Additional integrated-gate checks from the same Windows run: security passes
37/37; contract passes domain 406/406 and API 30/30. Integration fails 5/352
database migration/schema baseline assertions. The root resilience and
performance commands exit zero without selecting any test script, so those
commands produce no evidence and remain open.

Desktop UI E2E continuation (2026-09-22): the expanded suite executes 6 tests
through both direct and root entry points; 5 pass and 1 expected-failure
captures a real defect where Simulated (P11) start checks native availability
before empty-title validation. Mode/source toggles and Library refresh pass.
The defect and exact observed error are recorded in
`RUN-20260922-windows-desktop.md` and
`windows-desktop-test-report.md`.

Renderer/reader continuation (2026-09-22): `@kms/export` passes 11/11 unit
tests. A synthetic DOCX was converted by LibreOffice 26.2.5.2 to PDF, reopened
with pypdf, and rendered to PNG for visual review; expected text and one-page
output were present. Poppler remained unavailable because a concurrent Windows
Installer lock blocked its installation. This does not close the full
target-reader, branded-layout, large-document, or durable-storage gates.

Integration debug continuation (2026-09-22): the database migration-restore
baseline was corrected to match the committed 0000–0013 catalog. The focused
P03-T07 suite passes 29/29, the full database integration suite passes 352/352,
and root `pnpm test:integration` passes API, database, and real Testcontainers
MinIO storage integration. The storage package glob was replaced with an
explicit Windows-safe test path; its MinIO suite passes 15/15. P20 remains
IN_PROGRESS because reader, manual/device, resilience/performance, and
inherited qualification rows remain open.

Resilience/performance continuation (2026-09-22): the root commands remain
invalid zero-test commands. Direct execution of the available Redis-loss
resilience suite used its dedicated Vitest config but could not start because
the required local PostgreSQL endpoint `127.0.0.1:5433` was unavailable; three
scenarios were skipped. No performance suite is registered. No pass is claimed
for either gate.

Desktop lint continuation (2026-09-22): five ESLint errors were removed without
changing runtime behavior (unused imports/fixture state and empty cleanup
blocks). The desktop lint rerun reports 0 errors and 14 existing explicit-
`any` warnings; unit 183/183, typecheck, packaged smoke, and E2E remain green
for their covered scenarios.

Runner isolation continuation (2026-09-22): a concurrent desktop unit plus E2E
run caused two packaged smoke CDP connection timeouts. A serial rerun passed
19 files / 183 tests, confirming runner contention rather than a reproduced
product failure. Electron/CDP desktop gates are recorded as serial-only.

Final verification continuation (2026-09-22): fresh `pnpm verify` validated the
execution plan, then stopped at repository Prettier with 161 files reported.
Desktop lint was independently rerun with 0 errors and 14 warnings. The phase
is not marked VERIFIED.

Final packaged verification (2026-09-22): serial packaged smoke passes 3/3 and
desktop typecheck exits 0. The smoke covers synthetic physical audio,
SQLite/hash/provenance, Library reopen, Markdown export, and concurrency
isolation. Remaining manual/reader/provider and missing-feature gates stay open.
