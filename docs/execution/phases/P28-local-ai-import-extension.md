---
phase: P28
title: Optional local speech and immutable audio import extension
status: NOT_STARTED
depends_on: [P14]
requirements: [FR-2, FR-3, ADR-001, ADR-002, ADR-003, ADR-006]
risk: high
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

The personal user may install a verified local speech model and transcribe durable meeting audio without cloud speech, or import supported audio as a new immutable source asset. Both paths enter the existing manifest/finalization/revision pipeline, expose limitations truthfully, and cannot corrupt or replace prior evidence.

# Authoritative context

Read PRD optional local processing scope, User Flows processing selection, System Architecture desktop native boundary, AI/Speech Providers, Data Model, Security/Privacy, ADR-001/002/003/006, P07/P11/P12/P14 evidence, and P24/P27 evidence if P28 is released after production.

# Preconditions and external prerequisites

- P14 is `VERIFIED`; source manifests, file backfill, completeness, and projections are stable.
- Rust build/runtime, supported Windows hardware, disk/memory budgets, model license/source/checksum/signature review, and representative synthetic audio formats are available.
- Local diarization is declared unsupported unless independently implemented/evaluated; no fake speaker labels.
- P28 is optional and cannot modify P27 evidence or block cloud-backed personal release.

# Scope firewall

## In scope

Local speech capability contract, whisper.cpp-compatible Rust adapter, verified model catalog/download/resume/cancel/activation/removal, resource scheduling, local file transcription, immutable audio import/normalization/manifest, UI/status/cancellation, evaluation, security, and recovery.

## Out of scope

Realtime offline diarization guarantees, automatic mixed-language detection, training/fine-tuning, arbitrary executable models/plugins, cloud fallback without explicit user action, video import, meeting merge, and replacement of existing source evidence.

## Allowed paths

`native/kms-native/src/local_speech/`, model management/storage adapters, shared speech/import contracts, desktop processing/import UI, local evaluation fixtures/tests, and focused docs/evidence.

## Forbidden paths

Provider keys in native/client code, writable executable search paths, model activation before verification, imported files overwriting an existing meeting/source, and network dependency during active local transcription after model availability.

## Extension seams

Local engines implement `SpeechProvider` file capabilities with an explicit execution locality/resource profile. Import parsers normalize into the same immutable source-manifest contract and can add reviewed formats later.

# Contracts and invariants

- `LocalModelManifestV1` binds engine/model/version, source URL allowlist, license, SHA-256, byte length, compatible runtime/architecture, language capabilities, resource estimate, and signature/provenance.
- `ModelState = absent | downloading | paused | verifying | ready | active | failed | removing`; only verified `ready` models can atomically become active.
- Download uses a partial file plus resumable range metadata; checksum/signature mismatch quarantines/removes partial data and never changes the active model.
- `AudioImportRequestV1` creates a new meeting/source with original file hash, detected container/codec, duration, normalized derivative link, consent/ownership acknowledgement, and idempotency key.
- Original imported audio is immutable source evidence; normalization/transcription/projections are derived/versioned.
- Local processing is bounded/cancellable and yields recording/native capture resources; it never silently falls back to cloud.

# File and ownership map

| Path | Responsibility | Task owner |
|---|---|---|
| shared speech/import contracts | capabilities, model/import state, errors, events | Contract package |
| Rust local speech modules | engine bridge, model manager, resource/cancel behavior | Native package |
| import/normalization service | format validation, immutable commit, derivative job | Import package |
| desktop UI | model lifecycle, import, progress, limits, cancellation | Client package |
| local evaluation/security tests | quality/resource/license/path/adversarial matrix | Independent reviewer |

# Ordered task packets

## P28-T01 - Local speech and import capability contracts

Add runtime/TS/Rust conformance fixtures for locality, model lifecycle, file transcription events, resource estimates, cancellation, imported source metadata, normalized derivative, and safe errors. Test unknown versions/formats/capabilities and ensure provider SDK/engine types do not escape. Evidence: `evidence/P28/contract-report.json`.

## P28-T02 - Verified model catalog and storage boundary

Implement an allowlisted catalog with licenses/provenance/hashes/compatibility and app-private model paths. Security tests reject traversal, symlink/reparse escape, unapproved URL, unsupported architecture, insufficient disk, and model/license mismatch. Evidence: `evidence/P28/model-security-report.json`.

## P28-T03 - Resumable download, verification, activation, and removal

Implement partial download metadata, range resume, pause/cancel, full hash/signature verification, atomic activation, previous-model preservation, and safe removal. Crash/fail at every boundary and prove either the old active model or one verified new model remains. Evidence: `evidence/P28/model-lifecycle-matrix.json`.

## P28-T04 - Bounded Rust local transcription adapter

