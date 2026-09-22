# Requirement Traceability

**Status:** Accepted planning baseline
**Last reviewed:** 2026-08-11

Exact test and report links are added only after execution. A missing evidence cell prevents `VERIFIED`.

Platform-scope decision (2026-07-31): ADR-007 makes Android the sole supported
mobile product platform. Existing iOS implementation is retained as a dormant,
non-gating reserve. Earlier Android/iOS entries below remain historical facts;
all prospective release evidence and RA-1 qualification target Windows and
Android.

Deferred end-to-end qualification policy (2026-08-11): the open physical,
route, provider, and integrated rows are explicitly listed in
`docs/execution/DEFERRED_END_TO_END_QUALIFICATION.md`. P10-P20 may implement
against the documented contracts while inheriting those rows, but no affected
phase may claim `VERIFIED`; P27 must reject an open row before release.

P12 corrective review (2026-07-27): implementation evidence is recorded in `docs/execution/evidence/P12/EVIDENCE.md`, but the phase remains `IMPLEMENTED` pending P05 dependency verification and the direct two-hour/device/application qualification matrix.

P13 real-speech closure (2026-07-28): commit `94f0050` replaces the native local-speech stub with a SHA-256-verified `whisper-rs` vi/en engine and verified WAV-range boundary. `cargo check -p kms-native` passes; native test executable linking and real-model/corpus, Windows qualification, and Deepgram live gates remain open.

P13 gate-closure rerun (2026-07-29): `scripts/p13-local-evaluation.mjs` fails closed with `missing_audio_asset` for all 10 frozen entries; `scripts/p13-deepgram-live.mjs` fails closed with `missing_rotated_server_key`; native compile is blocked before tests by missing `libclang.dll`. P13 remains `IMPLEMENTED`; no quality or live-provider evidence is claimed. See `docs/execution/evidence/P13/RUN-20260729-1200.md`.

P13 native continuation (2026-07-29): temporary path/CMake setup yields a real `cargo check -p kms-native` exit 0 and matching vi/en model hashes; native test-link reaches `rust-lld` but exits 101 on mixed `libstdc++`/`libc++` duplicate symbols. This is not accepted as native qualification evidence. See `docs/execution/evidence/P13/RUN-20260729-2300.md`.

P10/P13 verification attempt (2026-07-30): the shared Vitest/Vite peer-resolution defect was repaired and 531 focused regressions passed. P10 physical qualification remains unavailable (no Android/iOS device matrix); P13 quality and live-provider runners fail closed for missing corpus WAV assets and a rotated server secret. No acceptance gate was waived; both phases remain `IMPLEMENTED`. See `docs/execution/evidence/P10/RUN-20260730-verify-attempt.md` and `docs/execution/evidence/P13/RUN-20260730-verify-attempt.md`.

P05 verification continuation (2026-08-04): storage unit (110), real MinIO (20), and PostgreSQL + MinIO audio-route (19) tests pass; completion failures persist orphan candidates outside the rolled-back transaction and manifest reads enforce owner isolation. P05 remains IMPLEMENTED because the repository-wide binary gate reaches format check but reports 72 unrelated violations. See `docs/execution/evidence/P05/EVIDENCE.md`.

P05 verification closure (2026-08-05): the expanded cleanup repaired repository format/lint/typecheck and Windows integration-script gates without changing immutable audio/source artifacts. Full `pnpm verify` exits 0: execution plan validation, Prettier, ESLint (0 errors), all workspace typechecks, unit, integration (including 20 MinIO and 19 API real-storage tests), contract, and build. P05 is VERIFIED. See `docs/execution/evidence/P05/EVIDENCE.md`.

P08 continuation (2026-08-05): the portable short virtual store now resolves to
`C:\q3`; mobile typecheck and the 42-file/247-test unit gate pass, and the
Android release build/install pass without CMake object-path or dirty-Ninja
failures. The platform secure-storage adapter delegates to Expo SecureStore;
real-device restart/logout/restart evidence now passes on `fd12a6a7`, while the
remaining TalkBack traversal is still a manual gate, so P08 remains IMPLEMENTED.

P09 qualification continuation (2026-07-30): the supplied Android CPH2699 was enumerated but remained ADB `unauthorized`; therefore P09-A04/P09-A05/P09-T07 have no physical evidence and remain BLOCKED. See `docs/execution/evidence/P09/RUN-20260730-2212.md`.

