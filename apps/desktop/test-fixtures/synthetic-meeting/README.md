# Synthetic meeting audio fixture

This fixture is generated offline with Windows SAPI from a fixed synthetic
script. It contains no real meeting, personal, or copyrighted content and is
the only baseline source for the Windows physical-audio harnesses.

Generate or regenerate it on Windows with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/generate-synthetic-meeting-fixture.ps1
```

The generator writes `synthetic-meeting.wav`, `expected-transcript.json`, and
`fixture.json`. `fixture.json` records the SHA-256 of both immutable source
files. If the hashes change, treat the fixture as a new revision and do not
reuse prior evidence.

Frozen revision `synthetic-meeting-v1` currently contains a 13,002 ms WAV:

- WAV SHA-256: `9127d808a8c139e60ebb1d058da4703f40b05ee8cbb58e48cf47a1ad3fafc1ce`
- Expected transcript SHA-256: `77bf077eee8c7f1ace7d73b5d81570b58bb63c5c8f90f6ebd897991f43de957f`

Default physical route: play this local WAV through the selected speakers into
the explicitly selected microphone (`speaker-to-mic`). A loopback route must be
labelled separately and is not microphone qualification. No network URL or
YouTube stream is accepted by the generator or any PASS/FAIL gate.
