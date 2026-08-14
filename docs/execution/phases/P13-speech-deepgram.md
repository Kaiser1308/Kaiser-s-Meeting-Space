---
phase: P13
title: Provider-neutral cloud-live and desktop local-file speech platform
packet_status: ACCEPTED
depends_on: [P06, P09, P12]
requirements: [FR-3, ADR-003, ADR-004]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Vietnamese/English meetings use a versioned speech policy and immutable run/part lineage. Opt-in cloud live uses an owner-bound server-brokered Deepgram session, while the Windows Rust runtime provides the default verified local file-STT capability for final processing after End. Deterministic window planning, minimal language-model verification, normalized events and a frozen bilingual quality/resource corpus are ready for P14 orchestration; recording remains independent from every speech path.

# Authoritative context

Read AI/Speech Providers, API Contracts audio/jobs, Security provider controls, ADR-003/004, P02 speech-related contracts, P06 jobs, and P09/P12 capture evidence.

# Preconditions and external prerequisites

P06/P09/P12 are `VERIFIED`; a Deepgram test account/key in approved server secret storage, accepted data-processing/region policy, a license/provenance-reviewed vi and en local model, minimum supported Windows hardware, synthetic/consented vi/en audio, and supported online/offline network profiles are available. Fixture work can finish without live credentials/models/hardware but their acceptance gates remain blocked.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P06        | Verified outputs and invariants consumed by this packet. | `../evidence/P06/EVIDENCE.md` | VERIFIED          |
| P09        | Verified outputs and invariants consumed by this packet. | `../evidence/P09/EVIDENCE.md` | VERIFIED          |
| P12        | Verified outputs and invariants consumed by this packet. | `../evidence/P12/EVIDENCE.md` | VERIFIED          |

## Deferred end-to-end qualification lane

For implementation only, P13 may consume the named P09/P12 capture contracts
at `IMPLEMENTED` under
[`../DEFERRED_END_TO_END_QUALIFICATION.md`](../DEFERRED_END_TO_END_QUALIFICATION.md).
The run record must carry inherited capture rows and P13's own real-provider,
quality, and native-link rows. P13 cannot claim `VERIFIED` while any is open.

# Scope firewall

**Allowed:** versioned policy/run/part/segment contracts, `packages/speech/`, deterministic window planner, Deepgram cloud-live adapter and broker, mobile/desktop derived-feed stream, Windows Rust local file-STT adapter, one minimal verified language-model boundary, immutable raw event persistence, bilingual evaluation harness, safe metrics, conformance/live/fault tests.

**Forbidden/out:** final-run scheduling/reconciliation/completeness/cloud-check execution (P14), translation, minutes, mobile local STT, local live STT, immutable import, advanced resumable model catalog/switching (P28), provider SDK types in domain/client, master key/client, source capture changes, and automatic provider/locality fallback.

**Extension seams:** `SpeechProvider` capability/session/file/health contract, immutable `TranscriptRun`/`TranscriptRunPart`, `stt-window-v1`, and versioned native local-speech IPC. P14 owns orchestration; P28 must reuse these contracts.

# Contracts and invariants

- Session request binds owner/meeting, language `vi|en`, source/mix ID, capability/config version, expiry, budget, and allowed provider.
- Normalized events: interim, final segment, speaker update, usage, safe error, session state; raw payload stays adapter-internal.
- `TranscriptionPolicyV1` independently selects live and final behavior; legacy `speechMode` cannot infer cloud consent.
- Every live/final/check attempt has immutable run lineage; each window or full batch has immutable part lineage and raw-result hash.
- `stt-window-v1` deterministically plans 300-second windows with 2-second overlaps independently of capture-chunk boundaries.
- The local adapter accepts exact planned windows, uses one verified allowlisted vi or en model, bounds resources/cancellation, yields to capture, and makes no network request.
- Final event dedupe combines run/part/provider/session/event identity; P13 preserves reconciliation inputs but P14 owns the canonical projection.
- Client streams derived feed only; loss never blocks source writer and emits delayed/backfill-required state.
- Cloud work requires named-provider disclosure, consent and approved range. Cross-provider/locality fallback is off; secrets/errors/content are absent from tokens, client bundles, logs and telemetry.

