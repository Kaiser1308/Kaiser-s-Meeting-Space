---
phase: P11
title: Secure Electron shell and supervised Rust native runtime
status: NOT_STARTED
depends_on: [P07]
requirements: [FR-1, NFR-Security, ADR-006]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Desktop is a packaged-development Electron main/preload/renderer application with a narrow versioned bridge to a supervised Rust runtime. IPC is allowlisted and validated on both sides, renderer privileges are minimal, Rust private storage passes P07 recovery conformance, and a deterministic simulator proves crash/device/chunk behavior without claiming real audio.

# Authoritative context

Read Tech Stack desktop/native guardrails, ADR-006, Security Electron/local-device threats, P00 support/capture profile, P02 envelopes/errors, P07 contracts/evidence, and Meetily boundary lessons.

# Preconditions and external prerequisites

P07 is `VERIFIED`; approved Node/pnpm/Rust stable/Windows SDK/build tools are available. Development packaging may be unsigned; signing is P26 and must remain labeled unavailable.

# Scope firewall

**Allowed:** Electron main/preload/renderer split, desktop build config, `packages/native-contract/`, `native/kms-native/`, process supervision, Rust private storage/SQLite/checksum adapter, deterministic simulator, desktop setup parity, IPC/security/conformance/package smoke tests.

**Forbidden/out:** real WASAPI, speech/local AI, TipTap/minutes/export, broad filesystem/process/shell IPC, renderer Node access, production signing/updater, and provider credentials.

**Extension seams:** versioned native capability discovery allows P12/P28 modules without exposing arbitrary commands.

# Contracts and invariants

- Electron uses context isolation, sandbox, no `nodeIntegration`, strict CSP/navigation/window/open/permission policy, and exposes only typed preload methods.
- `NativeEnvelopeV1` has version, request/event/correlation ID, command/event type, payload, timeout/cancel, and safe error; TS/Rust fixtures are byte/semantic conformant.
- Runtime executable path is package-controlled; renderer cannot choose process/path/args/environment.
- Supervisor has bounded restart/backoff and does not restart an active crashed capture blindly; Recovery Inbox owns recovery.
- Native storage is restricted to resolved private app-data root and follows P07 atomic commit/migration/cleanup rules.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| desktop main/preload/config | secure shell/process/window/policy | Electron |
| desktop renderer | UI shell/setup/recovery status only | Desktop integration |
| `packages/native-contract/` | TS schemas/fixtures/client bridge | IPC contract |
| `native/kms-native/` | Rust protocol/runtime/storage/simulator | Rust runtime |
| desktop/native security tests | IPC/path/process/package adversarial tests | Independent reviewer |

# Ordered task packets

## P11-T01 - Secure Electron process split

Write failing Electron security tests/assertions, then implement main/preload/renderer entrypoints, sandbox/context isolation/CSP, navigation/window/permission denial, secure dev/prod URL policy, single-instance/deep-link validation, and safe crash handling. Rerun the exact assertions against development and packaged modes. Evidence: `evidence/P11/electron-security.json`.

## P11-T02 - Rust workspace and runtime lifecycle

Create pinned Rust workspace/binary with startup handshake, version/capabilities, health, graceful shutdown, structured safe errors/logging, and deterministic test clock. Test malformed config, duplicate start, broken pipe, shutdown timeout, panic containment, and no network/provider code. Evidence: `rust-runtime-report.json`.

## P11-T03 - Versioned allowlisted TS/Rust IPC

Define/generate or hand-maintain one reviewed schema source plus golden valid/invalid fixtures. Implement framing/size limits, request correlation, events, cancellation, timeouts, version negotiation, exhaustive command allowlist, and validation both sides. Test unknown/malformed/oversized/replayed/stale messages. Evidence: `ipc-conformance.json`.

## P11-T04 - Bounded native supervision

Spawn only packaged/configured runtime, verify lifecycle, capture stdout/stderr through content-free parser, detect exit/hang, apply restart budget/backoff, and route active-session crash to recovery. Test executable/path/arg injection, rapid crash loop, orphan process, app quit/future-update handoff, and renderer compromise. Evidence: `supervision-report.json`.

## P11-T05 - Rust P07 storage adapter

Implement private-path filesystem, SQLite manifest, checksum, atomic chunk commit, locks/migration, cleanup eligibility, and fault injection behind P07 interfaces. Run the entire P07 conformance/crash suite plus traversal/symlink/reparse and permission-loss tests. Evidence: `rust-storage-conformance.json`.

## P11-T06 - Deterministic native device/capture simulator

Implement configured device enumeration/health, sample/chunk/gap/pause/overflow/format/hot-plug/sleep/crash events and deterministic virtual time. It writes synthetic bytes through P07 adapter and is visibly a simulator. Tests cover repeatable seeds and no fake production capability. Evidence: `simulator-report.json`.

## P11-T07 - Desktop setup parity and packaged-development qualification

Implement P08-equivalent desktop setup using native simulator readiness; run IPC/security/setup/recovery E2E and packaged-development start/stop/crash. Inspect bundle/process tree/permissions and prove renderer lacks Node/fs/process/secret access. Evidence: `evidence/P11/EVIDENCE.md`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Electron | T01,T04 | desktop main/preload/config | P07 | privilege/process review |
| IPC | T03 | native-contract | P02 | version/framing review |
| Rust | T02,T05,T06 | native workspace | T03,P07 | unsafe/path/durability review |
| Integration | T07 | renderer/tests/evidence | all | independent package/security review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Protocol mismatch | contract | Fail closed with upgrade-safe error | version matrix |
| Rust crash during session | platform | Bound restarts; Recovery Inbox sees commits | crash E2E |
| Malformed/unknown IPC | security | Reject; safe metadata only | fuzz/allowlist test |
| Path/process injection | security | Deny before OS operation | adversarial test |
| Packaged sidecar missing | environment | Actionable unavailable state, no simulator substitution | package smoke |

# Integrated verification

Run desktop typecheck/unit/E2E, IPC contract/fuzz tests, Rust fmt/clippy `-D warnings`/test, P07 Rust conformance/fault suite, Electron security/secret/bundle scan, packaged-development smoke on Windows, and `pnpm verify`.

# Acceptance gate

- [ ] P11-A01 - Electron renderer/preload/main privilege boundary passes adversarial tests.
- [ ] P11-A02 - TS/Rust IPC conformance and version/malformed failure are deterministic and bounded.
- [ ] P11-A03 - Rust storage/simulator pass P07 durability/recovery suite.
- [ ] P11-A04 - Supervised runtime crash cannot lose acknowledged chunks or create an unbounded restart loop.
- [ ] P11-A05 - Packaged development artifact starts with no broad capability/secret and clearly identifies unsigned/simulated limits.

# Migration, rollout, and rollback

Development package only. Feature flags select simulator/no-native; rollback preserves manifests and can open Recovery Inbox read-only. Signing/updater is P26.

# Required documentation updates

Architecture native boundary/IPC version, desktop development/build guide, Security threat model, Status/Traceability/Progress, and P11 evidence.

# Handoff record

Unblock P12 only.
