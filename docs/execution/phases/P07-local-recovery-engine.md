---
phase: P07
title: Shared local manifest, upload queue, and recovery engine
status: NOT_STARTED
depends_on: [P02, P05]
requirements: [FR-2, FR-4, ADR-001, ADR-002]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

A platform-neutral local-capture package defines and proves atomic durable chunk commit, versioned SQLite manifests, bounded upload/reconciliation, truthful crash/disk/corruption recovery, Recovery Inbox actions, and source-cleanup eligibility before mobile/Rust capture adapters exist.

# Authoritative context

Read User Flows recording/recovery, Data Model, P00 capture profile, ADR-001/002/006, Meetily review recovery lessons, and P02/P05 evidence.

# Preconditions and external prerequisites

P02/P05 are `VERIFIED`; fake/in-memory fault filesystem plus real temporary filesystem/SQLite and MinIO/API harness are available. No microphone/WASAPI/device is required.

# Scope firewall

**Allowed:** `packages/local-recovery/`, manifest migrations/store/reducer, filesystem/clock/checksum/upload interfaces, reference/fake adapters, queue/reconciler/recovery/cleanup policy, and conformance/fault tests.

**Forbidden/out:** platform capture, app UI styling, speech, minutes, server library beyond P05 protocol, unconditional source deletion, and network-dependent capture acknowledgement.

**Extension seams:** mobile and Rust adapters must pass the same conformance suite; storage/clock/network are injected.

# Contracts and invariants

- Manifest records schema/meeting/source/chunk IDs, file identity, actual samples/duration/monotonic range, hash/length/format, local/upload/finalize state, pauses/gaps, and version.
- Acknowledgement order is temp write -> flush/fsync -> checksum/length -> atomic rename -> atomic manifest transaction -> acknowledge.
- Upload queue is persisted/bounded, never blocks capture, and uses P05 idempotent register/upload/complete.
- Recovery actions are `Continue | Finalize | Delete`; destructive local delete is explicit and cannot imply cloud deletion.
- Cleanup eligibility requires server-verified hash/state plus approved retention/pin policy; active/recovery/conflict source is never GC-eligible.

# File and ownership map

| Path | Responsibility | Owner |
|---|---|---|
| `packages/local-recovery/src/contracts/` | filesystem/store/clock/checksum/transport interfaces | Manifest |
| `packages/local-recovery/src/manifest/` | schema/migrations/reducer/store | Manifest |
| `packages/local-recovery/src/upload/` | queue/reconcile/backoff | Upload |
| `packages/local-recovery/src/recovery/` | discovery/repair/actions/cleanup | Recovery |
| `packages/local-recovery/test/` | reference adapters/conformance/crash matrix | Independent reviewer |

# Ordered task packets

## P07-T01 - Adapter and durability contracts

Define interfaces and test fixtures for private paths, atomic files, SQLite transactions, monotonic/wall clocks, checksum stream, storage estimate, upload transport, cancellation, and fault injection. Reject unsafe path/clock/unit/schema behavior. Evidence: `evidence/P07/adapter-contract.json`.

## P07-T02 - Versioned manifest and atomic chunk commit

Implement schema/migrations/reducer and reference temp+fsync+hash+rename+transaction protocol. Crash at every syscall/transaction boundary; after restart every acknowledged chunk must exist/hash-match and unacknowledged partials are discoverable/quarantined. Evidence: `commit-crash-matrix.json`.

## P07-T03 - Bounded persisted upload queue

Implement queue states/priorities/concurrency/backoff/jitter/network-aware pause/cancel and P05 register/upload/complete. Test offline capture, restart, duplicate enqueue, queue saturation, auth expiry category, and no memory growth. Evidence: `upload-queue-report.json`.

## P07-T04 - Deterministic local/server reconciliation

Compare local and P05 manifests for missing local/server, uploaded-not-completed, duplicate, conflict, out-of-order, stale version, orphan, and already-finalized states. Produce deterministic actions and stop retries on checksum conflict. Evidence: `reconcile-property-report.json`.

## P07-T05 - Recovery Inbox domain service

Discover incomplete sessions/partials/orphans, calculate safe preview/status/actions, implement Continue/Finalize/Delete state commands, and require explicit confirmation for delete. Test multiple meetings, corrupt/read-only DB, missing files, stale locks, and crash during recovery action. Evidence: `recovery-inbox-report.json`.

## P07-T06 - Verified source cleanup eligibility

Implement pure policy and executor boundary for server-verified, retention-expired, unpinned, non-active source only; dry-run lists decisions. Test every denial reason, concurrent upload/finalize, clock boundary, file missing, and idempotent cleanup. P22 supplies final policy values. Evidence: `cleanup-policy-report.json`.

## P07-T07 - Cross-adapter conformance and full fault campaign

Run fake/reference filesystem and SQLite, P05 real protocol, property sequences, disk full, permission loss, corruption, schema upgrade failure, process kill, network flap, queue overload, and cleanup races. Prove acknowledged-chunk invariant. Evidence: `evidence/P07/EVIDENCE.md`.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
|---|---|---|---|---|
| Manifest/state | T01,T02 | contracts/manifest | P02 | durability/migration review |
| Upload/reconcile | T03,T04 | upload modules | T01,P05 | bounded/idempotency review |
| Recovery/cleanup | T05,T06 | recovery modules | T02-T04 | destructive-action/GC review |
| Independent fault review | T07 | tests/evidence | all | crash/data-loss review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery/regression |
|---|---|---|---|
| Crash after file/before manifest | timing | Orphan discovered; repair/quarantine, never acknowledged | boundary test |
| Manifest references non-durable file | persistence | Corrupt/recovery state; never claim saved | injected fsync failure |
| Disk full | environment | Preserve last valid chunk, truthful stop/recovery | quota test |
| Server checksum conflict | security | Preserve local source, stop retry, action required | conflict test |
| Schema upgrade fails | persistence | Retain old DB/files and open read-only recovery | migration fault test |

# Integrated verification

Run local-recovery unit/property/conformance tests, real filesystem/SQLite fault suite, P05 reconciliation integration, queue resilience, cleanup negative matrix, typecheck, and `pnpm verify`. Directly inspect hashes/files/manifests after restart.

# Acceptance gate

- [ ] P07-A01 - Zero acknowledged-chunk loss/corruption across every commit/crash boundary.
- [ ] P07-A02 - Manifest migration/reducer/reconciliation is deterministic and idempotent.
- [ ] P07-A03 - Upload queue remains bounded, persistent, and independent of network for capture.
- [ ] P07-A04 - Recovery Inbox reports truthful actions/status for every incomplete state.
- [ ] P07-A05 - Cleanup cannot remove active, unverified, conflicted, pinned, or retention-protected source.
- [ ] P07-A06 - Mobile/Rust adapter contracts have a reusable conformance suite.

# Migration, rollout, and rollback

Reference adapters only. Manifest migrations copy/verify before activation and retain previous data on failure. No automatic cleanup enabled before P22 policy.

# Required documentation updates

Data Model local manifest, User Flows recovery, Development adapter guide, Status/Traceability/Progress, and P07 evidence.

# Handoff record

Unblock P08 and P11; execute neither here.
