---
phase: P12
title: Windows microphone and WASAPI system-audio capture
packet_status: ACCEPTED
depends_on: [P05, P11]
requirements: [FR-2, ADR-001, ADR-006]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Supported Windows desktop captures microphone, WASAPI loopback, or both into separate immutable durable source tracks aligned to one monotonic timeline. Device/format/sleep/crash/overflow behavior is explicit, derived mix never replaces source, and two-hour real-app/hardware evidence shows no silent sample loss or unbounded resources.

# Authoritative context

Read P00 support/capture profile, ADR-001/006, P05/P07/P11 evidence, Windows audio/device sections in System Architecture/Test Strategy, and Meetily realtime/buffer/device lessons.

# Preconditions and external prerequisites

P05/P11 are `VERIFIED`; supported Windows build, at least default/USB/Bluetooth microphone classes, loopback-capable output, and Zoom/Meet/Teams synthetic test calls are available. Missing physical matrix cells block verification; simulator cannot replace them.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P05        | Verified outputs and invariants consumed by this packet. | `../evidence/P05/EVIDENCE.md` | VERIFIED          |
| P11        | Verified outputs and invariants consumed by this packet. | `../evidence/P11/EVIDENCE.md` | VERIFIED          |

## Deferred end-to-end qualification lane

P12 implementation may continue while its own physical Windows capture/route
and two-hour rows are open in
[`../DEFERRED_END_TO_END_QUALIFICATION.md`](../DEFERRED_END_TO_END_QUALIFICATION.md).
Those rows remain mandatory for `VERIFIED`; no device, route, or native-link
result may be fabricated or inferred.

# Scope firewall

**Allowed:** Rust Windows device/capture/resample/timeline/buffer/mix/level modules, IPC additions, desktop controls/readiness/health, benchmarks/fault/device tests.

**Forbidden/out:** macOS/Linux, speech/providers, source-track destructive processing, automatic device switch, AI noise removal, production signing, and arbitrary native permissions.

**Extension seams:** capture sources implement a common `CaptureSource` and mix/resample remain derived consumers.

# Contracts and invariants

- Device identity uses stable endpoint ID plus capabilities; default changes are events, not silent source replacement.
- Realtime callbacks do no blocking allocation/file/network work; bounded queue overflow records sample/range gap and safe counters.
- Each source stores actual format/sample counts/monotonic ranges and independent chunk hashes; resampling/mix output is derived.
- Drift correction/zero padding/limiting occur only in derived alignment/mix and are measured/versioned.
- Pause/End uses P07 flush/commit/local-safe handshake; capture remains network/provider independent.

# File and ownership map

| Path                                    | Responsibility                                     | Owner                |
| --------------------------------------- | -------------------------------------------------- | -------------------- |
| Rust Windows device modules             | enumeration, readiness, hot-plug/default/sleep     | Capture/device       |
| Rust capture/buffer modules             | mic/loopback callbacks and bounded handoff         | Capture/device       |
| Rust DSP/timeline modules               | persistent resample, alignment, drift, derived mix | Timeline/DSP         |
| desktop capture feature + IPC           | controls, meters, warnings, device actions         | Desktop integration  |
| audio simulator/property/device harness | two-hour/fault/real-app evidence                   | Independent reviewer |

# Ordered task packets

## P12-T01 - Stable device enumeration and readiness

Implement endpoint IDs, source/capability/format/default/permission/protected-content/readiness errors and persisted selection with explicit fallback prompt. Test hot-plug/default churn, duplicate names, unavailable endpoint, Bluetooth profiles, permissions, and no silent selection. Evidence: `evidence/P12/device-matrix.json`.

## P12-T02 - Realtime-safe microphone and loopback capture

Implement WASAPI shared-mode/event callbacks, bounded lock-free/appropriate handoff, writer workers, exact packet flags/timestamps/sample counts, start/stop ownership, and capture-source isolation. Stress tests inject empty/discontinuous packets, callback delay, overflow, permission/device loss, and protected/unavailable loopback. Evidence: `capture-core-report.json`.

## P12-T03 - Persistent resampling and format boundaries

Implement benchmark-selected resampler instances per source, state preserved across callbacks/chunk boundaries, explicit reset on real format/route boundary, exact input/output counts, latency/group delay metadata, and golden/property tests for rates/channels/drift. Evidence: `resampler-report.json`.

## P12-T04 - Monotonic timeline, drift, gaps, and derived alignment

