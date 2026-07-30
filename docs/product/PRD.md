# Product Requirements Document

**Status:** Draft for product approval  
**Owner:** Product  
**Last reviewed:** 2026-07-21  
**Target release:** Personal-use alpha

## 1. Problem

Meetings are frequently reduced to incomplete notes. Decisions, context and exact wording become hard to verify, especially across Vietnamese and English conversations. Existing transcription products often optimize for short summaries rather than preserving a complete, auditable record.

Kaiser’s Meeting Space must capture the full meeting, retain original evidence, optionally translate live, and create detailed minutes that remain traceable to what was actually said.

## 2. Goals and success measures

### Product goals

- Start a reliable recording from mobile or desktop within 30 seconds.
- Preserve recoverable audio even during network failure or application interruption.
- Produce a complete transcript in the explicitly selected meeting language.
- Generate detailed, editable minutes with evidence links.
- Let a personal user review, store and export an entire meeting package.
- Avoid vendor lock-in for speech and generative AI.

### Alpha success measures

| Measure                                        | Target                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| Successfully finalized test meetings           | ≥ 99% for supported devices and sessions up to 2 hours                        |
| Recoverable audio after simulated network loss | 100%                                                                          |
| Transcript coverage                            | No silent gaps; every gap is explicitly marked                                |
| Evidence validity                              | 100% of generated evidence references point to an existing segment/time range |
| Start-flow completion                          | ≥ 95% in usability testing without assistance                                 |
| Critical data-loss defects                     | 0 open at release                                                             |

Transcription word accuracy is measured by language and acoustic environment during beta; no universal accuracy promise is made before benchmark data exists.

## 3. Users

### Primary user

An individual professional who attends in-person and online meetings, works in Vietnamese and English, needs complete records, and edits formal minutes mainly on a computer.

### Key jobs

- Record an in-person conversation from a phone.
- Capture microphone and system audio from an online meeting on Windows.
- See a live transcript and optional translation.
- Pause without discarding the meeting.
- Verify who said what and when.
- Produce different styles of detailed minutes.
- Apply branding and export editable/fixed documents.
- Revisit decisions and action items with original evidence.

## 4. Scope

### Personal alpha

- One personal account and synchronized mobile/desktop library.
- Vietnamese or English selected before each meeting.
- `Meeting only` and `Meeting + live translation` modes.
- Desktop local final transcription by default; explicit cloud live, cloud final and post-local cloud-check choices.
- Mobile microphone capture; Windows microphone and system-audio capture.
- Pause, resume, end, local-first chunks, background upload and recovery.
- Complete transcript, revision history, speaker naming and evidence playback.
- Detailed minutes templates: team, 1:1, direct report, leadership and recurring/follow-up.
- Branding and export to DOCX, PDF, Markdown, TXT, JSON and audio.

### Explicitly out of scope for alpha

- Team workspaces, enterprise RBAC, SSO and central administration.
- Meeting bots that join Zoom, Meet or Teams.
- Automatic mixed-language detection within a meeting.
- Fully offline speaker diarization guarantees.
- Real-time collaborative document editing.
- Calendar/email integrations and automated distribution.
- Hidden/background recording without an explicit user action.

## 5. Functional requirements

### FR-1 — Pre-meeting setup

The user must complete the sequence `title → language → mode → audio source → processing → readiness checks → consent reminder → Start`.

- Language is exactly Vietnamese or English and is required on every start.
- Mode is `meeting_only` or `meeting_translate`.
- Translation target is derived as the other supported language.
- Mobile permits microphone; desktop permits microphone, system audio or both.
- Start remains disabled until required permissions and a valid audio source exist.
- The latest choices may be suggested, but language must be explicitly confirmed.

### FR-2 — Recording lifecycle

- Recording exposes duration, source health and storage/network warnings.
- Pause closes the active chunk and records a timeline pause interval.
- Resume creates a new chunk in the same meeting.
- End requires confirmation, finalizes the last chunk and moves to processing.
- An application restart detects incomplete sessions and offers recovery.
- The client records locally before upload; upload failure cannot stop local capture.

### FR-3 — Transcript and translation

- Interim text is display-only; final segments form the source transcript.
- Final segments include sequence, speaker label, language, text, start/end timestamps, confidence when available and provider metadata.
- Source transcript is immutable. Edits create revisions.
- Translation is stored separately and never replaces source text.
- Network/provider gaps are marked and backfilled from audio where possible.

### FR-4 — Completion and review

