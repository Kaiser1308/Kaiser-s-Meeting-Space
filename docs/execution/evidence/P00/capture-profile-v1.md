# Capture Profile v1

**Status:** Accepted (provisional engineering default, pending audio audit review)
**Owner:** Architecture / Audio audit
**Date:** 2026-07-21
**References:** ADR-001, ADR-002, ADR-006, Meetily Reference Review, TECH_STACK.md, SYSTEM_ARCHITECTURE.md, DATA_MODEL.md, P00-design-closure.md

---

## 1. Container and codec

### Recommendation: Opus in WebM

| Aspect                                 | Opus-in-WebM                                                                                                         | WAV                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Compression                            | ~6:1 at 48kHz (e.g. ~96 kbps vs ~1536 kbps for 16-bit stereo)                                                        | None                                             |
| Chunk-level independence               | WebM supports clusters with complete frames; a decoder can verify and play each chunk independently                  | Trivially independent (header per file)          |
| Storage for 2-hour meeting (2 sources) | ~170 MB                                                                                                              | ~2.7 GB                                          |
| Upload bandwidth                       | Proportionally lower                                                                                                 | High                                             |
| Hardware decoder support               | Broad (mobile, web, desktop)                                                                                         | Universal                                        |
| Random access                          | Cluster-based seeks require index                                                                                    | Full PCM = direct sample offset                  |
| Complexity                             | Requires muxer, segmenter, libopus dependency                                                                        | Header + raw PCM write                           |
| Integrity per chunk                    | Each WebM cluster wraps a self-contained Opus packet sequence; a corrupted cluster does not affect adjacent clusters | Corrupted sample range is contained to that file |

### Justification

For a recording app where chunks must be independently verifiable:

1. **Chunk-level integrity.** A WebM chunk is a self-contained media segment. A decoder can parse, play, and checksum an individual chunk without referencing any other chunk. WAV provides the same property trivially (each file is self-contained), but at extreme storage cost.

2. **Storage efficiency.** Two-hour meetings with two source tracks (microphone + system audio) at WAV 48kHz/16-bit mono would consume ~2.7 GB locally before upload. Opus at ~96 kbps per stream reduces this to ~170 MB, fitting comfortably within mobile device storage budgets and reducing upload time.

3. **Upload and sync cost.** Smaller chunks upload faster and consume less bandwidth, which is critical for mobile metered connections and background upload retry.

4. **ADR-001 (local-first chunked recording).** Chunks must be local-first, independently finalized, and verifiable before upload. Opus-in-WebM satisfies this with a mature container that supports per-chunk checksums.

5. **ADR-006 (Rust native runtime).** The Rust runtime will include libopus for encoding. The `opus` and `webm` crates are mature in the Rust ecosystem and supported on Windows, Android, and iOS.

### Configuration baseline

| Parameter           | Value                                                                                                 | Reason                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Codec               | Opus (libopus)                                                                                        | Open, royalty-free, SILK + CELT hybrid, excellent speech quality at low bitrate |
| Container           | WebM (Matroska subset)                                                                                | Self-contained clusters, streaming-friendly, wide compatibility                 |
| Bitrate             | 96 kbps per mono stream                                                                               | Transparent for speech at 48kHz; adjustable per benchmark (range 64-128 kbps)   |
| Opus frame duration | 20 ms                                                                                                 | Default frame size; balances latency and compression efficiency                 |
| Complexity          | 5 (default on `opus_encode`)                                                                          | Midpoint between encode speed and compression ratio                             |
| End-to-end test     | Verify that a chunk can be decoded independently using `opusdec` or equivalent on all three platforms | Confirms chunk-level independence                                               |

### Rejected: WAV

WAV at 48kHz/16-bit mono consumes ~1.35 GB per source for a two-hour meeting. Two sources would exceed typical mobile local storage budgets. Upload bandwidth and time increase proportionally. WAV is offered as a future export format, not the capture profile.

---

## 2. Sample rates

### Recommendation: Normalized 48 kHz

