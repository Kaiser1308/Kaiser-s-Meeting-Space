# P13 Evidence

- Phase/state: P13 — IMPLEMENTED
- Run record: `RUN-20260727-0000.md`
- Date/timezone: 2026-07-27 UTC+7
- Environment: Node.js v24.18.0, pnpm 10.14.0, TypeScript 5.9.3, Vitest 4.1.10, Rust 1.97.1, Windows 11 Pro 10.0.26200
- Starting commit/tree: `2935261` (master) + P00-P12 working tree
- Ending commit/tree: Working tree (additive: `packages/speech/`, `native/crates/kms-native/src/local_speech/`, extended `packages/domain/src/transcript/`, `packages/native-contract/`, `packages/database/drizzle/0007_speech_runs.sql`, `apps/api/src/modules/speech/`)
- Pre-existing dirty files preserved: All P00-P12 working-tree changes preserved.

## Requirement and acceptance mapping

| Acceptance ID | Test or scenario                                                                                                     | Result                     | Artifact                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P13-A01       | Policy/run/part/event contracts versioned, owner-scoped, immutable, idempotent, no SDK leakage                       | VERIFIED (CI grade)        | Domain 356 tests, 100% coverage; DB schema 20 tests; migration 0007 with immutability triggers + idempotency unique index; no @deepgram/sdk in domain/database                                                                |
| P13-A02       | stt-window-v1 deterministic, capture-chunk independent, exact range/overlap lineage                                  | VERIFIED (CI grade)        | `packages/speech/src/core/window-planner.ts`: 41 property tests, 100% coverage, stable SHA-256 hash, no chunkId/chunkIndex reads                                                                                              |
| P13-A03       | Windows local file STT explicit-language, bounded, cancellable, network-independent, cannot interfere with recording | PARTIAL                    | TS IPC + manifest (81 tests); real `whisper-rs` local_speech engine; verified vi/en model manifests; `cargo check` pass; native vi/en inference smoke pass; **WER/timestamp quality and Rust test executable remain pending** |
| P13-A04       | Real Deepgram cloud-live vi/en matrix, consent/session/security controls, provider failure cannot stop capture       | PARTIAL                    | Real `/v1/listen` WebSocket adapter + broker session client; speech package 98/98 tests; owner-scoped token; secret server-side only; **live provider qualification remains pending a rotated server key**                    |
| P13-A05       | Frozen bilingual quality/resource thresholds on minimum Windows                                                      | PARTIAL                    | Corpus frozen (10 entries, vi/en, clean/noisy); evaluation harness; verified local model loading/inference smoke; safe metrics (no content fields); **WER/RtF/timestamp and RTF measurements remain pending**                 |
| P13-A06       | No local→cloud work; credentials absent from clients/domain/logs/telemetry; two-owner controls                       | VERIFIED at contract level | Grep scan clean (no DEEPGRAM_API_KEY in source); broker returns opaque token, not API key; two-owner isolation in adapter test; in-memory persistence filters by ownerId; **live-provider portion BLOCKED**                   |

## Dependency-consumption evidence

P13 exposes to P14:

- `packages/speech/src/core/window-planner.ts` — `planWindowsV1()`, `WindowPlan`, `WindowPlanItem`, `BackfillRange`, `STT_WINDOW_V1`, `WINDOW_MS`, `OVERLAP_MS`, `canonicalStringify()`
- `packages/domain/src/transcript/runs.ts` — `TranscriptRunSchema`, `TranscriptRunPartSchema`, `TranscriptRunSegmentSchema`, run enums
- `packages/domain/src/transcript/events.ts` — `SpeechEventSchema`, `SpeechSafeErrorSchema`, `SpeechEventKindSchema`
- `packages/domain/src/transcript/capability.ts` — `SessionRequestSchema`, `FileRequestSchema`, `SpeechProviderNameSchema`
- `packages/speech/src/core/speech-persistence.ts` — `SpeechEventPersistence` interface, `InMemorySpeechEventPersistence`
- `packages/native-contract/src/speech-manifest.ts` — `ModelManifestEntrySchema`, `ModelManifestSchema`
- `packages/native-contract/src/commands.ts` — `local_speech_*` commands in `NATIVE_COMMANDS`
- `packages/native-contract/src/events.ts` — `local_speech_event` + `LocalSpeechEventPayloadSchema`
- `native/crates/kms-native/src/local_speech/` — bounded engine + manifest/audio validation + real `whisper-rs` adapter
- `packages/database/src/schema/speech-runs.ts` — `transcriptRuns`, `transcriptRunParts`, `transcriptRawEvents` tables
- `packages/database/drizzle/0007_speech_runs.sql` — additive migration with immutability triggers + idempotency index

Consumes from:

- P06 (IMPLEMENTED, orthogonal-gates provision): jobs/outbox/SSE contracts, `JobsMetadataRepository` owner-scoped interface
- P09 (IMPLEMENTED, orthogonal-gates provision): `RecordingService` state surface, `ChunkEvent` types, derived-feed seam
- P12 (VERIFIED): Windows Rust runtime, versioned TS/Rust IPC, SQLite manifest storage

## Commands

| Command                                                                      | Exit code | Intended tests | Executed tests | Report                                                  |
| ---------------------------------------------------------------------------- | --------- | -------------- | -------------- | ------------------------------------------------------- |
| `pnpm --filter @kms/domain test:unit`                                        | 0         | 356            | 356            | 100% coverage (13 files)                                |
| `pnpm --filter @kms/speech test:unit`                                        | 0         | 93             | 93             | 100% coverage (5 files)                                 |
| `pnpm --filter @kms/native-contract test:unit`                               | 0         | 81             | 81             | 2 files                                                 |
| `pnpm --filter @kms/database exec vitest run src/schema/speech-runs.test.ts` | 0         | 20             | 20             | 1 file                                                  |
| `pnpm --filter @kms/api exec vitest run src/modules/speech/routes.test.ts`   | 0         | 7              | 7              | 1 file                                                  |
| `cargo test -p kms-native` (native/)                                         | 0         | 75             | 75             | 33 new local_speech tests; 42 pre-existing              |
| `pnpm --filter @kms/domain typecheck`                                        | 0         | —              | All            | Clean                                                   |
| `pnpm --filter @kms/speech typecheck`                                        | 0         | —              | All            | Clean                                                   |
| `pnpm --filter @kms/native-contract typecheck`                               | 0         | —              | All            | Clean                                                   |
| `pnpm --filter @kms/database typecheck`                                      | 0         | —              | All            | Clean                                                   |
| `pnpm --filter @kms/api typecheck`                                           | 0         | —              | All            | Clean                                                   |
| `cargo check -p kms-native` (native/)                                        | 0         | —              | All            | Clean (3 warnings: unused enum variants for future use) |

## Manual, device, and provider matrix

| Scenario                          | Environment              | Result                 | Artifact                                                                                                                |
| --------------------------------- | ------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Real Deepgram cloud-live vi/en    | Windows + Deepgram API   | BLOCKED                | DEEPGRAM_API_KEY unavailable                                                                                            |
| Real local file STT (whisper.cpp) | Minimum Windows hardware | PARTIAL                | Verified vi/en model files load and pass native inference smoke; quality, RTF, and full Windows IPC gate remain pending |
| Physical device integration       | Android 12+ / iOS 17+    | BLOCKED (out of scope) | Physical devices not available; mobile local STT forbidden                                                              |
| Docker PostgreSQL integration     | Docker 29.6.2            | BLOCKED                | Docker daemon offline                                                                                                   |
| Synthetic adapter conformance     | All CI-grade             | PASS                   | 98 speech + 81 native-contract tests; native Rust test executable unavailable in this host                              |
| Bundle/log/secret scan            | Windows grep             | PASS                   | No DEEPGRAM_API_KEY, audio bytes, or meeting content in P13 source                                                      |

## Security, privacy, and data-integrity review

- No `@deepgram/sdk` import in domain, database, or native-contract (enforced by grep scan).
- `DEEPGRAM_API_KEY` only referenced in `.env.example` (empty value); never in source code, response bodies, tokens, or client bundles.
- `SpeechSafeErrorSchema` is content-free (only code/message/category/retryable; `.strict()` rejects extra fields).
- `UsageEventSchema` allows only units/provider/modelId (no text/audio).
- Immutability triggers (P0311) on `transcript_runs`, `transcript_run_parts`, `transcript_raw_events`.
- Owner-scoped across all domain schemas, DB schema indexes, and persistence interface.
- All test fixtures synthetic; no real meeting content or audio.
- Production local-speech output is tagged `isSimulated: false` after manifest/audio verification; deterministic mocks and conformance fixtures may use `isSimulated: true`.
- No network crates in Cargo.toml (verified via grep-based conformance test).
- Model path validation rejects `..`, absolute paths, drive letters, and shell metacharacters.

## Defects and root-cause fixes

| Defect                                                                              | Classification | Root cause                                                       | Regression test                                   | Fix commit   |
| ----------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------- | ------------------------------------------------- | ------------ |
| `event_type` column used `text` instead of `speechEventKindEnum`                    | Contract       | Column defined as text, not enum; enum declared but unreferenced | speech-runs.test.ts migration inspection          | Working tree |
| `UsageEventSchema.provider` used `z.string()` instead of `SpeechProviderNameSchema` | Contract       | Inconsistent with envelope `provider: SpeechProviderNameSchema`  | events.test.ts: azure rejected, deepgram accepted | Working tree |

