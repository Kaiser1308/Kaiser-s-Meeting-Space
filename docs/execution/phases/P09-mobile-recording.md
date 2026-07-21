---
phase: P09
title: Mobile local-first microphone recording lifecycle
status: NOT_STARTED
depends_on: [P08]
requirements: [FR-2, ADR-001]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Supported Android/iOS development builds capture microphone audio into P07 durable chunks, expose responsive record/pause/resume/end controls, survive documented interruptions/background/route/storage/process failures without network/provider dependence, and never acknowledge source that cannot be recovered.

# Authoritative context

Read P00 capture profile/support matrix, P02 meeting/capture commands, P07 conformance suite, P08 start command, ADR-001, platform audio/background limitations, and Test Strategy scenarios 4,6,7,8,17,19.

# Preconditions and external prerequisites

P08 is `VERIFIED`; supported physical Android and iOS devices, native development build toolchains, private app storage, microphone permissions, and at least one wired/Bluetooth route class are available. Emulator microphone results cannot satisfy physical acceptance.

# Scope firewall

**Allowed:** a local Expo/React Native audio module, Android/iOS native code, P07 platform adapters, capture service/reducer/events, recording controls/health UI, and native/device/fault/performance tests.

**Forbidden/out:** upload/library, speech/translation, hidden auto-recording, system audio on mobile, unsupported persistent background behavior, noise suppression that alters source, and server dependence.

**Extension seams:** typed native module mirrors P07 contracts and preserves raw/native source metadata for future derived processing.

# Contracts and invariants

- Native command/events are versioned and runtime validated: configure/start/pause/resume/stop/status plus chunk/device/interrupt/storage/gap/error events.
- Audio callbacks use bounded preallocated/pooled buffers; no network, provider, database, or blocking file I/O in callback.
- Pause and End close/flush/commit current chunk; Resume opens a new chunk and timeline interval.
- Local-safe acknowledgement occurs only after P07 commit; End remains finalizing/recovery on timeout/failure.
- Route/sample-rate/interruption changes close a valid boundary and record explicit event/gap; never silently switch.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| mobile local audio module shared/JS | typed native interface and fake | JS integration |
| audio module Android sources | AudioRecord/focus/route/chunk adapter | Android |
| audio module iOS sources | AVAudioEngine/Session/interruption/chunk adapter | iOS |
| mobile recording feature | lifecycle reducer/service/controls/health | JS integration |
| native/device/resilience tests | conformance, two-hour, fault matrix | Independent reviewer |

# Ordered task packets

## P09-T01 - Versioned native module contract and deterministic fake

Add TS/native fixture conformance tests for commands/events/version/correlation/cancel/status and P07 adapter ordering. Implement fake capable of chunks, gaps, route changes, overload, disk failure, and crash. Tests reject malformed/unknown/stale events and compare native/TS fixtures. Evidence: `evidence/P09/native-contract.json`.

## P09-T02 - Android durable microphone capture

Implement AudioRecord selection/configuration, bounded callback/ring buffer, writer thread, actual sample counts, P07 atomic commit, audio focus/route/interruption events, and safe shutdown. Native tests cover permission loss, read error, overrun, format/route change, low disk, and process kill. Evidence: `android-capture-report.json`.

## P09-T03 - iOS durable microphone capture

Implement AVAudioSession/AVAudioEngine configuration, bounded handoff, writer/commit, interruptions/route/media reset, actual format/sample metadata, and safe shutdown. Test call/Siri/route/background/storage/engine reset/kill. Evidence: `ios-capture-report.json`.

## P09-T04 - Recording lifecycle and responsive controls

Connect P08 command to native adapter and P02 states; implement duration/source/storage/network warnings, debounced idempotent pause/resume/end, timeline intervals, and local control response. Table/race tests cover rapid taps, stale events, app state, and native errors. Evidence: `recording-state-report.json`.

## P09-T05 - Locally safe End handshake

Implement stop callback -> drain bounded buffers -> close chunk -> durable commit -> manifest interval close -> local-safe event. Inject timeout/crash/error at each boundary; retry/restart remains finalizing/recovery and never claims saved early. Evidence: `end-handshake-matrix.json`.

## P09-T06 - Storage/background/call/Bluetooth behavior

Implement threshold warnings and accepted platform policy: finalize current valid data, pause/stop visibly, record explicit gaps/route changes, and estimate remaining time. Test boundary thresholds and unsupported background modes without hidden recording. Evidence: `mobile-interruption-matrix.json`.

## P09-T07 - Physical-device two-hour and crash qualification

On supported Android/iOS run silence/noise/synthetic playback, rapid pause/resume, network/provider absent, foreground/background, call, wired/Bluetooth change, low storage, native/app kill, restart/recovery, and 2h session. Record checksums/sample counts/gaps/memory/battery/control p95. Evidence: `evidence/P09/EVIDENCE.md`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Contract/JS | T01,T04,T05 | JS module + recording feature | P08 | state/IPC review |
| Android | T02,T06 Android | Android native | T01,P07 | realtime/durability review |
| iOS | T03,T06 iOS | iOS native | T01,P07 | realtime/durability review |
| Independent devices | T07 | tests/evidence only | all | data-loss/platform review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Callback overload | timing | Bounded gap/error; no OOM/block | overload stress |
| Background/call | platform | Finalize/pause/stop per policy visibly | device matrix |
| Route/sample rate changes | platform | Close chunk and record new format/event | route test |
| Kill during write | persistence | Prior ack chunks recover; partial repair/quarantine | kill boundary |
| End timeout | timing | Stay finalizing/recovery; no saved claim | handshake test |

# Integrated verification

Run JS/native unit/conformance, P07 recovery suite on both adapters, mobile E2E recording, resilience/storage/interruption tests, native static checks, physical two-hour matrix, bundle/log scan, and `pnpm verify`.

# Acceptance gate

- [ ] P09-A01 - Every acknowledged mobile chunk survives crash/restart with exact checksum/sample metadata.
- [ ] P09-A02 - Pause/resume/end intervals and state/idempotency are exact under races.
- [ ] P09-A03 - Capture functions with network/providers absent and never logs content.
- [ ] P09-A04 - Supported Android/iOS physical interruption/route/background matrices pass declared limits.
- [ ] P09-A05 - Two-hour memory/buffer/storage/battery and control-latency budgets pass with every loss explicit.

# Migration, rollout, and rollback

Internal development builds only. Feature flag can disable new sessions while leaving native module and Recovery Inbox able to read/finalize existing manifests.

# Required documentation updates

Support limitations, mobile permissions/background behavior, Test Strategy measured budgets, Status/Traceability/Progress, and P09 evidence.

# Handoff record

Unblock P10; P13 still awaits P12/P06.