P09 verification continuation (2026-08-06): package-local mobile-audio (46/46) and mobile (247/247) tests plus both package typechecks passed. No Android device was attached (`adb devices -l` empty), so P09-A04/P09-A05/P09-T07 remain BLOCKED; the complete pnpm/Gradle gates were also unavailable due workspace-store SQLite and wrapper-network failures. See `docs/execution/evidence/P09/RUN-20260806-1325.md`.

P09 native runtime continuation (2026-08-06): the Android release APK was rebuilt
and installed on CPH2699/API 36; readiness reported native capture available,
explicit start succeeded, and AudioFlinger exposed the built-in microphone input
thread. Mobile-audio 46/46, mobile 249/249, and both typechecks passed. This is
smoke evidence only: P09-A04 interruption/route/background/restart and P09-A05
two-hour qualification remain open, so P09 remains IMPLEMENTED. See
`docs/execution/evidence/P09/RUN-20260806-1355.md`.

P09 controls/recovery continuation (2026-08-06): CPH2699/API 36 directly
exercised recovery-marker routing/discard, native start, pause/resume, and
short background return. End remained `stopping` with zero committed chunks;
phone-call/Bluetooth and two-hour cases remain unrun. P09 remains IMPLEMENTED.
See `docs/execution/evidence/P09/RUN-20260806-1445.md`.

P08 verification continuation (2026-08-05): root Metro/Gradle path fix and hoisted pnpm native layout remove the deep CMake object path failure; 41 mobile test files / 240 tests, typecheck, arm64 release build, and WCAG contrast assertions pass. Android CPH2699/API 36 directly exercised vi/en UI, meeting-language controls, 200% text, portrait, and WMS-confirmed landscape bounds. TalkBack, permission denial/retry, offline/delayed processing, cloud-consent physical coverage, and independent review remain open; P08 stays IMPLEMENTED. See `docs/execution/evidence/P08/RUN-20260805-verify-continuation.md`.
P08 verification continuation (2026-08-05, latest run): the rebuilt arm64 APK
was exercised on Android CPH2699/API 36. Clean pnpm/CMake path evidence,
mobile typecheck/246 tests, Home → setup → permission → Readiness, and a real
Wi-Fi/mobile-data-off delayed-processing warning with local-safe copy are
recorded. TalkBack was enabled and Home focus traversal was observed, but the
complete setup/permission/readiness traversal and dynamic focus proof remain
open. P08 remains IMPLEMENTED pending A04-05/A04-09 closure and independent
review. See `docs/execution/evidence/P08/physical-accessibility-matrix.md` and
`RUN-20260805-root-path-and-apk.md`.

P06 verification closure (2026-07-27): PostgreSQL outbox leasing/CAS and live Redis-loss/rebuild evidence are recorded in `docs/execution/evidence/P06/EVIDENCE.md` and `RUN-20260727-2047.md`; repository-wide `pnpm verify` completed with exit 0, so P06 is `VERIFIED`.

P04 verification closure (2026-08-06): P04-A01 through P04-A06 are mapped in
`docs/execution/evidence/P04/EVIDENCE.md`. The security runner now executes 4
files / 37 tests; Android CPH2699/API 36 restart evidence exercises the real
Expo SecureStore path; Windows native keytar synthetic write/read/delete passes;
and the currently registered API routes are enumerated in
`docs/execution/evidence/P04/route-matrix.json`. Target-contract routes not yet
registered remain successor-phase scope. Docker 29.6.2 was available for the
fresh rerun and `pnpm verify` exits 0; P04 is VERIFIED.

P09 physical End fix (2026-08-06): CPH2699/API 36 produced a durable chunk and
returned to `idle` with one committed chunk and a finalized local manifest. The
detached Expo event emitter was fixed, and native writer finalization now drains
before close. Phone-call/Bluetooth/full interruption coverage and the two-hour
run remain open; P09 stays IMPLEMENTED. See
`docs/execution/evidence/P09/RUN-20260806-1615.md`.

P09 qualification continuation (2026-08-06): CPH2699 directly verified real
camera microphone contention with pause/resume, Bluetooth route toggling,
repeated End finalization, and truthful force-stop recovery. Wired headset was
not physically available for a valid plug/unplug run; automated lock/unlock
remained on keyguard. P09-A05's two-hour run remains open, so P09 stays
IMPLEMENTED. See `docs/execution/evidence/P09/RUN-20260806-1615.md`.