Integrate the approved whisper.cpp-compatible engine behind the provider-neutral file interface with thread/memory limits, progress, cancellation, language fixed to `vi|en`, timestamps/confidence where supported, content-free logs, and capture-resource priority. Test OOM prevention, malformed model/audio, cancel/restart, and no-network operation. Evidence: `evidence/P28/local-engine-report.json`.

## P28-T05 - Immutable audio import and normalization

Validate allowlisted containers/codecs/size/duration, copy original to a new local-first source using temp+fsync+hash+atomic manifest, reject duplicate/conflicting idempotency, and generate a versioned normalized derivative without changing original bytes. Test corrupt/truncated/polyglot files, metadata bombs, path abuse, low disk, crash, and duplicate import. Evidence: `evidence/P28/import-fault-matrix.json`.

## P28-T06 - Finalization/backfill/projection integration and UI

Route local transcription/import through P14 jobs, normalized final events, completeness, revisions, evidence seek, and optional later cloud regeneration as a distinct version. Build desktop model/import/progress/cancel/recovery UX with explicit privacy/resource/diarization limitations. End-to-end tests cover success, cancel, crash/restart, offline, later cloud regeneration, and unsupported diarization. Evidence: `evidence/P28/local-flow-e2e.json`.

## P28-T07 - Vietnamese/English quality, resource, and privacy evaluation

Run fixed synthetic noisy/clean/long audio across supported hardware/model profiles; measure word/timestamp coverage, omissions, names/numbers, real-time factor, memory/CPU/disk/battery where applicable, cancellation latency, and no-network/privacy behavior. Define thresholds before tuning. Evidence: `evidence/P28/local-evaluation.json`.

## P28-T08 - Optional release security/recovery qualification

Independently review licenses/provenance, model/import path boundary, binary/model signatures, source immutability, content-free logs, resource isolation, crash recovery, uninstall/update interaction, and cloud-fallback consent. Run the optional release matrix and record supported limitations. Evidence: `evidence/P28/EVIDENCE.md`.

# Subagent work packages

| Package | Task IDs | Exclusive paths | Depends on | Review gate | Output |
|---|---|---|---|---|---|
| Contracts/model manager | T01-T03 | shared contract + model storage | P14 | supply-chain/path review | verified lifecycle |
| Native engine | T04 | Rust local speech | T01-T03 | resource/native review | local adapter |
| Import | T05 | import/normalization | T01 | parser/integrity review | immutable import |
| UI/integration | T06 | desktop local flow | T04,T05 | UX/privacy review | end-to-end flow |
| Evaluation/release review | T07,T08 | tests/evidence only | all | independent quality/security | optional sign-off |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Content-free diagnostics | Recovery/regression |
|---|---|---|---|---|
| Download/hash/signature mismatch | security | Never activate; preserve previous model | model/version/hash status | lifecycle fault test |
| Local engine exhausts resources | platform | Bounded fail/cancel; capture remains prioritized | resource counters/error | constrained-device test |
| Imported file malicious/corrupt | security | Reject/quarantine before source registration | format/size/error | parser adversarial test |
| Crash during import/model swap | persistence | Recover old active model and committed sources only | state/manifest IDs | boundary crash matrix |
| Local diarization unsupported | contract | Show unavailable, do not synthesize speakers | capability flag | UI/contract test |

# Integrated verification

Run TS/Rust contract tests, Rust format/clippy/tests/benchmarks, model lifecycle fault tests, parser fuzz/security scans, import/local-flow desktop E2E, no-network/resource/cancel tests, bilingual evaluation, source-immutability/recovery suites, `pnpm verify:release`, and an independent license/provenance review.

# Acceptance gate

- [ ] P28-A01 - Only allowlisted, license-reviewed, hash/signature-verified compatible models can activate.
- [ ] P28-A02 - Model download/resume/cancel/crash always leaves a verified active model or recoverable non-active partial.
- [ ] P28-A03 - Local transcription is provider-neutral, bounded, cancellable, explicit-language, and network-independent.
- [ ] P28-A04 - Import preserves immutable original bytes and creates only versioned derivatives/projections.
- [ ] P28-A05 - Adversarial file/path/model/resource tests pass without content/secret leakage or capture interference.
- [ ] P28-A06 - Fixed Vietnamese/English quality/resource thresholds and supported limitations are published and pass.
- [ ] P28-A07 - Optional release review confirms no weakening of P14/P21/P27 invariants.

# Migration, rollout, and rollback

Ship behind an optional feature flag and model allowlist. Model catalog changes are signed/versioned and staged. Rollback disables new activation/import while preserving verified models and imported source/recovery records; never delete evidence automatically.

# Required documentation updates

Update PRD/roadmap optional capability status, AI/Speech provider architecture, data model/API/UI flows, security/model provenance, supported resource profiles/limitations, `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`, and P28 evidence.

# Handoff record

Use `templates/HANDOFF_TEMPLATE.md`. Record the optional capability release state and stop.
