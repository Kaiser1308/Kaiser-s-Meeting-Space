---
phase: P24
title: Resilience, performance, accessibility, and compatibility qualification
packet_status: ACCEPTED
depends_on: [P23]
requirements: [NFR-Reliability, NFR-Performance, NFR-Accessibility, NFR-Localization]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

The feature-complete personal product passes the supported Windows/Android/iOS matrix, two-hour and fault-injection tests, documented performance budgets, WCAG AA/keyboard/screen-reader checks, and Vietnamese/English UI validation with zero unresolved critical/high data-loss, security, accessibility, or release-blocking performance defects.

# Authoritative context

Read the complete PRD release acceptance, User Flows, Test Strategy critical scenarios 1-21 (excluding optional P28 scenario from the production gate), Tech Stack support matrix, Operations SLOs, P09/P10/P12/P14/P16/P20 evidence, and P21-P23 evidence.

# Preconditions and external prerequisites

- P23 is `VERIFIED`; P00 supported OS/device/browser/application matrix is still current.
- Representative supported physical Android and iOS devices, Windows microphone/system-audio hardware, Zoom/Meet/Teams test environments, network fault controls, constrained-storage devices, and staging providers are available.
- Fixed synthetic Vietnamese/English audio, transcript, minutes, export, and large-library fixtures are versioned.
- Missing required physical devices or provider accounts is a truthful blocker for affected acceptance IDs.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P23        | Verified outputs and invariants consumed by this packet. | `../evidence/P23/EVIDENCE.md` | VERIFIED          |

# Scope firewall

## In scope

Cross-product qualification harnesses, fault injection, long sessions, load/latency/memory/storage/drift budgets, accessibility/localization audits, supported-platform compatibility, root-cause remediation of release-blocking defects, and final qualification reports.

## Out of scope

New features, new supported platforms, macOS system audio, local AI/import (P28), architecture replacement, visual redesign, and lowering targets to match current output.

## Allowed paths

Qualification tests/harnesses/fixtures, affected implementation paths required for root-cause fixes, performance/accessibility configuration, and focused docs/evidence. Every implementation edit must reference a failed scenario and regression test.

## Forbidden paths

Unrelated refactors, disabled/quarantined critical tests, production data, hidden platform exclusions, and silent scope reductions.

## Extension seams

Device/platform and scenario matrices are data-defined so later OS versions/devices can be added without copying the harness.

# Contracts and invariants

- Qualification scenarios use stable IDs `Q-REC`, `Q-SYNC`, `Q-SPEECH`, `Q-DATA`, `Q-AI`, `Q-EXPORT`, `Q-PRIV`, `Q-A11Y`, and `Q-PERF` with environment metadata and artifact hashes.
- Performance budgets include local control p95 <200 ms, realtime transcript p95 <3 s under supported conditions, API metadata p95 <500 ms, bounded capture buffers/memory, and documented personal-scale library/editor/export thresholds.
- Every expected source range is present, explicitly paused, or marked as a gap; silence is never used to hide loss.
- Accessibility qualification covers keyboard, visible focus, screen-reader labels/order, text scaling, contrast, motion, error identification, and non-color status.
- A failed critical scenario blocks verification until root cause and regression evidence exist.

# File and ownership map

| Path                                 | Responsibility                                      | Task owner            |
| ------------------------------------ | --------------------------------------------------- | --------------------- |
| `tests/qualification/fixtures/`      | Versioned synthetic datasets and matrix definitions | Harness package       |
| `tests/qualification/resilience/`    | Fault injection and long-session scenarios          | Resilience package    |
| `tests/qualification/performance/`   | Latency/load/memory/storage/drift benchmarks        | Performance package   |
| `tests/qualification/accessibility/` | Automated/manual a11y and localization cases        | Accessibility package |
| affected product paths               | Bounded root-cause fixes only                       | Owning implementer    |
| `docs/execution/evidence/P24/`       | Raw reports, environment matrix, and sign-off       | Independent reviewer  |

# Ordered task packets

## P24-T01 - Freeze qualification matrix, fixtures, and budgets

Map every PRD release criterion and Test Strategy scenario to platforms, fixtures, commands, thresholds, evidence, and reviewer. Add validation that fails for an unmapped scenario, missing device/OS, mutable fixture, or threshold without source. Evidence: `evidence/P24/qualification-manifest.json`.

## P24-T02 - Mobile two-hour and lifecycle resilience

On supported physical Android/iOS devices run start, record, pause/resume, background/interruption, network loss, low storage, kill/restart, upload, recovery, finalize, playback, and deletion. Capture safe sample/chunk/checksum counts, memory, battery, control latency, and gaps. Reproduce/fix defects and rerun affected plus baseline scenarios. Evidence: `evidence/P24/mobile-matrix.json`.

## P24-T03 - Windows two-hour capture and application compatibility

Run mic/system/both capture with supported USB/Bluetooth/default devices and Zoom/Meet/Teams across unplug/replug, default change, sleep/wake, overflow injection, native crash, and network/provider outage. Compare source sample counts, drift, explicit gaps, memory, and derived mix; independently play each source. Evidence: `evidence/P24/windows-matrix.json`.

## P24-T04 - Cloud, queue, storage, provider, and deletion fault campaign

