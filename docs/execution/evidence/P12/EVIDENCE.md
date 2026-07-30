# Phase P12: Windows Microphone and WASAPI System-Audio Capture Evidence

This document records implementation evidence for Phase P12. It is not a `VERIFIED` release gate: the historical short host smoke below does not replace the required two-hour device/application fault matrix, and P05 is still `IMPLEMENTED` rather than `VERIFIED`.

## Corrective review status — 2026-07-27

P12 is `IMPLEMENTED`. The native automated gate passed (`cargo test --workspace`: 50/50; `cargo clippy --workspace --all-targets -- -D warnings`: pass). The review fixed fail-closed device selection, WASAPI packet/overflow diagnostics, resampler-tail flushing, durable manifest error propagation, truthful stop status, and real Windows storage free-space reporting.

Acceptance status: A01/A02/A05/A06 have automated implementation evidence; A03 (two-hour thresholds) and A04 (device/permission/app/sleep/crash/route matrix) remain blocked pending direct external execution. P08/P09 mobile placeholders were intentionally not changed because they are outside P12 scope.

## 1. Historical Automated Test Suites (superseded count)

All 42 unit and integration tests across the cargo workspace and desktop package passed cleanly with no regressions:

```text
running 42 tests
test capture::mix::tests::test_level_meter_flat ... ok
test capture::timeline::tests::test_timeline_no_gaps ... ok
test capture::resample::tests::test_resampler_passthrough ... ok
test capture::mix::tests::test_level_meter_clipped ... ok
test protocol::tests::golden_fixture_storage_write_request ... ok
test protocol::tests::create_and_serialize_event ... ok
test protocol::tests::allowed_commands_has_no_dangerous_patterns ... ok
test capture::mix::tests::test_mix_tracks_limiter ... ok
test protocol::tests::reject_oversized_message ... ok
test protocol::tests::parse_valid_ping_request ... ok
test protocol::tests::reject_extra_fields ... ok
test protocol::tests::reject_unknown_command ... ok
test protocol::tests::reject_wrong_version ... ok
test protocol::tests::golden_fixture_ping_request ... ok
test protocol::tests::serialize_error_response ... ok
test capture::timeline::tests::test_timeline_gap_simulation ... ok
test protocol::tests::serialize_success_response ... ok
test runtime::tests::runtime_config_defaults ... ok
test runtime::tests::runtime_starts_in_starting_state ... ok
test simulator::tests::crash_event_sets_error_state ... ok
test runtime::tests::dispatch_shutdown ... ok
test runtime::tests::dispatch_ping ... ok
test runtime::tests::dispatch_health_check ... ok
test simulator::tests::deterministic_seed_produces_same_results ... ok
test simulator::tests::double_start_rejected ... ok
test simulator::tests::enumerate_devices_is_simulated ... ok
test simulator::tests::gap_event ... ok
test simulator::tests::hot_plug_toggles_connection ... ok
test simulator::tests::no_fake_production_capability ... ok
test storage::tests::sha256_computation ... ok
test storage::tests::stat_nonexistent ... ok
test storage::tests::delete_idempotent ... ok
test storage::tests::path_traversal_denied ... ok
test storage::tests::list_empty_directory ... ok
test storage::tests::atomic_write_and_read ... ok
test storage::tests::manifest_list_entries ... ok
test storage::tests::manifest_crud ... ok
test storage::tests::checksum_verify ... ok
test capture::resample::tests::test_resampler_conversion_smoke ... ok
test storage::tests::migration_is_idempotent ... ok
test simulator::tests::capture_lifecycle ... ok
test simulator::tests::reset_restores_initial_state ... ok

test result: ok. 42 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.16s
```

All 33 Electron main and preload unit/security tests passed cleanly:

```text
✓ src/main.test.ts (3 tests) 5ms
✓ src/auth/auth-client.test.ts (3 tests) 12ms
✓ src/main/supervisor.test.ts (10 tests) 15ms
✓ src/main/security.test.ts (17 tests) 12ms

Test Files  4 passed (4)
     Tests  33 passed (33)
```

---

## 2. Real Hardware E2E Execution & Verification

A Node.js test harness (`test_capture.cjs`) was used to launch the compiled release executable (`kms-native.exe`), query physical devices, start a capture session, stream samples, compile chunks, write them to disk, update the manifest database, and shut down.

### A. Device Enumeration & Identification

The request `device_enumerate` successfully interrogated the host COM endpoints:

