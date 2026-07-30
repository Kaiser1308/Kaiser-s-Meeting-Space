---
phase: P23
title: Content-free observability, SLOs, support, and incident readiness
packet_status: ACCEPTED
depends_on: [P22]
requirements: [NFR-Observability, NFR-Privacy, NFR-Reliability]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Operators can detect, diagnose, and respond to recording, finalization, queue, provider, export, deletion, and client-recovery failures using content-free telemetry, actionable SLOs, tested alerts, safe support bundles, and rehearsed runbooks.

# Authoritative context

Read `docs/operations/DEPLOYMENT_AND_RUNBOOK.md`, `docs/security/SECURITY_AND_PRIVACY.md`, `docs/engineering/TEST_STRATEGY.md`, System Architecture, P06 job/SSE evidence, P21 security findings, and P22 privacy/deletion evidence.

# Preconditions and external prerequisites

- P22 is `VERIFIED`; the telemetry allowlist and prohibited data classes are accepted.
- A local/CI OpenTelemetry collector and production-shaped staging telemetry backend are available.
- Alert delivery destinations and on-call owner may be provisional locally, but staging alert delivery must be real for `VERIFIED`.
- Missing staging telemetry or alert-routing access yields `IMPLEMENTED`/`BLOCKED`, never fabricated screenshots.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P22        | Verified outputs and invariants consumed by this packet. | `../evidence/P22/EVIDENCE.md` | VERIFIED          |

# Scope firewall

## In scope

Telemetry schema/allowlist, correlation, OTel instrumentation, metrics/traces/errors, client crash/recovery reporting, dashboards, SLOs, alerts, synthetic canaries, safe support bundles, incident runbooks, and exercises.

## Out of scope

Meeting-content analytics, product behavior tracking, production infrastructure deployment, a new logging vendor, automated content inspection, and 24/7 staffing commitments.

## Allowed paths

`packages/telemetry/`, API/worker/mobile/desktop/native instrumentation boundaries, deployment observability config, dashboards/alerts as code, support tooling, synthetic canaries, operations docs, and telemetry tests.

## Forbidden paths

Domain source content, prompt payload logging, audio samples, transcript/minutes fields, unrestricted process dumps, or instrumentation that changes recording behavior.

## Extension seams

Exporters implement one typed telemetry sink contract so backends can change without changing event schemas or privacy policy.

# Contracts and invariants

- `TelemetryEventV1` is an allowlisted discriminated union; unknown keys fail tests and are dropped at runtime.
- Correlation uses request/job/session/chunk IDs, release/environment, safe state/error code, durations, counts, and bounded numeric histograms only.
- Pseudonymous installation/device IDs rotate according to P22 policy and never replace authentication/owner checks.
- Recording and recovery continue when telemetry is offline, slow, or misconfigured.
- SLO calculations define numerator, denominator, exclusions, window, source, and minimum sample size.
- Support bundles use an explicit manifest, local preview, size limit, redaction, and user consent before export.

# File and ownership map

| Path                                  | Responsibility                                   | Task owner           |
| ------------------------------------- | ------------------------------------------------ | -------------------- |
| `packages/telemetry/`                 | Typed schema, redaction, correlation, exporters  | Telemetry core       |
| API/worker instrumentation            | Server spans/metrics and job linkage             | Server package       |
| mobile/desktop/native instrumentation | Crash, capture-health, and recovery metadata     | Client package       |
| `ops/observability/`                  | Dashboards, SLOs, alerts, and synthetic monitors | Operations package   |
| support tooling/docs                  | Consent-safe bundle and runbooks                 | Support package      |
| telemetry security tests              | Content/secret fuzz and outage tests             | Independent reviewer |

# Ordered task packets

## P23-T01 - Typed telemetry allowlist and redaction boundary

Create schema tests that fail when prohibited field names/values or unknown keys appear. Implement typed event builders, recursive deny patterns, field/value limits, and safe error normalization. Fuzz audio/transcript/minutes/title/URL/credential-shaped inputs. Evidence: `evidence/P23/telemetry-schema-report.json`.

## P23-T02 - End-to-end correlation and server instrumentation

Instrument HTTP, outbox, queues, workers, storage, providers, exports, and deletion with stable correlation propagation. Start with failing trace-graph tests for lost links, duplicate retries, cancellation, and sampling. Prove no content enters attributes. Evidence: `evidence/P23/correlation-report.json`.

## P23-T03 - Client/native capture and recovery telemetry

Add bounded health events for permission/readiness, buffer counters, chunk finalize/upload, device changes, crash/restart, and Recovery Inbox outcomes. Telemetry failure must not block callbacks, disk writes, or UI controls. Test offline collector, backpressure, oversized diagnostics, and native crash. Evidence: `evidence/P23/client-telemetry-report.json`.

## P23-T04 - SLI/SLO definitions and dashboards as code