Inject PostgreSQL/Redis/object/JWKS/provider/worker/network failures at every accepted boundary. Prove idempotency, PostgreSQL recovery, bounded retries, no cross-user access, no source mutation, and truthful partial states through finalization, minutes, export, and deletion. Evidence: `evidence/P24/service-fault-matrix.json`.

## P24-T05 - Performance and capacity qualification

Run repeatable performance tests for API metadata, signed URL flow, queue throughput/age, finalization/backfill, provider latency, two-hour transcript virtualization/search/seek, minutes context assembly, large export, library pagination, and deletion. Measure p50/p95/p99, memory/CPU/storage, sample size, warm/cold conditions, and bottleneck. Evidence: `evidence/P24/performance-report.json`.

## P24-T06 - Accessibility and localization qualification

Run automated scans plus manual keyboard/VoiceOver/TalkBack/Windows screen-reader and 200% text/contrast/focus tests across start, recording, recovery, review, editor, export, privacy, and errors. Verify all UI catalogs in Vietnamese/English, interpolation/plurals, truncation, dates/timezones, and language independent of meeting language. Evidence: `evidence/P24/a11y-l10n-matrix.json`.

## P24-T07 - Root-cause remediation and full regression

Triage every failure by severity/classification, add regression before/with the smallest fix, run narrow and related suites, and repeat the affected platform scenario. No critical test is quarantined. Rerun the complete repository verify/security/resilience/performance/E2E set after integration. Evidence: `evidence/P24/defect-register.md`.

## P24-T08 - Independent qualification review and sign-off

An independent reviewer checks raw artifacts against the manifest, validates test counts/versions/thresholds, samples source/checksum evidence, confirms zero unresolved critical/high defects, and records limitations. Evidence: `evidence/P24/EVIDENCE.md` and signed qualification summary.

# Subagent work packages

| Package                     | Task IDs | Exclusive paths                      | Depends on | Review gate             | Output               |
| --------------------------- | -------- | ------------------------------------ | ---------- | ----------------------- | -------------------- |
| Harness                     | T01      | qualification fixtures/config        | P23        | coverage review         | manifest             |
| Mobile                      | T02      | mobile tests + bounded fixes         | T01        | device/data-loss review | mobile report        |
| Windows                     | T03      | desktop/native tests + bounded fixes | T01        | audio/data-loss review  | Windows report       |
| Services/performance        | T04,T05  | service/perf tests + bounded fixes   | T01        | reliability/perf review | fault/perf reports   |
| Accessibility               | T06      | a11y/l10n tests + bounded fixes      | T01        | manual a11y review      | accessibility report |
| Main + independent reviewer | T07,T08  | integration/evidence                 | all        | full qualification      | final sign-off       |

# Failure and debugging matrix

| Failure                                               | Classification | Expected behavior                               | Content-free diagnostics  | Recovery/regression           |
| ----------------------------------------------------- | -------------- | ----------------------------------------------- | ------------------------- | ----------------------------- |
| Missing/unavailable device                            | environment    | Mark exact matrix cell blocked                  | model class/OS only       | rerun on required device      |
| Intermittent critical failure                         | timing         | Treat as failure; isolate race                  | timestamps/counters/state | deterministic stress test     |
| Threshold missed                                      | performance    | Profile and fix root cause; do not relax target | aggregates/profile IDs    | benchmark regression          |
| Accessibility automation passes but manual flow fails | platform       | Manual failure controls gate                    | screen/element ID         | manual + automated regression |
| Fault loses acknowledged source                       | persistence    | Critical release block; preserve artifacts      | chunk/checksum/state      | crash-boundary regression     |

# Integrated verification

Run `pnpm verify:release`, complete mobile/desktop E2E, `pnpm test:security`, `pnpm test:resilience`, `pnpm test:performance`, Rust checks/benchmarks, and the full manual platform/provider/accessibility matrix. Record intended/executed counts and raw report hashes.

| Gate                  | Command               | Intended signal                                                                 | Evidence                   |
| --------------------- | --------------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify:release` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P24/EVIDENCE.md` |

# Acceptance gate

- [ ] P24-A01 - Every mandatory critical scenario maps to and passes a current artifact on every required platform.
- [ ] P24-A02 - Two-hour mobile/Windows sessions show zero silent source loss and bounded resources.
- [ ] P24-A03 - Fault campaign proves idempotent recovery and truthful partial/failure states.
- [ ] P24-A04 - All performance budgets pass under declared conditions and dataset sizes.
- [ ] P24-A05 - Critical flows pass automated and manual accessibility/localization matrices.
- [ ] P24-A06 - Zero unresolved critical/high data-loss, security, accessibility, or performance defects remain.

# Migration, rollout, and rollback

This phase does not deploy production. Bounded fixes follow existing migration/feature-flag rollback rules. Any support-matrix change requires P00/product approval and synchronized docs, not a hidden exclusion.

# Required documentation updates

Update Test Strategy measured thresholds, supported platform matrix, known limitations, `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`, and P24 evidence.

# Conversation boundary

Qualification and regression-backed release-blocker fixes only. Do not add features/platforms, redesign architecture/UI, lower thresholds, quarantine critical tests, or include optional P28. Stop before P25.

# Handoff record

Use `templates/HANDOFF_TEMPLATE.md`. Unblock P25 only.