| Source                                 | Native rate                                 | Signal path              |
| -------------------------------------- | ------------------------------------------- | ------------------------ |
| Windows WASAPI (microphone)            | Typically 48 kHz (shared mode default)      | Direct capture at 48 kHz |
| Windows WASAPI (system audio loopback) | Always 48 kHz in WASAPI shared mode         | Direct capture at 48 kHz |
| Android (AudioRecord)                  | Varies: 44.1 kHz, 48 kHz, or device default | Resample to 48 kHz       |
| iOS (AVAudioEngine)                    | Varies: 44.1 kHz or 48 kHz typical          | Resample to 48 kHz       |

### Rationale

- WASAPI shared mode defaults to 48 kHz (Windows 11). System audio loopback is exclusively 48 kHz. A single normalized rate avoids unnecessary resampling on the primary desktop target.
- Mobile devices commonly support 48 kHz, but 44.1 kHz appears on some older hardware. A persistent resampler handles the mismatch.
- Opus encodes at up to 48 kHz natively. Resampling to a lower rate (e.g. 16 kHz) would discard information useful for diarization and acoustic analysis while saving negligible bandwidth.

### Resampling policy

| Concern             | Policy                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Resampler type      | Persistent anti-aliased resampler (libsamplerate or equivalent); one instance per capture stream                                            |
| Re-creation         | Never re-create the resampler per callback. Allocate once at stream start (ADR-006, Meetily Review item 3)                                  |
| Quality             | SRC_SINC_BEST_QUALITY (or equivalent) for capture. Linear interpolation is insufficient                                                     |
| Source change       | If the device format changes mid-stream, close the current chunk, reconfigure resampler, and log the format change event                    |
| Downsample source   | Source chunks store the **captured** sample rate in chunk metadata. Normalized rate is a project requirement, not a raw-storage requirement |
| Upstream constraint | The derived mix (section 11) is always 48 kHz regardless of source format                                                                   |

---

## 3. Bit depth

### Recommendation: 16-bit signed integer

| Bit depth      | Storage per hour (mono 48 kHz) | Headroom       | Use case                       |
| -------------- | ------------------------------ | -------------- | ------------------------------ |
| 16-bit integer | ~34 MB (Opus ~43 MB packed)    | ~96 dB SNR     | Speech transcription, evidence |
| 24-bit integer | ~51 MB (Opus ~52 MB packed)    | ~144 dB SNR    | Studio recording               |
| 32-bit float   | ~69 MB (Opus ~69 MB packed)    | ~1528 dB range | Mixing / post-production       |

### Justification

1. **Speech transcription adequacy.** 16-bit / 48 kHz provides ~96 dB signal-to-noise ratio, which exceeds the dynamic range of consumer microphones and typical meeting room acoustics (ambient noise floor ~30-40 dB SPL, speech peaks ~70-80 dB SPL). The encoding noise of 16-bit is well below perceptual thresholds for speech.

2. **Storage efficiency.** 16-bit halves storage relative to 24-bit and reduces it by ~50% relative to 32-bit float. For two-hour meetings with two source tracks, this difference is material.

3. **Opus encoding.** Opus accepts 16-bit PCM as input. 24-bit and 32-bit inputs are dithered to 16-bit internally by libopus in VBR mode. There is no quality benefit to feeding higher bit depths into Opus.

4. **Provider compatibility.** Deepgram and all evaluated speech providers accept 16-bit / 48 kHz PCM. No downstream pipeline requires higher bit depth.

### Edge cases

| Edge case                              | Policy                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| WASAPI exclusive-mode 24-bit input     | Downsample to 16-bit in the persistent resampler; log format change                                          |
| iOS 24-bit capture                     | Convert to 16-bit in the native audio unit; a dither (flat TPDF) is applied if bit depth reduction is needed |
| Future local ML model requiring 24-bit | The resampler can be configured per stream at start time; this is not a capture profile change               |

---

## 4. Channel policy

### Recommendation: Mono per source track