P09-A05 retry (2026-08-07): a fresh real CPH2699 capture ran for approximately
44 minutes with writer progress to 277,909,504 bytes, then lost ADB transport.
The two-hour duration and clean finalization remain unverified; no PASS claim.

P14 implementation continuation (2026-08-11): finalization/backfill contracts,
source verification, resumable jobs, reconciliation, speaker evidence,
cloud-check consent gating, completeness, and client status surfaces are now
implemented. Isolated P14 and neighboring regression tests, six typechecks,
scoped lint/format, execution-plan validation, and synthetic smoke passed.
Real infrastructure/provider/device/two-hour/security/resilience/performance
qualification remains OPEN, so P14 is IMPLEMENTED rather than VERIFIED. See
`docs/execution/evidence/P14/EVIDENCE.md` and
`docs/execution/evidence/P14/RUN-20260811-2059.md`.

P14 qualification continuation (2026-08-12): migration integration passed 323/323,
storage/API real-service suites passed, and disposable Redis-loss resilience passed
3/3. A missing resilience Vitest root config was added; migration inventory
expectations were updated to the current schema. P14 remains IMPLEMENTED because
ADB/device, provider, two-hour, inherited, security, performance, and full release
gates remain open. See `docs/execution/evidence/P14/RUN-20260812-1630.md`.

P14 physical smoke continuation (2026-08-12): OPPO CPH2699/Android 16 passed
native readiness, microphone permission, start, pause/resume, End/drain, and
two durable chunks. Recovery discard now returns to titled setup; local Expo
module autolinking includes `apps/mobile/modules`. P14 remains IMPLEMENTED pending
two-hour/provider/inherited/security/performance/release qualification.

P15 implementation continuation (2026-08-11): translation is IMPLEMENTED under
the deferred policy. The strict vi/en opposite-language contract, policy guard,
deterministic and server-secret adapter seams, append-only lineage migration,
authorization-first job, provisional/final read model, mobile/desktop
projections, and synthetic corpus are directly tested. Six typechecks, 16
focused translation tests, one schema test, scoped lint/format/diff, execution
plan, and migration static checks pass. Live provider quality/cost/latency,
real infrastructure, full E2E, and inherited rows remain OPEN. See
`docs/execution/evidence/P15/EVIDENCE.md` and
`docs/execution/evidence/P15/RUN-20260811-2200.md`.

P16-T01 implementation continuation (2026-08-11): the transcript review
projection is IMPLEMENTED under the deferred qualification policy. Canonical
provenance parent/manifest/range/metadata validation, deterministic replay,
version-pinned speaker mappings, linear revisions, conflict-safe decisions,
chronological output, and source-preserving alternatives are covered by the
12/12 focused suite and independent acceptance review. T02-T07 and live,
provider, database-service, device/accessibility, and two-hour qualification
gates remain OPEN. Evidence: `docs/execution/evidence/P16/RUN-20260811-2245.md`.

P16-T02 implementation continuation (2026-08-12): owner-scoped transcript
run/comparison/revision API and additive persistence are IMPLEMENTED under the
deferred policy. Owner/meeting/segment/parent isolation, per-run immutable
lineage, CAS version conflicts, idempotency fingerprints, safe DTOs,
pagination, content-free outbox invalidation, and source-mutation-negative
boundaries are covered by 6/6 focused domain/database contract tests and an
independent acceptance review. Workspace alias declarations block the full
package typecheck; live infrastructure and inherited qualification remain
OPEN. Evidence: `docs/execution/evidence/P16/revision-api.json`.

## Product and architecture requirements