## Migration, rollout, rollback, and recovery

- P13 is strictly additive across all packages. No existing files were deleted or contracts broken.
- Feature flags: `speechMode` → `TranscriptionPolicyV1` migration path (unchanged; legacy cannot infer cloud consent).
- Local-final and cloud-live are separate feature flags. Provider/account allowlist and budget apply.
- Rollback: disable new sessions/local jobs while preserving verified models, audio, runs, parts, and raw events.
- Migration 0007 is additive (no DROP/ALTER); rollback removes the three new tables.
- Live key/model binaries never enter the repo.

## Residual risks and owner actions

| Risk                                                                              | Severity | Owner       | Action required                                                                                               |
| --------------------------------------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| Real Deepgram API key unavailable                                                 | HIGH     | Engineering | Provision DEEPGRAM_API_KEY in server secret storage for P13-A04 verification                                  |
| Frozen-corpus quality and Windows IPC qualification incomplete                    | HIGH     | Engineering | Run WER/RtF/timestamp/RTF gates and complete the native Rust executable/Windows qualification for P13-A03/A05 |
| Docker daemon offline                                                             | MEDIUM   | Engineering | Start Docker Desktop for PostgreSQL integration tests; update t07 migration count assert                      |
| Pre-existing t07 migration test count stale                                       | LOW      | Engineering | t07 expects 6 journal entries; actual is 8 (0000-0007); fix count assertion                                   |
| `drizzle-kit generate` for next migration affected by missing 0004-0007 snapshots | LOW      | Engineering | Pre-existing for 0004-0006; 0007 adds to gap                                                                  |

## Final state rationale

### 2026-07-29 gate-closure continuation

- The fail-closed local evaluator was rerun and exited `1` with `missing_audio_asset` for all 10 frozen corpus entries. No WAV asset was created or substituted, so P13-A05 remains unverified.
- The fail-closed Deepgram runner was rerun and exited `1` with `missing_rotated_server_key`; no provider call was attempted, so P13-A04 remains unverified.
- `cargo check -p kms-native` was rerun and exited `1` before crate compilation because `whisper-rs-sys` could not discover `libclang.dll`. Native test-link and full Windows qualification remain unverified.
- Package regression/typecheck reruns were attempted. PowerShell blocked `pnpm.ps1`; `pnpm.cmd` then failed pnpm signature/registry verification, while the existing local install failed on missing `rollup/parseAst` and an unreadable TypeScript target. These are environment failures, not passing evidence.
- GitNexus reported a stale index; refresh was attempted but timed out after 120 seconds while scanning generated native artifacts. No symbol was edited in this continuation.

Run record: `RUN-20260729-1200.md`.

The later native/toolchain continuation is recorded in `RUN-20260729-2300.md`: model manifest hashes match; reproducible `cargo check -p kms-native` passes with exit 0; native test-link exits 101 on duplicate `libstdc++`/`libc++` ABI symbols; the quality and Deepgram runners remain blocked on their real prerequisites. The dependency rehydrate timed out and does not count as a package-gate result.

P13 is **IMPLEMENTED, not VERIFIED**. CI-grade work completed for all 7 tasks:

### 2026-07-28 real local-speech closure continuation

- Commit `94f0050` replaces the native local-speech stub with a real `whisper-rs` engine for fixed `vi`/`en` language selection.
- The runtime now requires `modelSha256`, `sourcePath`, and `sourceSha256`; the audio boundary validates the allowlisted root, WAV structure, exact range, and source checksum before inference.
- Direct verification: `cargo check -p kms-native` completed successfully on Windows using the portable LLVM-MinGW toolchain (three non-blocking dead-code/unused-field warnings).
- Native `cargo test -p kms-native` was attempted but could not produce a test executable in this host: CMake/MinGW initially failed to quote the apostrophe in the workspace path, and the short-path retry exceeded the build timeout while compiling the native dependency. No test or real transcription result is claimed from that attempt.
- Direct native backend smoke subsequently passed for both verified model files using `whisper.cpp` with one second of generated silence: `ggml-small-q5_1.bin` (`vi`) and `ggml-small.en-q5_1.bin` (`en`) each returned inference result `0` and exit code `0`. This proves model loading and native inference availability only; it is not a WER, timestamp, or real-meeting quality result.
- Commit `1231bff` adds the real Deepgram `/v1/listen` WebSocket adapter: brokered token via the `token` subprotocol, fixed `linear16`/16 kHz/mono settings, explicit `vi|en`, diarization, safe normalized interim/final events, and `Finalize` close. Package typecheck passes and the full speech suite passes 96/96 with a fake socket transport; no provider call or live qualification is claimed.
- Commit `33b4baf` adds the broker session client: owner-scoped POST, strict credential/meeting/language validation, token handoff only to the adapter, and content-free provider failure mapping. The full speech suite now passes 98/98.
- P13 remains `IMPLEMENTED`, not `VERIFIED`. Real model inference, frozen-corpus WER/RTF/timestamp thresholds, Deepgram live qualification, and the complete Windows gate still require their external prerequisites.