| Track               | Channels | Description                                                                                 |
| ------------------- | -------- | ------------------------------------------------------------------------------------------- |
| Microphone source   | 1 (mono) | Single-channel capture from the selected microphone device                                  |
| System audio source | 1 (mono) | Single-channel loopback from Windows WASAPI loopback (or mobile equivalent when applicable) |

### Invariant

**Never premix.** Microphone and system audio are written to separate chunk sequences with distinct `(meetingId, source, chunkIndex)` keys. A single meeting produces two independent chunk streams.

| Violation                             | Consequence                                                                                                      | Enforcement                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Store mixed stereo recording          | Loses independent source evidence and makes later recovery/diarization harder (Meetily Review, rejected pattern) | ADR-002 (immutable source evidence), P00 phase packet invariant |
| Interleave mic and system in one file | Makes per-source verification impossible without splitting                                                       | Separate chunk index counters per source                        |

### Multi-channel input handling

| Scenario                                       | Policy                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASAPI provides stereo microphone (2 channels) | Downmix to mono (L+R / 2) before encoding. Log the original channel count in chunk metadata                                                                   |
| iOS captures stereo from a headset mic         | Downmix to mono. The capture profile targets speech, not spatial audio                                                                                        |
| User selects two microphones                   | Each microphone is a separate source track with its own `source` identifier. This is a future capability; profile v1 supports one microphone source at a time |

---

## 5. Chunk duration

### Recommendation: TBD — benchmark decision required

The phase P00 packet requires that `capture-profile-v1` be selected "through a documented benchmark" (P00-design-closure.md, locked engineering defaults). Until the benchmark is run, the final value is **provisional**.

### Candidates

| Duration   | Rationale                                                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5 seconds  | Lower per-chunk latency for pause/resume. More chunks (720 per source for a 1-hour meeting). Higher per-chunk overhead (WebM headers, manifest entries, checksum compute). Finer crash recovery granularity    |
| 10 seconds | Half the chunk count (360 per source for 1 hour). Lower manifest size. Better compression ratio per chunk (WebM overhead amortized over more audio). Slightly coarser crash recovery — at most 10 seconds lost |

### Benchmark procedure

The following procedure determines the final value. This document records the methodology only; results will be appended after execution.

#### Test environment

| Parameter        | Value                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| Device classes   | Windows 11 x64 (desktop), Android 12+ (mid-range phone), iOS 17+ (recent iPhone) |
| Storage          | Local SSD (desktop), internal flash (mobile)                                     |
| Chunk storage    | Local filesystem, dedicated temp directory                                       |
| Meeting duration | 1 hour (representative meeting), 2 hours (max alpha target)                      |
| Sources          | Microphone + system audio simultaneous (desktop); microphone only (mobile)       |

#### Metrics collected

| Metric                     | Collection method                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Chunk write latency (p99)  | High-resolution timer around `write → fsync` per chunk                                  |
| Checksum compute time      | Timer around `SHA-256` computation per chunk                                            |
| Total chunk overhead       | Sum of write + fsync + checksum across all chunks                                       |
| Storage overhead ratio     | (Total chunk file size on disk) / (Raw audio duration x bitrate)                        |
| Pause/resume latency       | Time from pause button to last chunk finalized; time from resume to first chunk written |
| Crash recovery granularity | Maximum audio loss inferred from last complete chunk timestamp vs crash time            |
| Manifest entry count       | 2 sources x chunks per duration                                                         |
| Upload queue pressure      | Number of chunks enqueued for upload at meeting end                                     |

#### Decision rule

1. If the p99 write + checksum latency for 10-second chunks exceeds 500 ms on any target device, select **5 seconds**.
2. If the p99 write + checksum latency for 5-second chunks exceeds 500 ms, investigate storage bottleneck before narrowing further.
3. If both durations meet the latency budget, select **10 seconds** (lower overhead, fewer manifest entries, better compression efficiency).
4. If crash-granularity analysis shows that 10 seconds of lost audio on a crash event is unacceptable per the alpha success criteria (PRD § 2, "Recoverable audio after simulated network loss: 100%"), select **5 seconds**.

---

## 6. Stable IDs

### Device IDs