| Requirement / invariant                                                  | Implementation phases       | Verification phases     | Required evidence target                                                                                                                           |
| ------------------------------------------------------------------------ | --------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1 explicit title/language/mode/source/speech-policy/readiness/consent | P02,P08,P11                 | P08,P11,P24,P27         | versioned policy/start-flow contract, cloud-scope consent, mobile/desktop E2E, a11y/localization matrix                                            |
| FR-2 local-first recording lifecycle                                     | P02,P05,P07,P09,P10,P12     | P09,P10,P12,P14,P24,P27 | chunk integrity, crash recovery, physical-device, two-hour reports                                                                                 |
| FR-3 immutable transcript runs/projections and separate translation      | P02,P03,P13,P14,P15         | P14,P15,P16,P21,P24,P27 | policy/run/part conformance, deterministic windows, reconciliation, lineage and mutation-negative tests                                            |
| FR-4 final modes, completeness, provenance review, partial warning       | P07,P10,P14,P16             | P14,P16,P24,P27         | final-run fault/resume matrix, range accounting, comparison/decision and completeness E2E                                                          |
| FR-5 detailed evidence-linked minutes                                    | P17,P18,P19                 | P18,P19,P24,P27         | fixed-corpus scorecard, citation/coverage report, version audit                                                                                    |
| FR-6 editor, branding, version-pinned export                             | P19,P20                     | P20,P21,P24,P27         | editor conflict/a11y tests and export golden/security matrix                                                                                       |
| FR-7 library, search, soft/permanent deletion                            | P03,P04,P10,P20,P22         | P22,P24,P25,P27         | two-user search/library E2E and complete deletion/backup-aging drill                                                                               |
| Reliability: no acknowledged chunk loss                                  | P05,P07,P09,P10,P12,P14     | P14,P24,P27             | crash-boundary, checksum, reconciliation, two-hour fault reports                                                                                   |
| Reliability: retryable mutations are idempotent                          | P02-P07,P10,P13-P20,P22     | P21,P24,P27             | replay/concurrency/property matrices by route/job                                                                                                  |
| Performance: controls <200 ms, live p95 <3 s, local RTF ≤1               | P09,P12,P13,P16             | P24,P27                 | device/live latency, WER/timestamp/RTF/cancel and review UI performance reports                                                                    |
| Scalability: async work and horizontal job isolation                     | P06,P13-P15,P17,P18,P20     | P23,P24,P25,P27         | queue saturation, worker scaling, backlog recovery reports                                                                                         |
| Security: owner isolation, secrets, least privilege                      | P04,P05,P11,P13,P17,P20,P21 | P21,P25-P27             | P04 implementation evidence in `docs/execution/evidence/P04/EVIDENCE.md`; route/URL/IPC matrix, scans, SBOM, deployment review remain future gates |
| Privacy: purpose/scope consent, disclosure, retention, deletion          | P08,P13,P14,P15,P17,P22     | P14,P22,P23,P25,P27     | speech-vs-generative consent, approved-range/provider registry, no-fallback tests, deletion and backup-aging evidence                              |
| Accessibility and UI localization                                        | P08,P10,P16,P19,P20         | P24,P27                 | automated/manual WCAG AA, keyboard, screen-reader, vi/en matrices; P08 case matrix: `evidence/P08/physical-accessibility-matrix.md`                |
| Observability: safe correlation, progress, retry history                 | P06,P13-P15,P17,P20,P23     | P23,P24,P27             | telemetry schema, redaction tests, dashboards, alert exercises                                                                                     |
| Backup, restore, DR, and deletion aging                                  | P22,P25                     | P25,P27                 | PITR/object restore, RPO/RTO, deletion-aging drill                                                                                                 |
| Signed packaging and safe updates                                        | P11,P21,P26                 | P26,P27                 | signature verification, downgrade/tamper/update recovery matrix                                                                                    |
| RA-1 supported Windows/Android critical E2E                              | P08-P20                     | P24,P27                 | current physical-device and signed-client release matrix                                                                                           |
| RA-2 two-hour/network/crash/low-storage without silent loss              | P05,P07,P09,P10,P12,P14     | P24,P27                 | two-hour source accounting and fault-injection artifacts                                                                                           |
| RA-3 source/derived boundaries and revision history                      | P02,P03,P14-P20             | P21,P24,P27             | mutation-negative, replay, lineage, and version audits                                                                                             |
| RA-4 citation rejection for missing/invalid ranges                       | P17,P18                     | P21,P24,P27             | citation property/fuzz and final corpus report                                                                                                     |
| RA-5 secrets absent from bundles/logs/responses                          | P04,P11,P13,P17,P21         | P21,P26,P27             | source/history/artifact/bundle/log/response scans                                                                                                  |
| RA-6 backup/restore and permanent deletion                               | P22,P25                     | P25,P27                 | cross-store deletion, backup-aging, PITR/object restore drill                                                                                      |
| RA-7 known limitations and consent/privacy copy in product               | P00,P08,P22                 | P24,P27                 | P00: privacy-approval-register.md (PRIVACY-001 consent copy BLOCKED pending Product+Legal); P08 and P22 implementation evidence remains pending    |
| ADR-001 local-first chunked recording                                    | P05,P07,P09,P12             | P14,P24,P27             | acknowledged-chunk integrity and recovery harness                                                                                                  |
| ADR-002 immutable source evidence                                        | P02,P03,P05,P14,P16         | P21,P22,P24,P27         | repository/storage mutation-negative and lineage tests                                                                                             |
| ADR-003 provider-neutral adapters                                        | P13,P14,P15,P17             | P14,P18,P21,P24         | cloud/local adapter conformance, explicit provider/locality choice and same-scope fallback evidence                                                |
| ADR-004 explicit meeting language                                        | P02,P08,P13,P15             | P24,P27                 | state/contract/start/provider configuration matrices                                                                                               |
| ADR-005 modular monolith plus workers                                    | P03,P06                     | P23,P25,P27             | transaction/outbox, worker isolation, deploy/scale evidence                                                                                        |
| ADR-006 Rust native runtime boundary                                     | P11,P12                     | P21,P24,P26,P27         | IPC conformance, privilege audit, audio and signing evidence                                                                                       |