- End first confirms that audio is locally safe, then finalizes uploads/transcription.
- The user can rename or merge speakers and revise transcript text.
- The system shows completeness and processing status.
- The user chooses `Create minutes now` or `Later`.
- Creating from incomplete data requires explicit confirmation and labels the output incomplete.

### FR-5 — Detailed minutes

- Detailed minutes are the default; executive summary is a separate user action.
- Minutes include context, topic-by-topic discussion, viewpoints, proposals, agreements, unresolved points, decisions, action items, risks and follow-ups.
- Important claims, decisions and action items include evidence references.
- Unclear owner, deadline, speaker or decision is marked `Needs confirmation`.
- Regeneration creates a new version and records provider/model/prompt version.

### FR-6 — Editing and export

- Desktop supports section/block editing, order, headings, tables and checklists.
- AI rewriting applies only to selected content and requires diff acceptance.
- Brand presets support logo, colors, typography, header/footer, paper size and pagination.
- Export is pinned to a chosen document version.
- Citation playback opens the corresponding transcript and audio range.

### FR-7 — Library and deletion

- The library exposes title, date, language, duration, processing/completeness state and artifacts.
- Search covers title, speaker, transcript and minutes.
- Deletion is soft first and offers a recovery period before permanent deletion.
- Permanent deletion removes database records, stored objects, exports and local cached content according to policy.

## 6. Non-functional requirements

- **Reliability:** No acknowledged recording chunk may disappear; upload/finalization operations are idempotent.
- **Performance:** Recording controls respond locally within 200 ms; realtime text target latency is ≤ 3 seconds under supported network conditions.
- **Scalability:** Processing is asynchronous and horizontally scalable by job type.
- **Security:** Provider credentials never reach clients; sensitive content is encrypted in transit and at rest.
- **Privacy:** Telemetry excludes audio, transcript, translation and minutes content.
- **Accessibility:** Keyboard navigation on desktop, screen-reader labels, visible focus, scalable text and WCAG AA color contrast.
- **Localization:** UI copy supports Vietnamese and English independently of the meeting language.
- **Observability:** Every processing job has correlation IDs, progress, safe error codes and retry history.

## 7. Release acceptance

Alpha is releasable only when:

1. Critical end-to-end flows pass on supported Windows, Android and iOS targets.
2. Two-hour recording, network loss, crash recovery and low-storage tests pass without silent data loss.
3. Source/derived data boundaries and revision history are verified.
4. Citation validation rejects nonexistent segments or invalid timestamps.
5. Secrets do not appear in bundles, logs or API responses.
6. Backup/restore and permanent deletion tests pass in a production-like environment.
7. Known limitations and consent/privacy copy are present in-product.

## 8. Approved local-first transcription policy

- New meetings default to cloud live off and desktop local final after End.
- Live transcription is independently `off | cloud`; final transcription is `none | local | cloud | local_cloud_check`.
- Reader-facing choices are Record only, Show live transcript using cloud, Create transcript on this computer after the meeting, Create transcript with cloud after the meeting, and Create locally then check approved difficult parts with cloud.
- Missing desktop/model or provider availability may delay processing but cannot block safe recording when audio readiness is valid.
- Cloud live, cloud final and cloud check each require a named-provider disclosure, an exact approved audio scope and explicit versioned consent. Speech consent is separate from cloud minutes-AI consent.
- Local failure never changes the selected final mode to cloud.
- Every live/final/check attempt is an immutable transcript run. Audio remains highest authority; the current transcript is a versioned projection and user edits are revisions.
- Local final uses deterministic bounded overlapped windows with per-window resume. Cloud final prefers a consented full-meeting batch and may use equivalent windows only within the same approved provider and audio scope.
- Review exposes run provenance, local/cloud disagreements and exact audio evidence. Cloud check cannot change the projection without an explicit decision.
- Mobile-originated local final may show `waiting_for_desktop`; a missing verified model may show `waiting_for_model`.

Initial speech release gates are: clean/online bilingual WER at or below 18%, noisy-room WER at or below 30%, timestamp p95 error at or below 1.5 seconds, desktop local real-time factor at or below 1.0 on the minimum Windows profile, cancellation acknowledgement within 2 seconds, and 100% expected-range accounting by canonical text or explicit gap.

## 9. Open product approvals

Before external beta, product ownership must approve pricing/cost limits, retention duration, supported OS versions, privacy jurisdiction, model/provider data-processing terms and branding. Defaults for engineering are documented in the architecture and security documents but are not legal approval.