Devices are identified by **stable OS endpoint IDs**, never by display name.

| Platform | Endpoint ID source                                        | Stability                                                       |
| -------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Windows  | `IMMDevice::GetId()` (WASAPI device ID)                   | Stable across sessions for the same physical/logical device     |
| Android  | `AudioDeviceInfo.getId()` (native ID)                     | Stable across device reconnects                                 |
| iOS      | `AVAudioSession.sharedInstance().currentRoute` + port UID | Stable for the same physical port; Bluetooth re-pair may change |

### ID invariant

| Policy                                      | Rationale                                                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Display names are not stable IDs            | The user can rename a device; a display name can collide across devices                                                                 |
| Device health events reference endpoint IDs | Hot-plug, disconnect, reconnect, format-change events carry the endpoint ID, not a display name                                         |
| Fallback prompt                             | If the endpoint ID changes mid-meeting, close the current chunk, log the old and new IDs, and prompt the user before switching silently |

### Chunk IDs

Chunk IDs follow the format:

```
{meetingId}/{source}/{chunkIndex}
```

| Component    | Type                                  | Example                                                |
| ------------ | ------------------------------------- | ------------------------------------------------------ |
| `meetingId`  | UUID v7                               | `01J5T8X7K2...` (time-ordered UUID for stable sorting) |
| `source`     | Enum: `mic` \| `system`               | `mic`                                                  |
| `chunkIndex` | u32, zero-based, monotonic per source | `0`, `1`, `2` ...                                      |

### Chunk ID invariants

1. Unique per `(meetingId, source, chunkIndex)` combination (DATA_MODEL.md, AudioAsset entity).
2. Chunk index is monotonic per source — no gaps are permitted in index assignment. Timeline gaps are recorded separately (section 8).
3. Chunk ID is assigned at chunk start and is stable across retries (ADR-001).
4. Re-upload with the same chunk ID and matching SHA-256 is idempotent. Re-upload with the same chunk ID and differing SHA-256 is rejected (DATA_MODEL.md, AudioAsset).

---

## 7. Monotonic clock

### Clock source

| Component              | Clock                                                                                                             | Resolution                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Capture timeline       | Performance counter (e.g. Windows `QueryPerformanceCounter`, Android `System.nanoTime`, iOS `mach_absolute_time`) | Sub-millisecond                                      |
| Wall-clock correlation | UTC-based timestamp captured at chunk boundaries                                                                  | 1 ms resolution (ISO 8601 with millisecond fraction) |

### Correlation procedure

1. At chunk start (first audio callback for a new chunk):
   - Record performance counter value `C_start`.
   - Record wall-clock timestamp `W_start` (UTC).
2. At chunk end (last audio callback for the chunk):
   - Record performance counter value `C_end`.
   - Record wall-clock timestamp `W_end` (UTC).
3. Chunk manifest stores:
   - `wallClockStart`: ISO 8601 UTC timestamp of chunk start.
   - `wallClockEnd`: ISO 8601 UTC timestamp of chunk end.
   - `monotonicRange`: `[C_start, C_end]` with clock frequency for cross-system correlation.
   - `expectedDurationMs`: `(C_end - C_start) / frequency * 1000`.
   - `capturedDurationMs`: Actual number of audio samples / sample rate.

### Invariant

- The monotonic timeline is the authoritative reference. Wall-clock times are correlated for display and cross-device synchronization.
- Performance counter frequency is obtained once at process start and assumed constant for the session. Frequency changes (e.g. CPU power state transitions on some hardware) are logged and trigger a chunk boundary if the delta exceeds 10 ppm vs expected.

---

## 8. Pause, gap, and drift semantics

### Pause

| Event           | Behavior                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Pause initiated | Close the active chunk immediately (finalize + fsync). Do not wait for the current chunk duration window.                          |
| Chunk recorded  | The chunk will be shorter than the configured chunk duration. This is valid — chunks are bounded in maximum duration, not minimum. |
| Manifest entry  | Timestamp the closed chunk with actual wall-clock and monotonic end times.                                                         |
| Resume          | Start a new chunk with `chunkIndex = next` for each source. The monotonic clock continues — the timeline is **not reset**.         |
| Timeline record | Emit a pause interval event: `{ type: "pause", startMs, durationMs }` derived from monotonic clock deltas.                         |