## Critical scenario ownership

|                                  Test Strategy scenario | Primary implementation phase | Final qualification phase |
| ------------------------------------------------------: | ---------------------------- | ------------------------- |
|          1. Vietnamese/English setup and Start blocking | P08                          | P24,P27                   |
|             2. Meeting-only creates no translation work | P08,P15                      | P24,P27                   |
|              3. Translation preserves source transcript | P15                          | P21,P24,P27               |
|             4. Pause/resume chunk and timeline ordering | P09,P12                      | P24,P27                   |
|             5. Network/retry deduplicates chunk/segment | P05,P10,P13                  | P24,P27                   |
|                      6. Kill after local write recovers | P07,P09,P12                  | P24,P27                   |
|              7. Low storage finalizes truthful boundary | P07,P09,P12                  | P24,P27                   |
|               8. Provider failure cannot stop recording | P13                          | P24,P27                   |
|            9. Backfill fills ranges without duplication | P14                          | P24,P27                   |
|                    10. Corrections retain original text | P16                          | P21,P24,P27               |
|              11. Invalid/cross-meeting citations reject | P17                          | P21,P24,P27               |
|                 12. Provider switch creates new version | P17,P18                      | P24,P27                   |
|                  13. Export pins selected version/brand | P20                          | P21,P24,P27               |
|              14. Soft delete/restore/permanent deletion | P22                          | P25,P27                   |
|             15. Two-user isolation across all resources | P04,P21                      | P24,P27                   |
|               16. Device changes/sleep-wake expose gaps | P12                          | P24,P27                   |
|           17. Native buffers stay bounded for two hours | P12                          | P24,P27                   |
|           18. Mic/system source tracks stay independent | P12                          | P21,P24,P27               |
|          19. Recovery Inbox covers every crash boundary | P07,P10,P11                  | P24,P27                   |
|              20. Two-hour transcript remains responsive | P16                          | P24,P27                   |
| 21. Local model lifecycle never activates corrupt model | P28                          | P28 optional release gate |
|      22. Default local final never grants cloud consent | P08                          | P24,P27                   |
|  23. Deterministic windows preserve exact range lineage | P13                          | P14,P24,P27               |
|           24. Failed final window resumes independently | P14                          | P24,P27                   |
|  25. Boundary reconciliation loses/duplicates no speech | P14                          | P24,P27                   |
|        26. Cloud batch fallback retains consented scope | P14                          | P21,P24,P27               |
|              27. Local failure creates no cloud request | P08,P13,P14                  | P21,P24,P27               |
|        28. Cloud check is sequential and decision-gated | P14,P16                      | P21,P24,P27               |
|       29. Run provenance/disagreements seek exact audio | P16                          | P24,P27                   |

