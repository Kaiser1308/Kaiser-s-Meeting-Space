# Requirement Traceability

**Status:** Accepted planning baseline
**Last reviewed:** 2026-07-21

Exact test and report links are added only after execution. A missing evidence cell prevents `VERIFIED`.

 P12 corrective review (2026-07-27): implementation evidence is recorded in `docs/execution/evidence/P12/EVIDENCE.md`, but the phase remains `IMPLEMENTED` pending P05 dependency verification and the direct two-hour/device/application qualification matrix.

 P13 real-speech closure (2026-07-28): commit `94f0050` replaces the native local-speech stub with a SHA-256-verified `whisper-rs` vi/en engine and verified WAV-range boundary. `cargo check -p kms-native` passes; native test executable linking and real-model/corpus, Windows qualification, and Deepgram live gates remain open.

 P13 gate-closure rerun (2026-07-29): `scripts/p13-local-evaluation.mjs` fails closed with `missing_audio_asset` for all 10 frozen entries; `scripts/p13-deepgram-live.mjs` fails closed with `missing_rotated_server_key`; native compile is blocked before tests by missing `libclang.dll`. P13 remains `IMPLEMENTED`; no quality or live-provider evidence is claimed. See `docs/execution/evidence/P13/RUN-20260729-1200.md`.

 P13 native continuation (2026-07-29): temporary path/CMake setup yields a real `cargo check -p kms-native` exit 0 and matching vi/en model hashes; native test-link reaches `rust-lld` but exits 101 on mixed `libstdc++`/`libc++` duplicate symbols. This is not accepted as native qualification evidence. See `docs/execution/evidence/P13/RUN-20260729-2300.md`.

P06 verification closure (2026-07-27): PostgreSQL outbox leasing/CAS and live Redis-loss/rebuild evidence are recorded in `docs/execution/evidence/P06/EVIDENCE.md` and `RUN-20260727-2047.md`; repository-wide `pnpm verify` completed with exit 0, so P06 is `VERIFIED`.

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
| Accessibility and UI localization                                        | P08,P10,P16,P19,P20         | P24,P27                 | automated/manual WCAG AA, keyboard, screen-reader, vi/en matrices                                                                                  |
| Observability: safe correlation, progress, retry history                 | P06,P13-P15,P17,P20,P23     | P23,P24,P27             | telemetry schema, redaction tests, dashboards, alert exercises                                                                                     |
| Backup, restore, DR, and deletion aging                                  | P22,P25                     | P25,P27                 | PITR/object restore, RPO/RTO, deletion-aging drill                                                                                                 |
| Signed packaging and safe updates                                        | P11,P21,P26                 | P26,P27                 | signature verification, downgrade/tamper/update recovery matrix                                                                                    |
| RA-1 supported Windows/Android/iOS critical E2E                          | P08-P20                     | P24,P27                 | current physical-device and signed-client release matrix                                                                                           |
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
