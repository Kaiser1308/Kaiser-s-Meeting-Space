# Test Strategy

**Status:** Draft release standard  
**Owner:** Quality Engineering  
**Last reviewed:** 2026-07-21

## Quality risks

Highest severity risks are silent audio loss, corrupt ordering, transcript evidence mutation, invalid AI citations, unauthorized content access, secret leakage and irreversible deletion mistakes.

## Test layers

| Layer | Tools | Focus |
|---|---|---|
| Static | TypeScript, lint, dependency/secret scan | Types, policy and supply-chain hygiene |
| Unit | Vitest | State machine, manifests, validators, provider normalization |
| Property/fuzz | fast-check where useful | Chunk ordering, idempotency and timestamp invariants |
| Integration | Vitest + Testcontainers | PostgreSQL, Redis, S3, jobs and migrations |
| Contract | OpenAPI/provider fixtures | Client/API and adapter compatibility |
| Desktop E2E | Playwright | Setup, recording controls, recovery, editor/export |
| Mobile E2E | Maestro | Permissions, setup, recording lifecycle, recovery |
| Resilience | Fault injection | Network/provider/storage/process failures |
| Performance | Duration/load harnesses | Two-hour capture and worker throughput |
| Security | SAST/DAST/manual review | Authz, signed URLs, secrets and deletion |

## Critical scenario matrix

1. Vietnamese and English setup independently; Start blocked without language.
2. Meeting-only does not create translation work.
3. Translation mode preserves source transcript separately.
4. Pause/resume creates ordered chunks and explicit pause intervals.
5. Network loss, reconnect and duplicate retries produce one canonical chunk/segment.
6. App termination after local write but before upload recovers safely.
7. Low storage finalizes the current chunk and surfaces a truthful failure.
8. Provider timeout/rate limit does not stop recording.
9. Backfill fills known ranges without duplicating realtime segments.
10. Transcript correction leaves original text queryable.
11. AI citations reject cross-meeting, missing or invalid time ranges.
12. Provider switch creates a distinct minutes version.
13. Export uses the selected immutable version and brand preset.
14. Soft delete/restore and permanent deletion affect all intended objects only.
15. One user cannot access another user's meeting, job, object URL or export.
16. USB/Bluetooth/default-device change and sleep/wake produce an explicit event/gap or confirmed recovery, never silent switching/loss.
17. Native buffer overload is bounded, observable and cannot exhaust memory during a two-hour session.
18. Microphone/system source tracks remain independently playable/verifiable after derived mixing/transcription.
19. Recovery Inbox correctly handles crash boundaries before/after chunk write, manifest update, upload and finalization.
20. Two-hour transcript virtualization preserves scroll position, search/seek accuracy and disables auto-follow after manual scrolling.
21. Local model download resume/checksum/cancel leaves either a verified active model or a recoverable partial download, never a corrupt active model.

## Test data

- Synthetic/consented audio only; never copy production meeting content into test systems.
- Vietnamese and English fixtures cover accents, noise, interruptions, overlapping speakers and long silence.
- Golden transcript/minutes fixtures are versioned with provider/prompt/schema version.
- Sensitive test fixtures are encrypted and access controlled; public fixtures contain no personal data.

## Release gates

- All static, unit, integration and contract suites pass.
- Critical E2E matrix passes on supported OS/device versions.
- No flaky critical tests; quarantine is not permitted for data-integrity tests.
- Performance thresholds and recovery drills pass.
- Zero open critical/high data-loss or security findings.
- Migration upgrade and rollback/restore are rehearsed.
- Smoke tests pass after deployment before broad rollout.

## Production verification

Use synthetic canary meetings. Monitor safe metadata: start/finalize success, missing chunks, job latency/error code, provider availability and export success. Never use real transcript/audio in automated production assertions.
