# Requirement Traceability

**Status:** Accepted planning baseline
**Last reviewed:** 2026-07-21

Exact test and report links are added only after execution. A missing evidence cell prevents `VERIFIED`.

## Product and architecture requirements

| Requirement / invariant | Implementation phases | Verification phases | Required evidence target |
|---|---|---|---|
| FR-1 explicit title/language/mode/source/readiness/consent | P02,P08,P11 | P08,P11,P24,P27 | start-flow contract, mobile/desktop E2E, a11y/localization matrix |
| FR-2 local-first recording lifecycle | P02,P05,P07,P09,P10,P12 | P09,P10,P12,P14,P24,P27 | chunk integrity, crash recovery, physical-device, two-hour reports |
| FR-3 immutable transcript and separate translation | P02,P03,P13,P14,P15 | P14,P15,P16,P21,P24,P27 | conformance, reconciliation, lineage, mutation-negative tests |
| FR-4 finalization, completeness, review, partial warning | P07,P10,P14,P16 | P14,P16,P24,P27 | finalization fault matrix and completeness/review E2E |
| FR-5 detailed evidence-linked minutes | P17,P18,P19 | P18,P19,P24,P27 | fixed-corpus scorecard, citation/coverage report, version audit |
| FR-6 editor, branding, version-pinned export | P19,P20 | P20,P21,P24,P27 | editor conflict/a11y tests and export golden/security matrix |
| FR-7 library, search, soft/permanent deletion | P03,P04,P10,P20,P22 | P22,P24,P25,P27 | two-user search/library E2E and complete deletion/backup-aging drill |
| Reliability: no acknowledged chunk loss | P05,P07,P09,P10,P12,P14 | P14,P24,P27 | crash-boundary, checksum, reconciliation, two-hour fault reports |
| Reliability: retryable mutations are idempotent | P02-P07,P10,P13-P20,P22 | P21,P24,P27 | replay/concurrency/property matrices by route/job |
| Performance: controls <200 ms and realtime p95 <3 s | P09,P12,P13,P16 | P24,P27 | device control-latency and provider/UI performance reports |
| Scalability: async work and horizontal job isolation | P06,P13-P15,P17,P18,P20 | P23,P24,P25,P27 | queue saturation, worker scaling, backlog recovery reports |
| Security: owner isolation, secrets, least privilege | P04,P05,P11,P13,P17,P20,P21 | P21,P25-P27 | route/URL/IPC matrix, scans, SBOM, deployment review |
| Privacy: consent, disclosure, retention, deletion | P08,P13,P15,P17,P22 | P22,P23,P25,P27 | copy/provider registry, deletion drill, backup-aging evidence |
| Accessibility and UI localization | P08,P10,P16,P19,P20 | P24,P27 | automated/manual WCAG AA, keyboard, screen-reader, vi/en matrices |
| Observability: safe correlation, progress, retry history | P06,P13-P15,P17,P20,P23 | P23,P24,P27 | telemetry schema, redaction tests, dashboards, alert exercises |
| Backup, restore, DR, and deletion aging | P22,P25 | P25,P27 | PITR/object restore, RPO/RTO, deletion-aging drill |
| Signed packaging and safe updates | P11,P21,P26 | P26,P27 | signature verification, downgrade/tamper/update recovery matrix |
| RA-1 supported Windows/Android/iOS critical E2E | P08-P20 | P24,P27 | current physical-device and signed-client release matrix |
| RA-2 two-hour/network/crash/low-storage without silent loss | P05,P07,P09,P10,P12,P14 | P24,P27 | two-hour source accounting and fault-injection artifacts |
| RA-3 source/derived boundaries and revision history | P02,P03,P14-P20 | P21,P24,P27 | mutation-negative, replay, lineage, and version audits |
| RA-4 citation rejection for missing/invalid ranges | P17,P18 | P21,P24,P27 | citation property/fuzz and final corpus report |
| RA-5 secrets absent from bundles/logs/responses | P04,P11,P13,P17,P21 | P21,P26,P27 | source/history/artifact/bundle/log/response scans |
| RA-6 backup/restore and permanent deletion | P22,P25 | P25,P27 | cross-store deletion, backup-aging, PITR/object restore drill |
| RA-7 known limitations and consent/privacy copy in product | P00,P08,P22 | P24,P27 | P00: privacy-approval-register.md (PRIVACY-001 consent copy BLOCKED pending Product+Legal); P08+P22 implementation evidence TBD |
| ADR-001 local-first chunked recording | P05,P07,P09,P12 | P14,P24,P27 | acknowledged-chunk integrity and recovery harness |
| ADR-002 immutable source evidence | P02,P03,P05,P14,P16 | P21,P22,P24,P27 | repository/storage mutation-negative and lineage tests |
| ADR-003 provider-neutral adapters | P13,P15,P17 | P18,P21,P24 | adapter conformance and explicit provider-switch evidence |
| ADR-004 explicit meeting language | P02,P08,P13,P15 | P24,P27 | state/contract/start/provider configuration matrices |
| ADR-005 modular monolith plus workers | P03,P06 | P23,P25,P27 | transaction/outbox, worker isolation, deploy/scale evidence |
| ADR-006 Rust native runtime boundary | P11,P12 | P21,P24,P26,P27 | IPC conformance, privilege audit, audio and signing evidence |

## Critical scenario ownership

| Test Strategy scenario | Primary implementation phase | Final qualification phase |
|---:|---|---|
| 1. Vietnamese/English setup and Start blocking | P08 | P24,P27 |
| 2. Meeting-only creates no translation work | P08,P15 | P24,P27 |
| 3. Translation preserves source transcript | P15 | P21,P24,P27 |
| 4. Pause/resume chunk and timeline ordering | P09,P12 | P24,P27 |
| 5. Network/retry deduplicates chunk/segment | P05,P10,P13 | P24,P27 |
| 6. Kill after local write recovers | P07,P09,P12 | P24,P27 |
| 7. Low storage finalizes truthful boundary | P07,P09,P12 | P24,P27 |
| 8. Provider failure cannot stop recording | P13 | P24,P27 |
| 9. Backfill fills ranges without duplication | P14 | P24,P27 |
| 10. Corrections retain original text | P16 | P21,P24,P27 |
| 11. Invalid/cross-meeting citations reject | P17 | P21,P24,P27 |
| 12. Provider switch creates new version | P17,P18 | P24,P27 |
| 13. Export pins selected version/brand | P20 | P21,P24,P27 |
| 14. Soft delete/restore/permanent deletion | P22 | P25,P27 |
| 15. Two-user isolation across all resources | P04,P21 | P24,P27 |
| 16. Device changes/sleep-wake expose gaps | P12 | P24,P27 |
| 17. Native buffers stay bounded for two hours | P12 | P24,P27 |
| 18. Mic/system source tracks stay independent | P12 | P21,P24,P27 |
| 19. Recovery Inbox covers every crash boundary | P07,P10,P11 | P24,P27 |
| 20. Two-hour transcript remains responsive | P16 | P24,P27 |
| 21. Local model lifecycle never activates corrupt model | P28 | P28 optional release gate |
