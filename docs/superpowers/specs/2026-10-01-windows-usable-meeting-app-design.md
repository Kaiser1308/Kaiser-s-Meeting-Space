# Windows usable meeting app design

## Goal

Deliver one Windows desktop path that a user can operate end to end: choose real
audio endpoints, record microphone and system loopback locally, see truthful
capture health, and produce a local Vietnamese or English transcript after the
meeting.  The app must remain useful when a model is absent: recording and
finalization still work, while transcription clearly reports that a model must
be installed.

## User flow

1. The user selects microphone, system-audio loopback, and meeting language.
2. Before recording, the app detects a likely Bluetooth HFP/A2DP pairing from
   the endpoint labels and shows a non-blocking warning.  It never changes an
   endpoint automatically.
3. During recording, the app displays independent microphone and system-audio
   health.  It labels source loss, overflow, and device diagnostics separately.
4. On stop, immutable source chunks and the local manifest are finalized even
   if no model is installed or network access is unavailable.
5. The user installs a verified local model from the app when needed, then runs
   transcription for the selected language.  Large Turbo is the preferred
   installed model; the smaller model remains available as a fallback choice.

## Capture health contract

The native `capture_get_state` response exposes one source health object for
`mic` and `sys`:

```ts
type CaptureSourceHealth = {
  peak: number;
  sourceGapCount: number;
  missingSourceFrames: number;
  overflowCount: number;
  overflowFrames: number;
  diagnosticCount: number;
  diagnosticReasons: readonly string[];
  gapCount: number; // compatibility alias of sourceGapCount only
};
```

Only a positive source range from a proven WASAPI device-position discontinuity,
handoff overflow, or failed source-chunk commit counts as source loss.  Packet
flags are bounded diagnostics, recorded without a positive source range.  The
physical harness passes only when source-gap count, missing source frames, and
overflow are zero; diagnostic totals are preserved as evidence but do not turn
into false loss.

## Components

- Native Rust owns source capture, durable chunk/manifest writes, raw health,
  and local model verification/loading.
- Electron main/preload carry typed native responses without translating raw
  health into a boolean.
- React renders selectors, health, the headset compatibility warning, model
  download/activation state, and transcript progress/errors.
- Windows harnesses consume the same raw health contract and offer explicitly
  selected duration/profile runs rather than launching every profile.

## Failure behaviour

- Unavailable endpoint: stop before capture with an actionable endpoint error.
- Missing model: retain the finalized recording and offer install/select model;
  do not claim transcription succeeded.
- Model download/hash failure: retain the previous active model and report the
  verification failure.
- Capture loss/overflow: preserve the exact durable range and mark the run as
  failed; do not hide, pad, or relabel it as a diagnostic.

## Verification

Each change begins with a failing narrow test, then runs its focused suite and
the affected package gate.  The final Windows physical profile is opt-in and
must use isolated artifacts, explicit endpoints, and no live meeting unless
the user gives fresh consent.  It reports content-free metrics only.

## Scope boundaries

This design focuses on the functional Windows product path.  It does not alter
source audio after capture, use cloud transcription, or auto-switch user audio
devices.  Android work and unrelated existing worktree changes remain out of
scope.