# File and ownership map

| Path                                  | Responsibility                                       | Owner                |
| ------------------------------------- | ---------------------------------------------------- | -------------------- |
| `packages/domain/src/transcript/`     | policy/run/part/segment lineage contracts            | Speech core          |
| `packages/speech/src/core/`           | capabilities/window/events/errors/conformance        | Speech core          |
| `packages/speech/src/deepgram/`       | SDK isolation/normalization/cloud live               | Cloud adapter        |
| `packages/native-contract/`           | versioned local file-STT IPC                         | Native contract      |
| `native/kms-native/src/local_speech/` | verified model boundary and bounded local engine     | Local adapter        |
| API/client speech modules             | broker, derived feed and immutable event persistence | Integration          |
| speech evaluation/security tests      | bilingual quality/resource/live/offline/fault        | Independent reviewer |

# Ordered task packets

## P13-T01 - Provider-neutral speech contracts and fixtures

Define runtime `TranscriptionPolicyV1`, immutable run/part/segment lineage, capability/readiness/session/file/event/usage/health/cancel/safe error schemas and adapter conformance. Add additive persistence for runs, parts and raw events. Test invalid policy/locality/consent/ranges, immutability, owner isolation, unknown versions, raw SDK leakage, duplicates/out-of-order and content-free errors. Evidence: `evidence/P13/speech-contract.json`.

## P13-T02 - Owner-bound short-lived session broker

Implement `stt-window-v1` deterministic planning from verified manifest ranges with 300-second windows and 2-second overlaps, stable plan hash and no capture-chunk linguistic boundary. Add golden/property tests for short/exact/two-hour, pause/gap, multi-source and repeatability cases. Evidence: `window-planner-report.json`.

## P13-T03 - Deepgram realtime adapter

Implement the versioned TS/Rust local-speech IPC, fixed allowlisted model manifest and whisper.cpp-compatible Windows file adapter with vi/en fixed language, exact range metadata, bounded thread/memory/queue/progress/cancel, capture priority and no-network behavior. Reject corrupt/incompatible/unreviewed/path-escaping models. Evidence: `local-speech-conformance.json`.

## P13-T04 - Recording-independent client streaming

Implement authenticated cloud-live session creation plus the Deepgram realtime adapter with explicit vi/en config, derived-feed format, normalization, keepalive/close and safe error mapping. Require matching live-cloud policy/disclosure/consent; master credentials stay server-side. Test two owners, replay/expiry, quota, unsupported capability, every normalized event/error and authorized live synthetic vi/en sessions. Evidence: `deepgram-conformance.json`.

## P13-T05 - Idempotent final event persistence

Implement bounded mobile/desktop cloud-live derived-feed streaming and desktop local-file submission. Persist normalized final/speaker/usage events under immutable run/part lineage; interim remains memory/UI only. Test retry, out-of-order, conflicting duplicate, stale/cross-meeting event, per-window resume input, provider/network/model failure and prove capture continues. Evidence: `speech-persistence.json`.

## P13-T06 - Safe state, latency, usage, and cancellation

Freeze the synthetic/consented bilingual corpus and evaluation calculations before tuning. Measure clean/noisy WER, timestamp p95, local RTF, memory/CPU, cancellation, deterministic plans, coverage, ordering, no-network local behavior and cloud-contact absence. Expose only safe state/usage/resource metrics and close all resources. Evidence: `local-speech-evaluation.json`.

## P13-T07 - Live synthetic and fault qualification

