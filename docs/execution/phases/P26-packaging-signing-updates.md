---
phase: P26
title: Signed desktop/mobile packaging and controlled updates
status: NOT_STARTED
depends_on: [P25]
requirements: [NFR-Security, NFR-Reliability, ADR-006]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Windows desktop and Android/iOS builds are reproducible, versioned, signed by approved identities, distribute through controlled channels, verify the Electron/Rust bundle and update metadata, survive interrupted/failed updates, and support staged rollout/rollback without losing local meeting evidence.

# Authoritative context

Read Tech Stack, ADR-006, Security/Privacy, Deployment Runbook, P11/P12 native evidence, P21 SBOM/threat model, P24 compatibility evidence, and P25 delivery/provenance evidence.

# Preconditions and external prerequisites

- P25 is `VERIFIED` and immutable backend release/staging endpoints exist.
- Approved Windows code-signing identity/HSM or managed signing service, Apple Developer/App Store Connect identity, Android Play signing/internal distribution identity, and protected CI environments are available.
- Exact package IDs, publisher identities, version scheme, update channels, signing owner, rotation/revocation procedure, and supported upgrade floor are approved.
- Missing signing/store identity is a real external blocker; unsigned local artifacts cannot satisfy signing acceptance.

# Scope firewall

## In scope

Desktop installer/package, signed Rust sidecar, bundle verification, updater metadata/channel, Android/iOS release builds, mobile internal distribution, provenance/SBOM attachment, update/rollback/recovery tests, and release operator docs.

## Out of scope

Public marketing/store-launch content, macOS build, new app functionality, backend deployment, enterprise device management, and bypassing store/platform policies.

## Allowed paths

Desktop/mobile packaging config, CI signing/release workflows, update service metadata/config, version scripts, installer/update tests, release docs, and bounded fixes to startup/migration/recovery behavior exposed by packaging.

## Forbidden paths

Private keys/certificates/provisioning secrets, unverified binary downloads, broad native permissions, update code that erases local evidence, or signing steps on untrusted pull-request runners.

## Extension seams

Channel/metadata/signature verification is independent of hosting vendor; future macOS uses a separate reviewed packet and platform identity.

# Contracts and invariants

- `ReleaseManifestV1` binds semantic/build version, commit, API/domain/IPC/local-manifest versions, artifact hashes/sizes/platform/architecture, SBOM/provenance, channel, minimum compatible version, and signatures.
- Electron verifies the packaged Rust binary hash/version/signature before launch; IPC version mismatch fails closed to Recovery Inbox/read-only behavior.
- Updater metadata is signed, HTTPS-delivered, rollback/downgrade protected, and channel-scoped.
- Installer/update failure preserves app-private manifests/chunks/cache and offers safe retry/rollback.
- Signing credentials are non-exportable or protected references, access-audited, and unavailable to untrusted builds.

# File and ownership map

| Path | Responsibility | Task owner |
|---|---|---|
| desktop packaging/updater config | Installer, sidecar bundle, permissions, update client | Desktop package |
| mobile release config | Android/iOS IDs, entitlements, build/update channels | Mobile package |
| release/signing workflows | Protected signing, provenance, promotion | Delivery package |
| release manifest/version tooling | Compatibility and artifact metadata | Contract package |
| packaging/update E2E | install/upgrade/downgrade/tamper/recovery matrix | Independent reviewer |

# Ordered task packets

## P26-T01 - Release/version/compatibility contract

Implement one generated manifest and validator for app/API/domain/IPC/local-store versions, channel, minimum upgrade version, hashes, SBOM, and provenance. Add failing tests for mismatched/unknown versions, stale generated metadata, channel crossing, and non-monotonic release. Evidence: `evidence/P26/release-manifest-report.json`.

## P26-T02 - Reproducible Windows packaging and least privilege

Package Electron renderer/main/preload and the exact Rust runtime with secure defaults, explicit resources, installer/uninstaller, private app-data locations, and no dev tools/secrets. Compare clean builds where deterministic and scan installed files/permissions. Evidence: `evidence/P26/windows-package-report.json`.

## P26-T03 - Windows signing and native bundle verification

Sign installer, application binaries, and Rust runtime through protected CI; verify publisher, timestamp, chain, revocation behavior, artifact hash, and runtime signature before launch. Tamper one component and prove fail-closed recovery. Evidence: `evidence/P26/windows-signing-report.json`.

## P26-T04 - Desktop update channels and recovery

