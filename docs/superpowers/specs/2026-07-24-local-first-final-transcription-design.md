# Local-First Final Transcription Design

**Status:** Approved
**Owner:** Product and Architecture
**Date:** 2026-07-24
**Scope:** Desktop-first local final STT, optional cloud live/final/check, and phase-plan integration

## 1. Decision

Kaiser's Meeting Space will make **final transcription on the Windows desktop**
the default processing path. Cloud transcription remains available only through
an explicit user choice:

- cloud final transcription instead of local final transcription;
- cloud verification after local transcription, for approved uncertain ranges
  or the full meeting;
- cloud live transcription during the meeting.

The application must never invoke cloud STT as an automatic fallback. Recording
remains independent from all transcription modes.

Local transcription on Android/iOS, local live transcription, immutable audio
import, and advanced downloadable-model lifecycle remain later P28 extensions.

## 2. User-facing model

Final transcription has exactly three mutually exclusive modes:

| Final mode          | Primary behavior                                                                | Cloud behavior                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `local`             | The Windows desktop processes all durable meeting audio after End.              | None.                                                                                                                 |
| `cloud`             | The selected cloud STT provider processes all approved meeting audio after End. | Full approved audio is sent to the named provider.                                                                    |
| `local_cloud_check` | The Windows desktop processes all audio first.                                  | After local completion and explicit approval, selected uncertain ranges or the full meeting are checked by cloud STT. |

Live transcription is an independent option:

| Live mode | Behavior                                                                      |
| --------- | ----------------------------------------------------------------------------- |
| `off`     | No transcription runs during recording.                                       |
| `cloud`   | Audio is streamed to the named cloud provider for display-only realtime text. |

The default is:

```json
{
  "live": "off",
  "final": "local",
  "cloudCheckScope": "off",
  "language": "vi"
}
```

The UI must use reader-facing labels rather than the internal term "local
final transcript":

- **Create transcript on this computer after the meeting**
- **Create transcript with cloud after the meeting**
- **Create locally, then check approved difficult parts with cloud**
- **Show live transcript using cloud**
- **Record only**

## 3. Versioned policy contract

The existing `speechMode = api | local` field conflates timing, execution
location, and fallback policy. It will be retained only for compatibility while
a versioned policy becomes authoritative:

```ts
type TranscriptionPolicyV1 = {
  version: 1;
  language: 'vi' | 'en';
  live: 'off' | 'cloud';
  final: 'none' | 'local' | 'cloud' | 'local_cloud_check';
  cloudCheckScope: 'off' | 'uncertain_ranges' | 'full';
  cloudConsent: 'not_required' | 'required' | 'granted';
};
```

Contract invariants:

- `final !== 'local_cloud_check'` requires `cloudCheckScope === 'off'`.
- `final === 'local_cloud_check'` requires
  `cloudCheckScope === 'uncertain_ranges' | 'full'`.
- `live === 'cloud'`, `final === 'cloud'`, or a non-off cloud check requires
  named-provider disclosure and explicit consent before any content leaves the
  device boundary.
- Missing local model, insufficient resources, offline desktop, or processing
  failure never changes `final` to `cloud`.
- Recording may start when transcription is unavailable if audio readiness and
  consent requirements are satisfied. The transcript job remains queued with a
  truthful reason.
- Translation mode remains independent. `meeting_translate` may schedule
  translation only after an authoritative transcript projection exists.

Legacy migration:

- Existing `speechMode = local` maps to `live = off`, `final = local`.
- Existing `speechMode = api` maps to `live = off`, `final = cloud`.
- Newly created meetings default to local final processing.
- The legacy field remains readable through a compatibility window and is not
  used to silently infer cloud consent.

## 4. Processing architecture

### 4.1 Recording boundary

Recording writes immutable local-first audio chunks before upload or STT. STT
failure, model failure, provider failure, or loss of network cannot stop local
capture.

Capture chunks and transcription processing windows are different contracts:

- capture chunks are small durability units optimized for atomic write,
  upload, checksum, retry, and crash recovery;
- processing windows are bounded contiguous timeline ranges assembled from one
  or more verified capture chunks and optimized for STT context and retry;
- no STT adapter may treat capture-chunk boundaries as linguistic boundaries;
- every processing window records its source manifest, source track, start/end
  timestamps, overlap policy, engine configuration, attempts, and result hash.

Window planning is deterministic for a given manifest, policy, engine profile,
and planner version.

### 4.2 Local final flow

```text
End meeting
  -> close and verify local audio manifest
  -> create deterministic bounded processing windows
  -> create durable local-file transcription job and window checkpoints
  -> verify approved language model and resource profile
  -> process each window with boundary overlap
  -> persist immutable raw local events per window
  -> reconcile overlap and boundary candidates
  -> reconcile into a versioned transcript projection
  -> expose review/search/evidence playback
```

The first core implementation runs on the Windows Rust runtime. Mobile meetings
use the existing secure sync path; when the desktop receives durable audio, it
runs the local job and synchronizes transcript artifacts back to the account.
Until then the mobile state is `waiting_for_desktop`.

Local processing requirements:

- each window has a bounded duration and a small configured overlap with its
  adjacent windows;
- retry and resume operate per window, so one failed range does not require
  retranscribing the complete meeting;
- overlap text is reconciled using timestamps, normalized token similarity,
  and source range identity rather than raw concatenation;
- no word, segment, or speaker label is discarded solely because it appears in
  an overlap; ambiguous boundary candidates remain reviewable;
- finalization accounts for every expected timeline range exactly once in the
  canonical projection or marks an explicit gap;
- transcript stitching is structural reconciliation, not generative
  summarization or rewriting.

### 4.3 Cloud final flow

Cloud final is a replacement primary run, not a second automatic run:

```text
End meeting
  -> verify durable audio and cloud consent
  -> create provider-bound full-meeting batch job when supported
  -> upload/stream the approved complete meeting asset
  -> persist immutable raw cloud events
  -> reconcile into a versioned transcript projection
```

Local final does not run unless the user later requests a distinct regeneration.

Cloud final prefers one full-meeting batch per approved transcription asset when
the provider supports the meeting duration, size, sources, language, and
diarization requirements. This preserves long-range context and stable provider
speaker identity. The submitted asset and provider job still map every result
back to exact source ranges.

When the provider limit, source layout, retry policy, or a failed batch prevents
full-meeting processing, the system deterministically creates bounded windows
with overlap. The same boundary reconciliation, per-window provenance,
coverage, and gap rules used by local final then apply. A batch-to-window
fallback is a retry strategy within the already-consented cloud-final mode; it
must not expand the approved audio scope or change providers silently.

### 4.4 Local plus cloud check

Cloud check is sequential:

```text
local final completes
  -> identify candidate uncertain ranges
  -> show ranges, provider, disclosure, and estimated usage
  -> user approves uncertain ranges or full meeting
  -> run separate cloud check
  -> compare local and cloud outputs
  -> mark agreements and disagreements
  -> require user confirmation for material disagreements
```

Candidate detection may use low or missing confidence, gaps, overlapping
speech, low signal quality, names, numbers, dates, currencies, manual
selection, and local/cloud disagreement. Confidence alone must not be treated
as proof of correctness.

### 4.5 Cloud live plus local final

When `live = cloud` and `final = local`, two runs exist for distinct purposes:

- cloud live events are display-oriented and immutable;
- local final processes the complete durable audio after End;
- reconciliation preserves both lineages and never silently overwrites either
  source.

## 5. Transcript provenance and authority

Audio remains the highest-authority source. Every transcription attempt creates
an immutable `TranscriptRun` with:

- run ID, meeting ID, owner ID, and audio manifest/version;
- engine/provider, model, version, configuration, and execution locality;
- selected language and requested audio ranges;
- consent/disclosure record when cloud is used;
- lifecycle, timestamps, attempts, cancellation, and safe errors;
- immutable raw segment events and content-free operational metadata.

Each window or full-meeting batch is represented by an immutable
`TranscriptRunPart` bound to the run, audio manifest, exact timeline range,
overlap range, attempt, provider/native job identity, and raw result hash.

Every segment records run ID, source audio range, timestamps, confidence when
available, speaker metadata when supported, and projection lineage.

The application exposes a versioned current projection. User corrections create
revisions; they do not mutate raw local, cloud, or live events. Local/cloud
disagreements involving names, numbers, dates, money, decisions, or action
items must remain visible until reviewed.

Boundary reconciliation must also preserve speaker provenance. Provider speaker
labels may be normalized into meeting-level speaker identities only through a
versioned mapping; labels from separate windows are never assumed to identify
the same person merely because their numeric names match.

## 6. Model and resource boundary

The core desktop path uses one allowlisted `vi` or `en` model at a time through
a whisper.cpp-compatible Rust adapter.

Core requirements:

- fixed model manifest with language, engine/runtime compatibility, license,
  source, byte length, SHA-256, and resource estimate;
- model verification before activation;
- app-private non-executable model storage;
- bounded threads, memory, queue, progress, and cancellation;
- capture work has priority over transcription work;
- no network dependency during local processing once the model is installed;
- no local diarization claim without a separate passing evaluation.

The core path may ship with a reviewed model or a simple verified installer.
Resumable catalogs, multiple active models, mobile installation, and arbitrary
model switching remain P28 scope.

## 7. Privacy and consent

Local STT means speech recognition runs on the user's Windows computer. It does
not by itself mean the meeting never uses cloud storage.

The application must distinguish:

- **Local STT:** no audio is sent to a speech provider.
- **Local-only meeting:** audio and transcript do not leave the device until
  the user changes the sync policy.
- **Cloud-synchronized local STT:** audio may use encrypted account storage but
  is not sent to the STT provider.
- **Cloud STT/check/live:** approved audio is sent to the named speech provider.
- **Cloud minutes AI:** transcript/minutes content may be sent to a generative
  provider under a separate disclosure and consent action.

Consent for cloud STT cannot authorize generative AI, and generative-AI consent
cannot authorize cloud STT.

## 8. Failure behavior

