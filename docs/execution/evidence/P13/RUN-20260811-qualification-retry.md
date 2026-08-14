# P13 qualification retry — 2026-08-11 (UTC+7)

## Scope and preservation

- Requested phase: P13 qualification closure only; no product code, corpus asset,
  credential, model, toolchain, or provider configuration was changed.
- The starting working tree was already dirty (1,383 changed files, including
  unrelated build artifacts and successor-phase work). Those changes were
  preserved and are not attributed to this run.
- P13 remains `IMPLEMENTED`; this record does not waive any acceptance gate.

## Direct verification

| Command or inspection | Exit | Result |
| --- | ---: | --- |
| `node scripts/p13-local-evaluation.mjs` | 2 | Fail-closed: `missing_audio_asset`, `missingCount: 10`. The corpus directory contains only `corpus.manifest.json`. |
| `node scripts/p13-deepgram-live.mjs` | 2 | Fail-closed: `missing_rotated_server_key`; `DEEPGRAM_API_KEY` is absent, so no provider request was made. |
| `cargo test -p kms-native` | 101 | `whisper-rs-sys` bindgen cannot discover `clang.dll` or `libclang.dll`; no native test executable was produced. |
| `node ../../node_modules/vitest/vitest.mjs run` in `packages/speech` | 0 | 8 files / 101 tests passed. |
| `node ../../node_modules/vitest/vitest.mjs run` in `packages/native-contract` | 0 | 2 files / 81 tests passed. |
| `node ../../node_modules/vitest/vitest.mjs run src/modules/speech` in `apps/api` | 0 | 3 files / 17 tests passed. |

`pnpm.cmd --filter @kms/speech test:unit` could not open its store SQLite
database. Running Vitest directly required read access to the configured
dependency virtual store and produced the passing package results above.

## Prerequisite audit

- The repository's LLVM-MinGW toolchains provide `clang.exe`, but no
  `libclang.dll`; neither a system LLVM installation nor Visual C++ linker was
  discovered in the inspected locations.
- No reviewed/hash-pinned WAV files are present for the frozen 10-entry corpus.
- No rotated Deepgram server secret or qualified live audio path is configured.

## State and required owner action

P13-A03 through P13-A05 remain unverified. To proceed, provide the reviewed
corpus WAV assets, configure a rotated `DEEPGRAM_API_KEY` solely in approved
server secret storage with qualified audio, and provide/authorize a Windows
native build environment containing `libclang.dll` and a compatible linker.
After those prerequisites exist, rerun the local-quality, Deepgram live, Rust
native, and integrated `pnpm verify` gates before changing the lifecycle state.

## Toolchain remediation continuation

The following tooling was installed after the initial retry, with no product
source changes:

- Official LLVM 22.1.6 Windows development archive at
  `native/.toolchains/clang+llvm-22.1.6-x86_64-pc-windows-msvc`, including
  `bin/libclang.dll`.
- Microsoft Visual Studio 2022 Build Tools C++ workload and Windows SDK
  10.0.26100.0; `vcvars64.bat`, `cl.exe`, and `link.exe` are now available.

With the MSVC Rust toolchain, Visual Studio environment, `LIBCLANG_PATH`, and
`CMAKE_POLICY_VERSION_MINIMUM=3.5`, Cargo built past bindgen, the missing GNU
runtime, and the legacy CMake compatibility failure. The native gate then
stopped on an unrelated pre-existing working-tree change in
`native/crates/kms-native/src/capture/wasapi.rs`: its
`bounded_handoff_retains_overflow_as_a_deliverable_gap` test supplies
`Sender<Result<Vec<f32>, _>>` to a helper that now requires
`Sender<Result<CapturePacket, String>>` (Rust E0308). This capture/P12 change
is outside P13's scope firewall and was not modified. No native test pass is
claimed.