### Gap

| Scenario                                | Policy                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Source device disconnected              | Close current chunk. Emit a gap marker on the timeline from monotonic clock of last sample to clock of resume/failure.                 |
| Buffer overflow (section 9)             | Emit a gap marker covering the dropped interval.                                                                                       |
| Application crash before chunk finalize | The recovered chunk (pre-crash partial data) is treated as a gap segment. The Recovery Inbox (ADR-001) provides the user with choices. |
| Network interruption                    | Not a gap — local capture continues uninterrupted. Gaps apply only to capture, not upload.                                             |

Gap markers carry:

- `type: "gap"`
- `description`: Machine-readable reason code (e.g. `source_disconnect`, `buffer_overflow`, `crash_recovery`).
- `startMs`, `endMs`, `durationMs`: Position on the monotonic timeline.

Gaps are **explicit** and **never silently merged** into adjacent chunks (PRD NFR, "No silent gaps; every gap is explicitly marked").

### Drift

Drift is detected by comparing captured chunk duration against expected chunk duration.

| Measure                 | Formula                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| Expected chunk duration | `chunkDurationMs` (e.g. 5000 ms or 10000 ms), adjusted for pause-truncated chunks |
| Captured chunk duration | `sampleCount / sampleRate * 1000`                                                 |
| Per-chunk drift         | `capturedDurationMs - expectedDurationMs`                                         |
| Cumulative drift        | Sum of per-chunk drift over the meeting                                           |

#### Drift thresholds

| Drift magnitude                             | Action                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `< 10 ms` per chunk                         | Log at trace level; no user-facing action                                           |
| `10-100 ms` per chunk                       | Log at info level; include in meeting diagnostics                                   |
| `> 100 ms` per chunk or cumulative > 500 ms | Log at warning level; emit a diagnostics event; timeline marker noting drift offset |
| Persistent drift > 1% sample rate mismatch  | Flag the device as potentially faulty; surface in the Recovery Inbox                |

#### Drift correction

Drift is **recorded, not corrected** in source chunks. The monotonic timeline preserves the measured drift. The derived mix (section 11) may apply resampling drift compensation for playback continuity. Source evidence is never resampled to hide drift.

---

## 9. Buffer limits

### Ring buffer configuration

Each capture source (microphone, system audio) has a dedicated bounded ring buffer that decouples the audio callback thread from the encoding/write thread.

| Parameter             | Value                       | Calculation                                                                                                             |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Duration              | 500 ms                      | Balances callback latency tolerance vs memory cost                                                                      |
| Sample rate           | 48 kHz                      | Normalized capture rate                                                                                                 |
| Bit depth             | 16-bit (2 bytes per sample) | Per section 3                                                                                                           |
| Channels              | 1 (mono)                    | Per section 4                                                                                                           |
| Buffer size           | ~96 KB                      | `48000 samples/s x 0.5 s x 2 bytes x 1 channel = 48 KB` — double-buffered for safe producer/consumer isolation = ~96 KB |
| Per source            | ~96 KB                      | Microphone and system each have their own ring buffer                                                                   |
| Total capture buffers | ~192 KB                     | Two sources at 500 ms each                                                                                              |

### Overflow policy

| Scenario                                                         | Behavior                                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Producer (callback) writes faster than consumer (encoder) drains | Ring buffer write pointer overtakes read pointer                                                                                         |
| Overflow threshold reached                                       | **Do not block the audio callback.** Drain the oldest samples to make room. Record an overflow event with the number of dropped samples. |
| Timeline effect                                                  | Emit a gap marker (section 8) covering the dropped sample range. The gap is explicit and visible in the transcript timeline.             |
| Diagnostics                                                      | Emit a `buffer_overflow` diagnostic event containing: source, timestamp, dropped sample count, and current consumer latency.             |
| Metrics counter                                                  | Increment a cumulative overflow counter per source for the meeting. Expose in meeting diagnostics.                                       |