| Failure                                                   | Required outcome                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Model absent                                              | Recording continues; final job waits for verified model installation.                                            |
| Desktop unavailable for a mobile meeting                  | Audio remains safe; transcript state is `waiting_for_desktop`.                                                   |
| Local engine crash or resource exhaustion                 | Preserve audio and committed raw events; retry, choose a lighter approved model, or offer explicit cloud choice. |
| Cloud consent absent                                      | No cloud request is created.                                                                                     |
| Cloud provider unavailable                                | Preserve local/live results and expose retry/change-provider actions.                                            |
| Local and cloud disagree                                  | Preserve both; mark the difference and seek the exact audio range.                                               |
| App restarts during local processing                      | Recover durable job state; never publish a partial run as complete.                                              |
| Translation/minutes requested before transcript readiness | Queue or block with truthful completeness state.                                                                 |

## 9. Quality and performance gates

P13 freezes the benchmark corpus and thresholds before adapter tuning. The
initial release gates are:

- 100% of expected audio ranges are represented by transcript segments or
  explicit gaps;
- no duplicate or out-of-order canonical segments;
- deterministic window planning produces identical windows for identical
  manifest, policy, engine profile, and planner version;
- overlap reconciliation neither loses boundary speech nor publishes duplicate
  canonical text;
- a failed window resumes independently without rerunning completed windows;
- cloud final uses a full-meeting batch when the provider capability and limits
  permit, and its window fallback preserves the same approved scope;
- clean/online bilingual corpus WER at or below 18%;
- noisy-room bilingual corpus WER at or below 30%;
- timestamp alignment p95 error at or below 1.5 seconds;
- local final real-time factor at or below 1.0 on the minimum supported Windows
  profile;
- cancellation is acknowledged within 2 seconds and leaves a recoverable job;
- local processing completes without network access after model installation;
- cloud is never contacted in local-only fixtures;
- a cloud check never changes the current projection without an explicit
  reconciliation decision;
- names, numbers, dates, currencies, and material local/cloud disagreements
  remain reviewable through exact audio evidence;
- no diarization capability is shown unless its independent evaluation passes.

The corpus uses synthetic or explicitly consented Vietnamese and English audio
covering clean online calls, room noise, accents, long silence, overlapping
speech, names, dates, numbers, currencies, and two-hour meetings. Thresholds
may be tightened after beta; they may not be lowered to make a phase pass.

## 10. Phase-plan changes

No phase is added or renumbered.

### P08 — Mobile start flow

- Replace the API/local selector with the reader-facing live/final choices.
- Represent local model/desktop availability truthfully without blocking
  recording.
- Add cloud disclosure and consent boundaries.

### P13 — Speech platform

Expand the outcome from Deepgram realtime-only to a provider-neutral speech
platform containing:

- versioned policy/run/segment capability contracts;
- cloud live adapter;
- desktop local file-STT adapter;
- minimal verified language-model boundary;
- fixed bilingual evaluation corpus and resource profile;
- deterministic adapters and conformance tests.

P13 uses two internal checkpoints: contracts/model boundary, then cloud/local
adapters and evaluation. It remains one phase and one conversation.

### P14 — Finalization and reconciliation

- Orchestrate local final, cloud final, and local-plus-cloud-check jobs.
- Detect candidate uncertain ranges.
- Persist separate immutable runs.
- Reconcile runs deterministically with user-review requirements.
- Publish truthful completeness and `waiting_for_desktop` states.

### P16 — Transcript review

- Display run provenance and execution locality.
- Compare local/cloud segments.
- Navigate disagreements to exact audio.
- Confirm/reject material alternatives as versioned revisions.

### P28 — Advanced local extension

Retain:

- mobile local STT;
- local live STT behind capability benchmarks;
- advanced resumable model catalog/lifecycle;
- immutable audio import and normalization;
- broader model/resource/security qualification.

P28 must reuse the P13/P14 run and provenance contracts and cannot weaken them.

## 11. Rollout

1. Land additive versioned policy and run contracts while preserving legacy
   reads.
2. Implement deterministic local adapter fixtures and model verification.
3. Qualify one language-specific model per supported language on the minimum
   Windows profile.
4. Enable desktop local final behind an account/device feature flag.
5. Enable mobile-to-desktop `waiting_for_desktop` processing.
6. Enable cloud final as an explicit alternative.
7. Enable cloud check for manually selected ranges, then automated candidate
   suggestions after evaluation.
8. Keep cloud live opt-in and independent throughout.

Rollback disables new job creation while preserving audio, raw transcript runs,
projections, and revisions. It never deletes or rewrites source evidence.

## 12. Success criteria

The design succeeds when:

- a new meeting defaults to local final processing and no cloud live/check;
- local recording and transcription complete without STT cloud access;
- mobile audio can wait for and be processed by an authorized desktop;
- cloud final is a mutually exclusive explicit primary choice;
- local-plus-cloud-check sends only user-approved scope;
- live cloud remains independent from final processing;
- all raw runs and projection decisions are auditable;
- the fixed bilingual and resource gates pass;
- local/mobile/live extensions can be added without changing evidence
  authority or silently expanding cloud use.