The older aggregate test-count bullets immediately below are retained as historical baseline context only; they are not current verification claims. Current verified results are the 98 speech tests, 81 native-contract tests, successful native `cargo check`, and the direct vi/en model inference smoke recorded above.

- **356 domain tests** (13 files, 100% coverage) — run/part/segment lineage, events, capabilities
- **98 speech tests** (7 files) — window planner, Deepgram adapter, broker session client, persistence, evaluation
- **81 native-contract tests** (2 files) — IPC commands, events, manifest, golden fixtures
- **Rust local-speech tests** — source is covered, but a complete native test executable was not produced in this host
- **20 database schema tests** (1 file) — speech-runs tables, enums, migration inspection
- **7 API tests** (1 file) — session broker route

Historical baseline: **632 tests** across all P13 packages. Current directly verified package totals are 98 speech tests and 81 native-contract tests; the native Rust test executable was not produced in this host.

P13-A01 (contracts) and P13-A02 (window planner) are fully verified at CI grade. P13-A03 (local STT) is partially verified: real model loading/inference smoke passes, while quality thresholds and the full native Windows gate remain pending. P13-A04 (cloud live) is partially verified with a real adapter/session client and deterministic socket tests; live Deepgram qualification is pending a rotated server key. P13-A05 (quality thresholds) remains pending WER/RtF/timestamp/RTF measurements. P13-A06 (no local→cloud work, credential isolation) is verified at contract level with grep scans.

P14 is unblocked: P13 provides frozen bilingual corpus, deterministic window plans, immutable run/part lineage, local speech IPC boundary, Deepgram adapter interface, session broker route, and idempotent event persistence.

Current implementation note: the historical dependency-list wording above is superseded by the 2026-07-28 closure record: native local speech uses real `whisper-rs` inference with verified vi/en manifests, while live provider and quality gates remain pending.

Evidence interpretation: lines labelled as the historical 2026-07-27 baseline (including the old aggregate counts and stub wording) must not be used as current gate results. The current acceptance table and closure continuation are authoritative for this run.

Offline gate rerun 2026-07-28: direct TypeScript compiler invocation passed for `packages/speech/tsconfig.json`; direct Vitest invocation from `packages/speech` passed 7 files / 98 tests; direct native-contract typecheck and Vitest invocation passed 2 files / 81 tests. Pnpm's lifecycle-build approval remains an environment wrapper issue and is not used as evidence for these package gates.

Native offline rerun: `cargo check -p kms-native` passed using the existing portable LLVM-MinGW target cache (`native/target-whisper-msvcrt`), with only the three previously recorded non-blocking dead-code/unused-field warnings. The default target directory remains unable to rebuild `whisper-rs-sys` because this host lacks a discoverable `libclang.dll`; no Rust test executable claim is added.

Qualification tooling added: `scripts/p13-local-evaluation.mjs` exits content-free with `missing_audio_asset` when the frozen corpus has no hashed WAV assets; `scripts/p13-deepgram-live.mjs` exits content-free with `missing_rotated_server_key` when no server secret is present and refuses the exposed-key fingerprint. Neither script creates a passing report without its real prerequisite.

API speech gate rerun: direct Vitest invocation from `apps/api` passed 3 files / 17 tests. Native Rust local-speech test rerun remained blocked before test execution because `whisper-rs-sys` bindgen could not discover `libclang.dll`; no native test pass is claimed.

Native test follow-up: a temporary reversible `K:` mapping removed the workspace apostrophe path failure, and `WHISPER_DONT_GENERATE_BINDINGS=1` bypassed bindgen correctly. The next build blocker is the upstream `whisper-rs-sys` CMake script adding `/utf-8` for the GNU target; LLVM-MinGW clang treats it as an input path. The mapping was removed afterward, and no external dependency source was modified.

MSVC fallback attempt: the `x86_64-pc-windows-msvc` Rust target is installed, but the host has no Visual C++ `link.exe`; the MSVC build therefore stops before native tests. No Visual Studio Build Tools installation was performed.

## Verification attempt — 2026-07-30

Fresh verification is recorded in `RUN-20260730-verify-attempt.md`. The local-quality and Deepgram runners again failed closed before any unverifiable work (`missing_audio_asset` and `missing_rotated_server_key`). The shared Vitest/Vite resolution defect was repaired and fresh speech (101), native-contract (81), and API speech (17) regressions passed. The native `cargo test -p kms-native` build exceeded the bounded run window, so no Rust test pass is claimed. P13 remains **IMPLEMENTED, not VERIFIED**.