P16-T04 implementation continuation (2026-08-12): owner-scoped PostgreSQL
transcript search now has a deterministic domain query contract and database
repository/API read path. It covers Unicode/case search, stable time/id cursor
pagination, speaker/time/confidence/gap/source/locality/revision/disagreement
and bookmark filters, latest revision/translation refresh, owner isolation, and
an additive bookmark table/migration. Focused domain/database tests pass 4/4;
PostgreSQL integration, query plans, large-dataset latency, and inherited
qualification remain OPEN. Evidence: `docs/execution/evidence/P16/transcript-search.json`.

P16 continuation (2026-08-12): fixed the missing desktop `@kms/domain`
workspace dependency. Focused domain/database/API review tests and full
desktop/mobile regression suites pass; all five related typechecks pass.
T05-T07 UI, source-manifest seek, accessibility, performance, device and
two-hour qualification remain OPEN. Evidence:
`docs/execution/evidence/P16/RUN-20260812-2308.md`.

P17-P20 implementation continuation (2026-08-12): provider-neutral AI
contracts/validation/jobs/artifact registry, five data-defined minutes
templates with context/evaluation/uncertainty, safe minutes editor document
and bounded journal, plus pinned brand/export/simple renderer contracts are
IMPLEMENTED under the deferred lane. Provider, durable persistence, desktop,
reader, cross-platform, human-review and release qualification remain OPEN.
Evidence: `docs/execution/evidence/P17/EVIDENCE.md`,
`docs/execution/evidence/P18/EVIDENCE.md`,
`docs/execution/evidence/P19/EVIDENCE.md`,
`docs/execution/evidence/P20/EVIDENCE.md`.

P19-T07 continuation (2026-08-13): desktop renderer metadata, select labels,
and shell contrast were remediated. Playwright + axe-core ran 3/3 checks with
zero violations. Native Electron/manual and inherited qualification rows remain
open. Evidence: `docs/execution/evidence/P19/RUN-20260813-1506.md` and
`docs/execution/evidence/P19/playwright-axe-report.json`.

P19-T07 journal continuation (2026-08-13): fixed persistent journal reload so
acknowledgements operate on restored pending entries. Red/green regression and
the full domain editor suite pass. Evidence:
`docs/execution/evidence/P19/RUN-20260813-1515.md`.

P19-T07 browser continuation (2026-08-13): the production `MinutesEditor` is
now mounted in a built browser fixture. Edit/undo/redo/safe-paste/save and axe
checks pass as part of a 5/5 Playwright suite. Evidence:
`docs/execution/evidence/P19/RUN-20260813-1520.md`.

P19-T07 native continuation (2026-08-13): native Electron smoke now loads the
renderer and primary controls 1/1 after fixing the preload transport contract,
loopback URL, CSP font import, and reproducible process build harness. Evidence:
`docs/execution/evidence/P19/RUN-20260813-1536.md`.

P17 continuation (2026-08-12): citation validation now enforces
owner/meeting/projection-version scope and rejects gap/interim/deleted
segments. AI 15-test and jobs focused suites plus typechecks pass. Legacy
API-key/raw-parse provider surface, live provider, durable persistence and
security qualification remain OPEN. Evidence:
`docs/execution/evidence/P17/RUN-20260812-2315.md`.

P17 API boundary continuation (2026-08-12): removed synchronous legacy provider
execution from the API composition root. Minutes generation now requires
idempotency and delegates through a P06-backed PostgreSQL dispatcher when
configured, otherwise failing closed. API typecheck and 14 files/53 tests pass;
worker execution/guarded commit, production validation and secret-reference
adapter remain OPEN.

P17 worker continuation (2026-08-12): concrete minutes generation now applies
`MinutesVersion` schema validation and projection-scoped citation validation
before the guarded commit callback. Jobs AI tests are 7/7; concrete PostgreSQL
version persistence, live adapter and worker lease execution remain OPEN.

P18 implementation continuation (2026-08-12): T01/T02 runtime template and
provenance contracts, T03 synthetic bilingual manifest, T04 deterministic
context coverage/reconcile, T06/T07 evaluation and conflict routing, and a
T05 immutable in-memory lifecycle seam are directly tested by 26/26 minutes
tests. Durable drafts, fixed holdout/provider/human qualification, security,
full verify and inherited rows remain OPEN. Evidence:
`docs/execution/evidence/P18/RUN-20260812-2354.md`.