### Overflow prevention

- Consumer threads use a real-time or high-priority scheduling hint (where platform-permitted) to minimize drain latency.
- Write path (fsync + checksum) runs on a separate thread pool so that encoder → write backpressure does not stall the consumer drain.
- If persistent overflow occurs (3+ events within 60 seconds), flag the session and suggest reducing load or checking device driver health.

---

## 10. Write ordering

### Sequence

```
[1] Encode chunk data to WebM byte buffer (in-memory)
[2] Write byte buffer to chunk file on disk
[3] fsync chunk file (or equivalent durable flush)
[4] Compute SHA-256 of the chunk file
[5] Append manifest entry atomically
```

#### Step details

| Step               | Implementation                                                                                                       | Failure handling                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1. Encode          | Opus-encode raw PCM frames into Opus packets; mux into WebM cluster; hold complete cluster in a reusable byte buffer | Encode failure is unrecoverable per chunk; abort chunk and emit error event                                                    |
| 2. Write           | `WriteFile` (Windows) / `write()` (POSIX) to a temporary path first, then rename to final path                       | I/O failure retries up to 3 times; if all fail, emit `chunk_write_failure` event                                               |
| 3. fsync           | `FlushFileBuffers` (Windows) / `fsync()` or `fdatasync()` (POSIX)                                                    | fsync failure means the chunk may be lost on power loss; log critical error, retry once                                        |
| 4. SHA-256         | Streaming hash computation over the file contents (mmap-safe or buffered read)                                       | Hash mismatch after read → recompute once; persistent mismatch = file corruption, emit `chunk_corrupt` event                   |
| 5. Manifest append | Append one JSON Lines record to the manifest file, then fsync the manifest                                           | Manifest append failure rolls back the manifest entry (re-read manifest, discard partial line). The chunk file remains on disk |

### Manifest format (JSON Lines)

Each line is a standalone JSON object. One manifest file per meeting per source:

```
{ "meetingId":"...", "source":"mic", "chunkIndex":0, "filePath":"...", "sha256":"...", "byteLength":..., "wallClockStart":"...", "wallClockEnd":"...", "monotonicStart":..., "monotonicEnd":..., "sampleRate":48000, "channels":1, "codec":"opus", "container":"webm", "durationMs":10000 }
```

### Invariant

A chunk is considered **acknowledged** only after:

1. Chunk file is on disk.
2. fsync returned successfully.
3. SHA-256 is computed and matches.
4. Manifest entry is durably committed.

### Crash scenarios

| Crash point                         | Outcome                                                                            | Recovery                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Before write                        | No partial file. Chunk is lost; gap marker emitted                                 | Next start-up recovery                                                               |
| After write, before fsync           | File may be incomplete on disk. Manifest missing ⇒ chunk treated as unacknowledged | Recovery enumerates orphan files; cross-check with manifest                          |
| After fsync, before manifest append | Chunk file exists with no manifest entry                                           | Recovery discovers orphan; computes SHA-256 as if new chunk; re-appends to manifest  |
| During manifest append              | Partial JSON line in manifest                                                      | Recovery re-reads manifest, truncates incomplete last line, re-validates checkpoints |
| After manifest commit               | Full write path complete                                                           | No special recovery needed                                                           |

---

## 11. Derived mix

### Mix specification

| Parameter         | Value                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| Sources           | Microphone (mono) + System audio (mono)                                  |
| Mix type          | Summed, equal gain, clamped to [-1.0, 1.0]                               |
| Normalization     | Peak normalization applied after sum to prevent hard clipping            |
| Sample rate       | 48 kHz (always normalized)                                               |
| Bit depth         | 16-bit signed integer                                                    |
| Channels          | 1 (mono)                                                                 |
| Codec / container | Opus in WebM (same profile as source)                                    |
| Purpose           | Playback during transcript review; transcription feed when VAD is active |

### Tagging

Derived mixes carry the following metadata to prevent confusion with source evidence:

| Field         | Value                                 |
| ------------- | ------------------------------------- |
| `source`      | `derived_mix`                         |
| `meetingId`   | Same as source meeting                |
| `label`       | `Mic + System mix`                    |
| `isDerived`   | `true` (always)                       |
| `derivedFrom` | `["mic", "system"]`                   |
| `mixVersion`  | `1` (bump when mix algorithm changes) |

### Invariant

- The derived mix is **never the only evidence**. Source microphone and system tracks remain the authoritative capture (ADR-002, Meetily Review item 1).
- VAD/mixing never deletes or modifies source audio chunks (Meetily Review, "VAD must not remove source audio").
- The mix is regenerable from source chunks. If storage pressure requires eviction, the mix is deletable; sources are not.
- Downstream transcription may read the mix or individual source tracks depending on the provider and mode. The choice is an implementation detail of the speech pipeline (P13), not a capture profile concern.

### Future mix variants

| Variant                                     | Trigger                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Per-speaker gain mix                        | When speech diarization identifies overlapping speakers with different mic sensitivities |
| Noise-gated mix                             | When ambient noise from one source degrades transcription quality                        |
| Multi-channel mix (stereo mic L / system R) | When spatial context improves playback clarity for the user                              |

All variants are `isDerived: true` and versioned separately.

---

## Cross-cutting concerns

### Consistency with ADRs

| ADR                                     | Alignment                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ADR-001 (Local-first chunked recording) | Bounded chunks, local durability before acknowledgement, crash recovery via manifest, idempotent upload. Sections 5, 6, 10. |
| ADR-002 (Immutable source evidence)     | Separate source tracks, never premixed, derived mix tagged and deletable. Sections 4, 11.                                   |
| ADR-006 (Rust native runtime)           | WASAPI capture in Rust, persistent resampler, bounded buffers, local chunks/checksums/manifests. Sections 1, 2, 3, 9.       |

### Consistency with Meetily Reference Review

| Concern                                                     | Resolution                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Store only a premixed recording (rejected pattern)          | Section 4 mandates separate source tracks. Section 11 marks mix as derived.                |
| Unbounded audio/work queues (rejected pattern)              | Section 9 mandates bounded ring buffers (~96 KB per source) with explicit overflow policy. |
| Persistent resampling                                       | Section 2 mandates persistent anti-aliased resampler, never re-created per callback.       |
| 5-10 second chunks per benchmark (not hard-coded 30 s)      | Section 5 describes the benchmark procedure.                                               |
| Source chunks with duration, monotonic range, SHA-256       | Section 10 manifest format.                                                                |
| Identify devices using stable OS endpoint IDs               | Section 6.                                                                                 |
| Separate microphone/system tracks; derived mix for playback | Sections 4, 11.                                                                            |

### Platform-specific notes

| Platform          | Capture path                                                         | Profile impact                                                                          |
| ----------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Windows (desktop) | WASAPI loopback via Rust sidecar (ADR-006)                           | 48 kHz native; Opus-in-WebM in Rust using `opus` + `webm` crates                        |
| Android           | AudioRecord via Expo native module                                   | Variable sample rate; must resample to 48 kHz. Ring buffer in Java/Kotlin native module |
| iOS               | AVAudioEngine via Expo native module                                 | Variable sample rate; must resample to 48 kHz. Ring buffer in Swift/ObjC native module  |
| macOS             | Post-beta platform (P00-design-closure, locked engineering defaults) | CoreAudio; profile adopted when macOS capture is implemented                            |

### Integrity verification checklist

- [ ] Each chunk decodes independently with no cross-chunk reference required
- [ ] SHA-256 of chunk file matches manifest entry
- [ ] Chunk duration matches expected duration within drift threshold
- [ ] Chunk sequence has no missing indices per source
- [ ] Gap markers exist for every overflow/pause/disconnect event
- [ ] Manifest is a valid JSON Lines file with atomic append property
- [ ] Derived mix does not overlap with source chunk ID space
- [ ] Device IDs are stable OS endpoint identifiers, not display names