Implement the operations runbook indicators with exact queries: API availability/latency, accepted-chunk durability, finalization, queue age, processing success, provider latency, export/deletion success, and recovery outcomes. Validate queries against deterministic synthetic events including no-data and low-volume windows. Evidence: `evidence/P23/dashboard-query-report.json`.

## P23-T05 - Actionable alerts and safe routing

Define burn-rate/backlog/integrity/provider/backup/deletion alerts with owner, severity, runbook link, dedupe, silence rules, and no content. Inject synthetic breaches, prove real staging delivery/recovery notification, and detect alert storms. Evidence: `evidence/P23/alert-exercise.json`.

## P23-T06 - Consent-safe support bundle

Build local collection/preview/export of app version, platform, safe config flags, recent allowlisted events, manifest/checksum summaries, and crash IDs. Exclude content, credentials, tokens, file paths, object URLs, and raw dumps. Test adversarial filenames/log strings and maximum size. Evidence: `evidence/P23/support-bundle-scan.json`.

## P23-T07 - Incident runbooks and game-day exercises

Write and rehearse provider degradation, object upload failure, queue backlog, auth/JWKS outage, deletion backlog, telemetry outage, suspected exposure, and client crash-recovery scenarios. Each exercise records detection, containment, user impact, recovery, escalation, and follow-up without content. Evidence: `evidence/P23/game-day-report.md`.

## P23-T08 - Synthetic canary and integrated observability gate

Run a synthetic meeting through capture metadata, upload, finalization, transcript, minutes, export, and deletion in staging; verify the expected trace graph, metrics, dashboards, alerts, and cleanup. Disable telemetry during a second run and prove product behavior remains intact. Evidence: `evidence/P23/EVIDENCE.md`.

# Subagent work packages

| Package               | Task IDs    | Exclusive paths                         | Depends on | Review gate               | Output            |
| --------------------- | ----------- | --------------------------------------- | ---------- | ------------------------- | ----------------- |
| Telemetry core/server | T01,T02     | telemetry + server instrumentation      | P22 policy | privacy/schema review     | library/traces    |
| Client/native         | T03,T06     | client/native instrumentation + support | T01        | realtime/privacy review   | health/bundle     |
| Operations            | T04,T05,T07 | ops dashboards/alerts/runbooks          | T02        | SLO/alert review          | operations assets |
| Independent canary    | T08         | tests/evidence only                     | all        | end-to-end/privacy review | final report      |

# Failure and debugging matrix

| Failure                          | Classification | Expected behavior                                  | Content-free diagnostics      | Recovery/regression     |
| -------------------------------- | -------------- | -------------------------------------------------- | ----------------------------- | ----------------------- |
| Exporter/collector unavailable   | environment    | Drop/buffer within bound; product unaffected       | dropped-count, exporter state | outage fault test       |
| Content-shaped attribute emitted | security       | Reject/redact and fail release test                | event type/key only           | fuzz regression         |
| Trace context lost on retry      | contract       | Preserve causal job/request links                  | IDs/attempt                   | retry trace test        |
| No-data dashboard looks healthy  | state          | Display insufficient data, not green               | sample count/window           | empty-window query test |
| Alert storms                     | timing         | Dedupe/rate-limit while preserving critical signal | alert key/count               | storm exercise          |

# Integrated verification

Run telemetry unit/fuzz tests, `pnpm test:integration -- --project observability`, `pnpm test:security -- --suite telemetry`, `pnpm test:resilience -- --suite telemetry-outage`, staging canary/alert exercise, and `pnpm verify`.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P23/EVIDENCE.md` |

# Acceptance gate

- [ ] P23-A01 - Telemetry schema and support bundles contain no prohibited content or credentials under adversarial tests.
- [ ] P23-A02 - Critical workflows have complete correlation and truthful no-data behavior.
- [ ] P23-A03 - SLO queries/dashboards match deterministic source events.
- [ ] P23-A04 - Every critical alert reaches the real staging route and links to a rehearsed runbook.
- [ ] P23-A05 - Telemetry outage cannot stop recording, recovery, or processing.
- [ ] P23-A06 - Synthetic canary proves observability and cleanup end to end.

# Migration, rollout, and rollback

Deploy schemas and collectors before enabling exporters. Sample high-volume traces only after integrity metrics are unsampled or loss-accounted. A kill switch disables each exporter without disabling product behavior. Roll back dashboards/alerts as versioned config while retaining compatible event schemas.

# Required documentation updates

Update operations SLO/monitoring/incident sections, security telemetry inventory, development diagnostics, `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`, and P23 evidence.

# Conversation boundary

Do not add content analytics, product tracking, new logging vendors, production deployment, or instrumentation that can block recording. Stop before P24.

# Handoff record

Use `templates/HANDOFF_TEMPLATE.md`. Unblock P24 only.