Run fixed vi/en local and cloud-live qualification: minimum-Windows local file STT, offline/cancel/crash/resource limits, mobile/desktop cloud-live reconnect/rollover/network/rate/quota/provider outage, persistence replay and bundle/log/secret inspection. Enforce clean WER ≤18%, noisy WER ≤30%, timestamp p95 ≤1.5s, local RTF ≤1.0 and cancel ≤2s. Fixtures cannot replace live provider or hardware evidence. Evidence: `evidence/P13/EVIDENCE.md`.

# Subagent work packages

| Package            | Tasks             | Exclusive paths             | Depends on  | Review gate                      |
| ------------------ | ----------------- | --------------------------- | ----------- | -------------------------------- |
| Contracts/windows  | T01,T02           | domain/database/speech core | P02,P06     | lineage/determinism review       |
| Local model/engine | T03,T06 local     | native contract/runtime     | T01,T02,P12 | license/resource/privacy review  |
| Cloud/integration  | T04,T05,T06 cloud | Deepgram/API/clients        | T01,P06     | consent/secret/capture review    |
| Independent QA     | T07               | tests/evidence              | all         | quality/security/resource review |

# Failure and debugging matrix

| Failure                         | Classification | Expected behavior                                      | Recovery/regression   |
| ------------------------------- | -------------- | ------------------------------------------------------ | --------------------- |
| Provider/network loss           | provider       | Recording continues; delayed/backfill range visible    | forced outage         |
| Session expires                 | timing         | Bounded rollover without duplicate finals              | expiry/reconnect test |
| Duplicate/out-of-order final    | state          | One event and deterministic order/reconciliation input | replay property       |
| Unsupported language/capability | contract       | Reject before provider; no mode change                 | capability matrix     |
| Quota/rate limit                | provider       | Safe delayed/retry-after; no key/body leak             | live/fake rate test   |
| Model absent/corrupt            | environment    | Wait/reject locally; recording continues; no cloud job | model boundary test   |
| Local engine/resource failure   | platform       | Preserve committed parts; bounded cancel/retry         | offline/crash test    |
| Window boundary speech          | contract       | Preserve raw candidates for P14 reconciliation         | boundary corpus       |

# Integrated verification

Run policy/run persistence, deterministic planner, TS/Rust IPC/model/local-engine conformance, API broker auth/consent/security, Deepgram live synthetic, client capture-independence, bilingual quality/resource/offline tests, persistence replay, secret/content/bundle/log scans, resource-leak tests, and `pnpm verify`.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P13/EVIDENCE.md` |

# Acceptance gate

- [ ] P13-A01 - Policy/run/part/event contracts are versioned, owner-scoped, immutable, idempotent and contain no provider SDK leakage.
- [ ] P13-A02 - `stt-window-v1` is deterministic, independent of capture chunks and preserves exact range/overlap lineage for P14.
- [ ] P13-A03 - Verified Windows local file STT is explicit-language, bounded, cancellable, network-independent and cannot interfere with recording.
- [ ] P13-A04 - Real Deepgram cloud-live vi/en matrix passes consent/session/security controls and provider failure cannot stop capture.
- [ ] P13-A05 - Frozen bilingual quality/resource thresholds pass on the minimum Windows profile with complete range accounting inputs.
- [ ] P13-A06 - No local failure creates cloud work; credentials/content stay out of clients/domain/logs/telemetry and two-owner controls pass.

# Migration, rollout, and rollback

Use separate local-final and cloud-live feature flags plus provider/account allowlist and budget. Rollback disables new sessions/local jobs while preserving verified models, audio, runs, parts and raw events. Live key/model binaries never enter the repo.

# Required documentation updates

AI/Speech provider configuration/capabilities, API session contract, privacy disclosure, Operations provider runbook, Status/Traceability/Progress, and P13 evidence.

# Conversation boundary

Speech platform capability only. Do not implement final-run orchestration, canonical overlap reconciliation, cloud-check execution, completeness, translation, minutes, mobile local, local live, import, advanced model lifecycle, client master credentials, or automatic provider/locality fallback. Stop before P14.

# Handoff record

P14 still requires P10 and P06 (already direct); if all are verified, report it newly unblocked and stop.