Map device positions/QPC/monotonic capture intervals, detect discontinuity/drift/dropout/overlap, keep source counts unchanged, and generate versioned derived alignment with explicit padding/correction. Test two clocks, pause, sleep, reset, long-run wrap/precision. Evidence: `timeline-drift-report.json`.

## P12-T05 - Durable chunk and lifecycle integration

Write each source through P11/P07 adapter with capture-profile chunks, pause/resume, storage pressure, End drain/commit/local-safe, restart/recovery, and P05 queue eligibility. Crash at callbacks/buffer/write/rename/manifest/IPC boundaries. Evidence: `windows-commit-matrix.json`.

## P12-T06 - Device monitoring and truthful recovery

Handle unplug/replug, default change, Bluetooth grace, format change, sleep/wake, exclusive conflict, and runtime crash: finalize valid data, prompt/reconnect when accepted, or emit gap/controlled stop. Never silently switch or record fake silence as success. Evidence: `device-recovery-report.json`.

## P12-T07 - Levels, diagnostics, and derived playback/transcription mix

Expose bounded RMS/peak/clip/overrun/drift/source-health counters without audio content; create independently versioned mix with benchmarked gain/limiter only if approved. Test clipping, single-source absence, gap padding, source playback, and diagnostic redaction. Evidence: `mix-diagnostics-report.json`.

## P12-T08 - Simulator/property and physical two-hour qualification

Run simulator stress plus physical mic/system/both sessions for 2h across Zoom/Meet/Teams, USB/Bluetooth/default changes, sleep/wake, network/provider absent, disk/buffer pressure, process/native crash, pause/resume/End. Record OS/hardware classes, sample counts, hashes, drift, gaps, memory/CPU, clips, reconnect, and independent playback. Evidence: `evidence/P12/EVIDENCE.md`.

# Subagent work packages

| Package             | Tasks           | Exclusive paths            | Depends on | Review gate                 |
| ------------------- | --------------- | -------------------------- | ---------- | --------------------------- |
| Capture/device      | T01,T02,T06     | Windows device/capture     | P11        | realtime/device review      |
| Timeline/DSP        | T03,T04,T07 DSP | resample/timeline/mix      | T02        | signal/invariant review     |
| Desktop/lifecycle   | T05,T07 UI      | IPC/UI/storage integration | T01-T04    | durability/privilege review |
| Independent devices | T08             | tests/evidence only        | all        | two-hour/data-loss review   |

# Failure and debugging matrix

| Failure                        | Classification | Expected behavior                                      | Recovery/regression |
| ------------------------------ | -------------- | ------------------------------------------------------ | ------------------- |
| Buffer overflow                | timing         | Bounded explicit gap/counter; no OOM                   | overload stress     |
| Device unplug/default change   | platform       | Finalize valid data and prompt/recover/gap             | device matrix       |
| Clock drift                    | timing         | Derived correction only; source unchanged              | long property test  |
| Loopback protected/unavailable | platform       | Readiness failure/explicit mic choice; no fake success | app/device test     |
| Native crash                   | platform       | Recovery finds committed chunks/partial gap truthfully | boundary crash      |

# Integrated verification

Run Rust fmt/clippy/tests/property/benchmarks, P07 conformance, IPC/desktop E2E, resilience windows-capture, performance audio-2h, source/mix golden checks, content-free diagnostic scan, physical hardware/application matrix, and `pnpm verify`.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P12/EVIDENCE.md` |

# Acceptance gate

- [ ] P12-A01 - Mic/system tracks are separate, checksummed, sample-accounted, and independently playable.
- [ ] P12-A02 - Resample/alignment/mix are derived and never replace/mutate source evidence.
- [ ] P12-A03 - Two-hour source loss/drift/memory/CPU/buffer thresholds pass with every gap explicit.
- [ ] P12-A04 - Supported device/permission/app/sleep/crash/route matrix passes or records exact external blocker.
- [ ] P12-A05 - Capture and local-safe End work with all network/providers unavailable.
- [ ] P12-A06 - Native callbacks/IPC/diagnostics remain bounded, least-privilege, and content-free.

# Migration, rollout, and rollback

Internal Windows development channel only; enable by supported OS/hardware capability. Rollback disables new capture but keeps runtime/storage Recovery Inbox available.

# Required documentation updates

Capture profile measured choice, support/device limitations, native IPC/capabilities, Test Strategy thresholds, Status/Traceability/Progress, and P12 evidence.

# Conversation boundary

Windows capture only. Do not implement speech/providers, macOS/Linux, source-destructive DSP, automatic device switching, or production signing. Stop before P13.

# Handoff record

P13 can start only when P06/P09 are also verified; stop.