P18 verification continuation (2026-08-13): the minutes package passed 6 files
/ 26 tests and typecheck, with corpus hashes and execution-plan validation
passing. Durable/provider/human/security/inherited gates remain OPEN.

P18 durable provenance continuation (2026-08-13): migration `0012` and
repository/domain mapping passed database typecheck, 6 files / 28 unit tests,
and 17 files / 324 PostgreSQL integration tests. P18 remains IMPLEMENTED;
durable draft orchestration and provider/human/security/inherited gates remain
OPEN.

P20-T01 continuation (2026-08-13): safe brand validation now rejects
malformed/non-string arrays, empty owner/id, non-positive versions, unsafe
text, non-allowlisted colors/fonts, and invalid logo hashes without throwing.
Focused domain export tests pass 3/3, domain typecheck passes, and simple
renderer tests pass 1/1. P20 remains IN_PROGRESS; durable export jobs,
additional formats, library, manual, and inherited gates remain open.

P20-T02/T03 continuation (2026-08-13): strict manifest validation and
idempotent immutable in-memory export job semantics are directly tested;
simple Markdown/TXT/JSON and deterministic audio package manifest renderers
pass 3/3 exporter tests. Domain manifest tests pass 4/4 and typechecks pass.
Durable P05/P06 wiring, real audio packaging, DOCX/PDF, library and inherited
qualification remain open. Evidence: `evidence/P20/RUN-20260813-1550.md`.

P20-T07 continuation (2026-08-13): mobile library query filtering covers
title, language, inclusive date bounds, non-mutating input and deterministic
newest-first ordering; focused tests pass 2/2 and mobile typecheck passes.
Full personal library UI/API/detail/history/accessibility qualification remains
open.

P20-T07 pagination continuation (2026-08-13): the mobile library hook now
merges cursor pages by meeting ID, replacing stale duplicates while preserving
first-seen order; focused tests pass 3/3 and mobile typecheck passes. Full
API/UI/cache/a11y/latency qualification remains open. Evidence:
`evidence/P20/RUN-20260813-1610.md`.

P20-T03/T06 continuation (2026-08-13): owner-scoped cancel/retry/history and
expiring download metadata are directly tested at the export seam (2/2), with
immutable completion and authorization/expiry denial. Durable P05/P06
storage/signed URL/cleanup/rate-limit integration remains open.

P20-T04 continuation (2026-08-13): deterministic internal-only DOCX ZIP
rendering passes 3/3 exporter tests and typecheck. The package has no external
relationship target or macro part; full branded layout, fonts, citations,
reader/golden/security/resource qualification remains open. Evidence:
`evidence/P20/RUN-20260813-1558.md`.

P20-T05 continuation (2026-08-13): deterministic self-contained PDF
serialization passes 4/4 renderer tests and typecheck, with no network or
process access in the renderer seam. Approved vi glyph/font, layout, reader,
visual/security and resource qualification remain open. Evidence:
`evidence/P20/RUN-20260813-1600.md`.

P20-T04/T05 continuation (2026-08-13): shared renderer input limits reject
oversized/deeply fragmented documents before MD/TXT/JSON/DOCX/PDF execution;
renderer tests pass 5/5 and typecheck passes. Worker resource enforcement and
reader/visual qualification remain open. Evidence:
`evidence/P20/RUN-20260813-1608.md`.

P20-T01 asset continuation (2026-08-13): raster-only logo asset validation
rejects active SVG/script/external references and enforces 5 MB/4096px bounds;
domain export tests pass 5/5 and typecheck passes. Object-store/decode,
polyglot/bomb, authorization and independent security gates remain open.
Evidence: `evidence/P20/RUN-20260813-1605.md`.

P20-T01 payload continuation (2026-08-13): declared raster content types are
checked against PNG/JPEG/WEBP magic bytes; domain export tests pass 6/6 and
typecheck passes. Full decoder, bomb/polyglot, storage, authorization and
independent security gates remain open. Evidence:
`evidence/P20/RUN-20260813-1606.md`.

P20-T07 API continuation (2026-08-13): the meetings library route now
fail-closes response shape through `MeetingListResponseSchema`; isolated
service tests pass 5/5 and API typecheck passes. Real route/database,
two-owner E2E and UI/cache/a11y/latency qualification remain open. Evidence:
`evidence/P20/RUN-20260813-1613.md`.

