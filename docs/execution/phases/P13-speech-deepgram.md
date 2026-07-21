---
phase: P13
title: Provider-neutral speech broker and Deepgram realtime adapter
status: NOT_STARTED
depends_on: [P06, P09, P12]
requirements: [FR-3, ADR-003, ADR-004]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Vietnamese/English mobile and desktop meetings may stream a derived audio feed through an owner-bound server-brokered Deepgram session and persist normalized final events idempotently. Interim events are ephemeral, provider credentials/payloads remain inside the adapter, and every provider/network failure leaves recording independent and marks backfill need.

# Authoritative context

Read AI/Speech Providers, API Contracts audio/jobs, Security provider controls, ADR-003/004, P02 speech-related contracts, P06 jobs, and P09/P12 capture evidence.

# Preconditions and external prerequisites

P06/P09/P12 are `VERIFIED`; a Deepgram test account/key in approved server secret storage, accepted data-processing/region policy, synthetic vi/en audio, and supported network profiles are available. Fixture work can finish without key but live acceptance remains blocked.

# Scope firewall

**Allowed:** `packages/speech/`, Deepgram adapter, API speech session broker, mobile/desktop derived-feed stream, final event persistence, safe metrics, conformance/live/fault tests.

**Forbidden/out:** backfill/completeness (P14), translation, minutes/local Whisper, provider SDK types in domain/client, master key/client, source capture changes, and automatic provider fallback.

**Extension seams:** `SpeechProvider` capability/session/file/health contract; only Deepgram realtime is registered here.

# Contracts and invariants

- Session request binds owner/meeting, language `vi|en`, source/mix ID, capability/config version, expiry, budget, and allowed provider.
- Normalized events: interim, final segment, speaker update, usage, safe error, session state; raw payload stays adapter-internal.
- Final event dedupe key combines provider/session/event identity; ordering/reconciliation preserves raw metadata reference safely.
- Client streams derived feed only; loss never blocks source writer and emits delayed/backfill-required state.
- Cross-provider fallback is off; secrets/errors/content absent from tokens, client bundle, logs, telemetry.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| `packages/speech/src/core/` | capabilities/session/events/errors/conformance | Speech core |
| `packages/speech/src/deepgram/` | SDK isolation/normalization/live/file seam | Adapter |
| API speech module | owner/session credential/budget policy | Broker |
| mobile/desktop speech stream feature | derived feed/reconnect/display state | Client integration |
| speech contract/live/security tests | fixtures, live synthetic, latency/fault | Independent reviewer |

# Ordered task packets

## P13-T01 - Provider-neutral speech contracts and fixtures

Define runtime capability/readiness/session/file/event/usage/health/cancel/safe error schemas and adapter conformance. Test unknown versions, invalid time/language/speaker/confidence, raw SDK leakage, duplicates/out-of-order, and content-free error mapping. Evidence: `evidence/P13/speech-contract.json`.

## P13-T02 - Owner-bound short-lived session broker

Implement authenticated API session creation with meeting state/language/source/capability/allowlist/region/budget/rate validation and short expiry; master credentials stay server-side. Test two owners, stale meeting/state, unsupported capability, quota, token replay/expiry, and redaction. Evidence: `speech-broker-report.json`.

## P13-T03 - Deepgram realtime adapter

Implement explicit vi/en config, encoding/sample rate/channels from derived feed, punctuation/finalization/diarization capability, keepalive/close, normalized events, timeout/rate/error mapping. Contract tests and authorized live synthetic session tests cover both languages and every normalized event/error class. Evidence: `deepgram-conformance.json`.

## P13-T04 - Recording-independent client streaming

Implement bounded derived-feed tap, session connect/rollover/reconnect, backpressure/drop accounting, cancellation, and delayed/backfill-required state for mobile/desktop. Fault tests disconnect/slow the provider while recording and prove local chunks/controls continue with explicit delayed ranges. Evidence: `client-stream-fault.json`.

## P13-T05 - Idempotent final event persistence

Persist only normalized final/speaker/usage events through owner/meeting/session identity, unique dedupe/order semantics, P02 validation, and transaction/outbox progress. Interim remains memory/UI only. Test retry, out-of-order, conflicting duplicate, stale session, and cross-meeting event. Evidence: `speech-persistence.json`.

## P13-T06 - Safe state, latency, usage, and cancellation

Expose session/provider state, p50/p95 final latency, units, retries, delayed ranges, and safe errors through P06 events; close sockets/resources on End/cancel/timeout. Test log/telemetry content/credential injection and leaked handles. Evidence: `speech-operations-report.json`.

## P13-T07 - Live synthetic and fault qualification

Run fixed vi/en synthetic audio on mobile/desktop derived feeds, reconnect/rollover/network flap/rate/quota/malformed/duplicate/provider outage/cancel, measure latency and inspect persistence/bundles/logs. Fixtures cannot replace live test. Evidence: `evidence/P13/EVIDENCE.md`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Core/fixtures | T01 | speech core | P02 | contract/content review |
| Adapter/broker | T02,T03,T06 server | Deepgram + API | T01,P04,P06 | secret/policy review |
| Client/persistence | T04,T05,T06 client | client stream + persistence | T01-T03 | recording/idempotency review |
| Independent live QA | T07 | tests/evidence | all | provider/security/latency review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Provider/network loss | provider | Recording continues; delayed/backfill range visible | forced outage |
| Session expires | timing | Bounded rollover without duplicate finals | expiry/reconnect test |
| Duplicate/out-of-order final | state | One event and deterministic order/reconciliation input | replay property |
| Unsupported language/capability | contract | Reject before provider; no mode change | capability matrix |
| Quota/rate limit | provider | Safe delayed/retry-after; no key/body leak | live/fake rate test |

# Integrated verification

Run speech contract/conformance, API broker auth/security, persistence integration, client capture-independence/resilience, live synthetic vi/en tests, latency baseline, secret/content/bundle/log scan, resource leak tests, and `pnpm verify`.

# Acceptance gate

- [ ] P13-A01 - Provider master credential/payload never reaches clients/domain/logs.
- [ ] P13-A02 - Explicit-language normalized final events persist idempotently with stable ordering/lineage.
- [ ] P13-A03 - Provider/network/quota failure cannot stop/corrupt mobile or Windows recording.
- [ ] P13-A04 - Core conformance and real Deepgram vi/en synthetic matrix pass.
- [ ] P13-A05 - Latency/usage/state/errors are bounded, actionable, and content-free.
- [ ] P13-A06 - Session authorization/expiry/budget/region/allowlist controls pass two-user tests.

# Migration, rollout, and rollback

Feature/account allowlist and budget. Disable session creation on rollback; existing recordings continue and final events remain immutable. Live key never enters repo.

# Required documentation updates

AI/Speech provider configuration/capabilities, API session contract, privacy disclosure, Operations provider runbook, Status/Traceability/Progress, and P13 evidence.

# Handoff record

P14 still requires P10 and P06 (already direct); if all are verified, report it newly unblocked and stop.