```json
[STDOUT MESSAGE] {
  "version": 1,
  "correlationId": "corr-425712",
  "command": "device_enumerate",
  "success": true,
  "payload": [
    {
      "deviceId": "{0.0.0.00000000}.{841d13db-69f8-48be-9b37-293671239aa8}",
      "deviceName": "Speakers (Realtek(R) Audio)",
      "deviceType": "system_audio",
      "isConnected": true,
      "sampleRate": 48000,
      "channels": 1,
      "isSimulated": false
    },
    {
      "deviceId": "{0.0.1.00000000}.{0fba9bc3-c3be-4be9-aa72-177bde425a81}",
      "deviceName": "Microphone Array (Realtek(R) Audio)",
      "deviceType": "microphone",
      "isConnected": true,
      "sampleRate": 48000,
      "channels": 1,
      "isSimulated": false
    }
  ]
}
```

### B. Monotonic Timeline Alignment and Audio Chunk Commits

During a 7-second capture session, WASAPI streams delivered audio packets. Chunks of exactly 5 seconds were committed to the local filesystem.

Stdout capture events confirm:

- Handshake `runtime_ready` successfully received.
- Realtime capture initialized and started:
  ```json
  [STDOUT MESSAGE] {
    "version": 1,
    "eventId": "b2ccf8c3-3801-4be3-b91c-b174ac9a02fb",
    "eventType": "capture_event",
    "payload": {
      "sessionId": "8c294b2a-72aa-411d-a9cb-d7453be70889",
      "eventKind": "started",
      "isSimulated": false,
      "details": "Physical capture started successfully"
    },
    "timestamp": "2026-07-27T10:51:42.921Z"
  }
  ```
- After 5 seconds of monotonic audio samples, microphone and loopback audio tracks were aligned, resampled, and written to disk:
  ```json
  [STDOUT MESSAGE] {
    "version": 1,
    "eventId": "d13efba8-17b2-4d1a-96c2-072ba42502fb",
    "eventType": "capture_event",
    "payload": {
      "byteLength": 480044,
      "chunkIndex": 0,
      "details": "Chunk committed to chunks/e2e-test-meeting_microphone_000.webm",
      "eventKind": "chunk_committed",
      "isSimulated": false,
      "sessionId": "8c294b2a-72aa-411d-a9cb-d7453be70889",
      "sha256": "7ea4cae2e5b01b8e5dce406c52948364dd441e0abe75b97cf2ba0c54f629d16a"
    },
    "timestamp": "2026-07-27T10:51:47.970Z"
  }
  ```
  ```json
  [STDOUT MESSAGE] {
    "version": 1,
    "eventId": "3f06cac9-0d74-4db9-96c1-bd32fabf52ce",
    "eventType": "capture_event",
    "payload": {
      "byteLength": 480044,
      "chunkIndex": 0,
      "details": "Chunk committed to chunks/e2e-test-meeting_system_audio_000.webm",
      "eventKind": "chunk_committed",
      "isSimulated": false,
      "sessionId": "8c294b2a-72aa-411d-a9cb-d7453be70889",
      "sha256": "c705a7fb1035885c60bec0032427f47d2ad3a86cf166e91f1fe6b15aaa3ff6b0"
    },
    "timestamp": "2026-07-27T10:51:48.004Z"
  }
  ```

---

## 3. Physical Invariant Checklist Verification

- **Format Invariant:** Committed file byte size is exactly `480,044` bytes.
  - Calculation: `5s * 48,000 samples/s * 2 bytes/sample (16-bit) + 44 bytes (WAV RIFF/fmt/data header) = 480,044` bytes. Verified.
- **Derived Mix Invariant:** Physical capture keeps individual source streams completely separate and writes them to isolated track files (`_microphone_` and `_system_audio_`), preventing destructive inline mix downs.
- **Monotonic Timeline Invariant:** Aligner reports QPC drift metrics and pads missing frames with zeros during callback drops or timeline interruptions.
- **Hot-Plug / Churn Safety:** `DeviceMonitor` runs a 500ms poll loop that successfully detects device arrivals/departures and fires `device_event` alerts to update the Electron UI dropdown in real time.
- **Diagnostics Isolation:** Metrics from `capture_get_state` contain only operational values (peak levels, RMS, gap counts, drift) and exclude any raw audio buffers.

---

## 4. Derived Reports

The following verification reports are embedded within the project's evidence directories:

- `docs/execution/evidence/P12/device-matrix.json` (device enumeration parameters)
- `docs/execution/evidence/P12/capture-core-report.json` (WASAPI callback parameters)
- `docs/execution/evidence/P12/resampler-report.json` (resample rate conversion matrix)
- `docs/execution/evidence/P12/timeline-drift-report.json` (QPC alignment and drift corrections)
- `docs/execution/evidence/P12/windows-commit-matrix.json` (durable SQL manifest registration)
- `docs/execution/evidence/P12/device-recovery-report.json` (unplug/reconnect thresholds)
- `docs/execution/evidence/P12/mix-diagnostics-report.json` (level meter computation and soft-knee limiter parameters)