Implement signed stable/beta/internal metadata, staged check/download/install, atomic handoff, health confirmation, rollback/disable switch, and downgrade protection. Test offline, proxy/TLS failure, interrupted download/install, bad signature/hash, incompatible IPC/store migration, low disk, crash, and retained active meeting data. Evidence: `evidence/P26/desktop-update-matrix.json`.

## P26-T05 - Android release build and controlled distribution

Produce signed release AAB/APK with approved package ID, permissions, network security, native audio module, version codes, symbols, SBOM/provenance, and internal track. Test clean install, upgrade from minimum supported build, interrupted sync/active recovery state, background policy, and signature mismatch. Evidence: `evidence/P26/android-release-report.json`.

## P26-T06 - iOS release build and controlled distribution

Produce signed archive with approved bundle/entitlements/privacy manifest, symbols, audio/background declarations, version/build, SBOM/provenance, and TestFlight/internal channel. Test clean install/upgrade, interrupted recording recovery, permission retention/change, and incompatible local migration behavior. Evidence: `evidence/P26/ios-release-report.json`.

## P26-T07 - Signing-key security, rotation, revocation, and artifact retention

Prove protected runner access, least privilege, approval, audit, no key export/logging, rotation procedure, compromised-release response, artifact immutability, and retention. Exercise a synthetic key rotation/revocation path without exposing key material. Evidence: `evidence/P26/signing-controls-review.md`.

## P26-T08 - Independent install/update/rollback qualification

On clean supported Windows/Android/iOS environments install the signed artifacts, connect to staging, run synthetic capture/recovery/sync, upgrade across supported versions, inject update failures, verify signatures/manifests, and uninstall while respecting retained/deleted data policy. Evidence: `evidence/P26/EVIDENCE.md`.

# Subagent work packages

| Package | Task IDs | Exclusive paths | Depends on | Review gate | Output |
|---|---|---|---|---|---|
| Contract/delivery | T01,T07 | version + signing workflows | P25 | supply-chain review | manifest/controls |
| Windows | T02-T04 | desktop packaging/updater | T01 | native/security review | signed package/update |
| Android | T05 | Android release config | T01 | permission/signing review | internal build |
| iOS | T06 | iOS release config | T01 | entitlement/privacy review | internal build |
| Independent qualification | T08 | tests/evidence only | all | install/update review | final matrix |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Content-free diagnostics | Recovery/regression |
|---|---|---|---|---|
| Invalid/tampered artifact | security | Refuse install/launch/update | release ID/hash error | tamper matrix |
| Update interrupted | platform | Keep old healthy version and local evidence | stage/version/error | interruption E2E |
| IPC/store incompatible | contract | Fail before mutation; Recovery Inbox/read-only path | version tuple | upgrade compatibility test |
| Signing identity unavailable | environment | Block signed gate; do not self-sign as substitute | identity/channel only | rerun protected job |
| Uninstall/upgrade removes evidence unexpectedly | persistence | Critical release block | data-class counts | lifecycle regression |

# Integrated verification

Run clean release builds, package/bundle/secret/dependency/SBOM scans, signature verification, desktop update matrix, Android/iOS signed install/upgrade E2E, local-recovery conformance after update, `pnpm verify:release`, and Rust release checks.

# Acceptance gate

- [ ] P26-A01 - Release manifests bind compatible, immutable, scanned artifacts to provenance/SBOM.
- [ ] P26-A02 - Windows installer/app/Rust runtime carry valid approved signatures and fail closed on tamper.
- [ ] P26-A03 - Desktop updates are signed, channel-scoped, interruption-safe, downgrade-protected, and preserve evidence.
- [ ] P26-A04 - Signed Android/iOS internal builds pass clean-install and supported-upgrade matrices.
- [ ] P26-A05 - Signing credentials and release workflows meet least-privilege/rotation/revocation controls.
- [ ] P26-A06 - Independent supported-platform package/update qualification has no critical/high finding.

# Migration, rollout, and rollback

Publish to internal channels first, then beta channels only in P27. Keep prior healthy desktop artifact/update metadata available for rollback subject to security policy. Mobile rollback uses store-managed prior build/forward fix and server feature flags; local schema migrations remain backward/forward recovery-safe.

# Required documentation updates

Update deployment runbook release/signing/update sections, security threat model, supported versions, development release commands, `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`, and P26 evidence.

# Handoff record

Use `templates/HANDOFF_TEMPLATE.md`. Unblock P27 only.