P20-T07 detail continuation (2026-08-13): the meeting detail route now
fail-closes response shape through `MeetingDetailResponseSchema`; focused
service tests pass 5/5 and API typecheck passes. Real route/database,
two-owner E2E and UI/cache/a11y/latency qualification remain open. Evidence:
`evidence/P20/RUN-20260813-1615.md`.

P20-T07 DTO continuation (2026-08-13): list-item/list/detail response schemas
are strict and reject unexpected fields; DTO tests pass 2/2, service tests
pass 5/5 and API typecheck passes. Real route/database/two-owner E2E and
UI/cache/a11y/latency qualification remain open. Evidence:
`evidence/P20/RUN-20260813-1617.md`.

P20-T07 query continuation (2026-08-13): the meetings list query schema now
rejects unsupported fields instead of silently stripping them; DTO tests pass
2/2, service tests pass 5/5 and API typecheck passes. Route/database/two-owner
E2E and full search/UI qualification remain open. Evidence:
`evidence/P20/RUN-20260813-1619.md`.

P20-T03 audio continuation (2026-08-13): `audio` is now a first-class export
job format and idempotency dimension; exporter tests pass 8/8 and typecheck
passes. Real package/permission, durable worker/storage and cross-format
qualification remain open. Evidence:
`evidence/P20/RUN-20260813-1622.md`.

P20-T03/T04/T05 document continuation (2026-08-13): DOCX/PDF are explicit
export job formats and idempotency dimensions beside MD/TXT/JSON/audio;
exporter tests pass 9/9 and typecheck passes. Durable worker/storage,
artifact/download and reader qualification remain open. Evidence:
`evidence/P20/RUN-20260813-1624.md`.

P20-T03/T06 provenance continuation (2026-08-13): completed jobs now freeze
artifact SHA-256, byte length and manifest/renderer provenance; exporter tests
pass 9/9 and typecheck passes. Durable object verification/persistence,
signed downloads, cleanup and qualification remain open. Evidence:
`evidence/P20/RUN-20260813-1626.md`.

P20-T03/T06 binary correction (2026-08-13): DOCX/PDF hash and size metadata
now use decoded artifact bytes; exporter tests pass 10/10 and typecheck passes.
Durable object/download verification remains open. Evidence:
`evidence/P20/RUN-20260813-1628.md`.

P20-T06 storage continuation (2026-08-13): stored artifacts are accepted only
when existence, size, SHA-256 and content type match immutable job metadata;
exporter tests pass 11/11 and typecheck passes. P05 ObjectStore/worker/download
wiring and real storage qualification remain open. Evidence:
`evidence/P20/RUN-20260813-1630.md`.

P20-T03/T06 correction (2026-08-14): exporter format now matches the
persisted `markdown` contract and verified download resolution fails closed on
owner, expiry, or stored-artifact metadata mismatch. Exporter tests pass 2
files / 11 tests and package typecheck exits 0. The integrated gate is blocked
by the pre-existing frozen-lockfile mismatch. Evidence:
`evidence/P20/RUN-20260814-1918.md`.

P20 Windows desktop qualification continuation (2026-09-22): unit 183/183,
packaged smoke 3/3, Playwright desktop E2E 3/3, native Rust 78/78, and
optional local-speech 101/101 passed; typecheck and Windows x64 packaging also
passed. The WASAPI combined-flag defect found during qualification was fixed
and regression-tested. These results cover only the exercised Windows desktop
flows and do not prove P20-A01 through P20-A06; reader, durable storage/
download, two-owner, accessibility/manual, real model/corpus, and inherited
qualification rows remain OPEN. Evidence:
`evidence/P20/RUN-20260922-windows-desktop.md`.

The same run also records security 37/37 and contract 436/436 passing tests.
The repository integration suite failed 5 database migration/schema baseline
assertions; root resilience/performance commands selected no tests despite exit
0 and are therefore not treated as passing evidence. These failures keep the
integrated P20 gate open.

The expanded desktop E2E also found a simulated-capture validation defect:
empty meeting title returns `Local capture runtime is unavailable.` before the
expected title error. The expected-failure test preserves this regression
evidence; mode/source toggles and Library refresh pass.

The navigation audit added expected-failure coverage for the visible Templates
and Settings buttons: neither changes the rendered view because the current
renderer has no handler or view state for them.
