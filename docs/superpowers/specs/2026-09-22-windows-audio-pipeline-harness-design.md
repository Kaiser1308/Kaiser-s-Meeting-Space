# Windows Audio and Full-Pipeline Harness Design

## Goal

Provide selectable Windows test profiles for real recording, simulated full
pipeline, and real full pipeline at `5m`, `1h`, `3h`, or `4h`, without forcing
all durations to run in one batch.

## Scope and safety

- The existing simulated stability baseline remains a separate profile and is
  not replaced by the full-pipeline tests.
- Baseline audio input is a local, versioned scripted fixture with a matching
  expected transcript. It contains synthetic meeting dialogue, not real
  meeting content, personal data, or copyrighted YouTube material.
- YouTube or other network media may be used only as an explicitly labelled
  exploratory/manual run. It is never a PASS/FAIL source because its bytes,
  availability, ads, language, and timing are not deterministic.
- Real-audio profiles require an explicit opt-in environment flag, an isolated
  user-data directory, selected Windows device identifiers, and a retention
  policy. They must never default to a personal microphone or profile.
- Recording and baseline capture must not depend on network or AI availability.
  Missing local speech prerequisites produce `BLOCKED`, not a false pass.
- Raw audio and transcript fixture files stay outside Git evidence unless their
  provenance and retention are explicitly approved. Evidence stores hashes,
  byte counts, durations, safe error codes, and aggregate quality metrics.

## User-selectable matrix

Each invocation selects exactly one profile and one duration:

```powershell
pnpm test:windows --profile physical-recording --duration 5m
pnpm test:windows --profile simulator-full --duration 3h
pnpm test:windows --profile physical-full --duration 4h
```

Supported profiles:

| Profile | Capture source | Pipeline coverage | Audio-quality claim |
| --- | --- | --- | --- |
| `physical-recording` | Real Windows microphone/WASAPI path | Start, capture, chunks, stop, manifest/hash, cleanup | Measures device path only; no transcription gate |
| `simulator-full` | Deterministic simulator and local synthetic fixture adapter | Capture lifecycle, storage, finalize, transcript fixture, reopen, export | Synthetic pipeline gate; never a microphone-quality claim |
| `physical-full` | Real Windows microphone/WASAPI path fed by the controlled fixture | Capture, durable chunks, finalize, local transcription, transcript comparison, reopen, export | Full local end-to-end gate when all local prerequisites exist |

The four duration values are `5m`, `1h`, `3h`, and `4h`. The duration is
converted to a monotonic deadline; the selected profile is the only profile
run. A complete matrix run is an explicit operator decision, not an implicit
side effect.

## Audio fixture

The fixture is a short scripted synthetic meeting with stable speaker labels,
dates, numbers, action items, and pause boundaries. It has:

- a versioned fixture identifier and SHA-256;
- a source transcript with immutable revision metadata;
- deterministic playback duration and loop boundaries;
- audible or metadata-safe boundary markers that permit chunk/drop analysis;
- a language declaration matching the local transcription configuration.

For physical recording, the default route is controlled playback through the
selected speakers into the selected microphone so the real device path is
exercised. A separately named loopback route may be supported for a more
repeatable electrical path, but it must not be reported as microphone
qualification. The test records the chosen route in the safe run summary.

Long runs repeat the fixture using deterministic repetition identifiers and
compare the transcript against the expected repeated sequence. The test must
not silently substitute a different fixture, YouTube stream, live meeting, or
network source.

## Shared test kit and runners

`packaged-test-kit` owns reusable mechanics:

- packaged Electron launch and dynamic CDP discovery;
- preload/native IPC invocation and safe response classification;
- isolated user-data and artifact directories;
- Windows process-tree, memory, CPU, and cleanup monitoring;
- monotonic duration pacing and health-sample deadlines;
- screenshot/error metadata redaction and evidence writing.

Profile runners own only scenario behavior:

- `physical-recording-runner`: device selection, fixture playback, physical
  capture assertions, and recording artifact checks;
- `simulator-full-runner`: simulator events plus deterministic storage,
  finalization, transcript, reopen, and export checks;
- `physical-full-runner`: physical recording followed by the same full-pipeline
  checks, with local transcription quality thresholds.

The current simulator-stability runner remains a compatibility wrapper around
the shared kit until the new runners have their own verified gates.

## Full-pipeline assertions

Every full-pipeline profile must verify:

1. capture starts only after runtime/device/storage preconditions;
2. chunks are monotonic and have valid manifest/hash/byte-count metadata;
3. stop/finalize reaches a terminal durable state without orphaned work;
4. source audio remains immutable and derived transcript/export revisions are
   versioned;
5. reopen reads the same meeting and integrity metadata;
6. transcript comparison reports WER/CER, expected phrase coverage, timestamp
   bounds, and safe failure metadata;
7. export output has deterministic format/hash/size metadata and reopens where
   the selected reader is available;
8. the packaged process and all children terminate with no active session or
   unexplained pending work.

If local transcription or reader tooling is unavailable, the run records the
exact missing prerequisite and is `BLOCKED`; it cannot become a stability
PASS by swapping in a mock provider.

## Result contract

Each run writes a sanitized summary containing:

- profile, duration, fixture ID/hash, route, device IDs redacted to stable
  local labels, package/sidecar hashes, and tool versions;
- elapsed wall-clock time, iterations/chunks, health coverage, memory/CPU
  min/max, process-tree status, and cleanup result;
- storage/manifest/finalization/reopen/export outcomes;
- transcript quality metrics or a blocked prerequisite code;
- artifact directory and safe error metadata only.

The result states are `PASS`, `FAIL`, or `BLOCKED`. A shortened run, process
crash, missed health sample, unknown cleanup state, unavailable fixture, or
unavailable required local model is never `PASS`.

## Acceptance boundary

This design adds deterministic harness capability. It does not promote P20 to
`VERIFIED`, does not claim physical-device qualification before a real run
produces evidence, and does not use real meeting content.
