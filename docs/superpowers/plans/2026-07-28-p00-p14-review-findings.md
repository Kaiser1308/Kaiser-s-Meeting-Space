# P00–P14 corrective review findings

Date: 2026-07-28

This is a review record, not phase evidence. It records only observations
made from the current working tree and directly executed checks. No phase is
upgraded by this document.

Current continuation scope is P00–P12. P13 is being re-implemented separately;
the P13 notes retained below are historical context only and are not used as
current acceptance criteria or modified by this continuation. P14 remains
outside the requested scope and is not started.

## Phase-level review snapshot

| Scope | Current review result                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| P00   | Documentation baseline is structurally sound; execution-document link validation passed.                                     |
| P01   | Gate design repaired, but the asserted warning-free lint baseline is false (169 warnings observed).                          |
| P02   | No new domain-contract defect found in this pass; phase evidence still governs its verification status.                      |
| P03   | No schema defect changed in this pass; real database/runtime claims remain dependent on direct environment evidence.         |
| P04   | Authentication plugin is present and fail-closed without OIDC configuration; route composition coverage is insufficient.     |
| P05   | Audio routes are now conditionally registered when DB + S3 are configured; real storage integration remains Docker-blocked.  |
| P06   | Dispatcher overlap and ignored per-job execution limits were fixed and focused tests pass.                                   |
| P07   | Contract layer was not changed; no regression found in static review.                                                        |
| P08   | Consent/domain surface is now persisted additively; authenticated meeting-start wiring is explicit at the API boundary.      |
| P09   | Native source, JS bridge, and typed CaptureStarter boundary exist; device conformance and encoder qualification remain open. |
| P10   | End transition/list state bugs and API route composition were fixed; device/integration qualification remains open.          |
| P11   | Secure desktop/runtime structure was not changed; no new static defect found in this pass.                                   |
| P12   | Implementation is correctly treated as `IMPLEMENTED`, not qualified; no new code change in this pass.                        |
| P13   | Excluded from this continuation while its re-implementation is in progress.                                                  |
| P14   | Outside the requested P00–P12 scope; not started.                                                                            |

## Confirmed defects fixed locally, awaiting the full gate

1. **Required-suite inventory omitted substantial P06–P13 unit coverage and
   ran database Testcontainers tests as unit tests.** The required-suite
   inventory now classifies database and MinIO suites as integration tests,
   includes the missing workspaces in the unit gate, and rejects a test file
   registered in both unit and integration gates. The new inventory test and
   the expanded unit gate passed locally before the later execution-quota
   restriction. The complete verification gate must be rerun.
2. **P13 speech-session route issued a provider grant without server-side
   binding of owner, meeting, language, source, and cloud consent.** The route
   now validates its body and fails closed unless an authorizer permits the
   exact binding. Focused route tests (11) and API typecheck passed before
   the later execution-quota restriction. The application has not yet wired a
   persisted authorizer, so production currently fails closed rather than
   safely enabling speech.
3. **P10 meeting end always observed an undefined state.**
   `MeetingsRepository.get()` deliberately returns public meeting settings,
   while `MeetingService.endMeeting()` incorrectly read its removed internal
   state. A lifecycle-specific repository read now supplies state and version
   to the end transition. The focused regression test passed; API/database
   typechecks still need rerunning after this change.

## Open correctness and architecture findings

1. **P10 API routes are unreachable from the API composition root (high
   product risk).** `apps/api/src/app.ts` registers neither the meeting nor
   audio route plugins. P05/P10 endpoint implementations therefore cannot be
   served, regardless of their focused tests. Wiring requires explicit
   database and object-store construction plus route-availability tests.
2. **P10 library state remains incorrect (high product risk).**
   `MeetingService.listMeetings()` still obtains public settings through
   `MeetingsRepository.list()` and then reads the stripped `state` field. It
   must use a lifecycle-aware list query, with a regression test, before the
   library can report a meeting's actual status.
3. **P13 needed a production speech-session authorizer (security and
   availability risk).** The route is now backed by an owner-scoped meeting
   lookup and additive persisted policy column/migration. Legacy rows remain
   fail-closed; the actual start API still needs to supply the policy at
   meeting creation.
4. **P09 production JS-to-native bridge was absent (high product risk).**
   Android and iOS Expo modules are present under
   `apps/mobile/modules/audio-recorder`, but the application initially had no
   adapter implementing `NativeAudioModule`. A production adapter now exists
   at `apps/mobile/src/features/recording/native-audio-module.ts`; the app
   shell still needs to instantiate `RecordingService` from the completed
   start-flow command, so the bridge is ready but not yet an end-to-end UI
   path.
5. **P09 TypeScript/native protocol drift was exposed (high product risk).**
   TypeScript requires a versioned command envelope and correlation ID for
   every command; native methods accept positional arguments and return
   platform-specific JSON. The adapter now provides the explicit conversion
   layer and Android success paths return JSON, but native/TS conformance and
   Opus/WebM encoding are still required before physical-device qualification.
6. **P06 worker does not apply the job registry's declared timeout and
   concurrency values (reliability risk).** The worker hard-codes concurrency
   to one and supplies no processor timeout. The dispatcher also has no
   in-flight poll guard, so LISTEN and timer polling can overlap. These need
   isolated tests and a bounded dispatch implementation.
7. **Evidence and progress claims are stale or internally contradictory.**
   P01 evidence claims zero lint warnings while the current lint run reported
   169 warnings. P13 evidence reports seven route tests, while the repaired
   focused suite has eleven. P14 remains correctly `NOT_STARTED`: its direct
   P10 and P13 dependencies are `IMPLEMENTED`, not `VERIFIED`.

## Verification boundary

No manual, device, provider, Docker, or hosted-CI result is inferred here.
All semantic edits below were preceded by an impact check and followed by a
focused regression test or typecheck; external/runtime qualification remains
separate evidence.

## Corrective continuation (2026-07-28)

The following findings were subsequently fixed and directly verified:

- `MeetingsRepository.listLifecycle()` now retains state, and
  `MeetingService.listMeetings()` applies the requested state filter. API and
  database typechecks plus the P10 service regression tests pass.
- API composition now registers meeting routes whenever the database is
  configured and audio routes when the S3 object store is configured. The
  storage-disabled path remains explicit and returns service-unavailable from
  playback rather than constructing a fake store.
- P09 has a real Expo/React-Native JS adapter with command conversion,
  canonical event validation, native-listener cleanup, and PCM fail-closed
  handling. Its focused tests (2/2) and mobile typecheck pass. The Android
  native success paths now return their JSON response instead of Kotlin
  `Unit`.
- P06 worker startup now reads registry concurrency/timeout settings, maps
  execution errors to safe diagnostics, and aborts cooperative work at the
  configured deadline. Dispatcher batches are serialized; the mutex tests
  pass.
- Required-suite inventory now keeps API audio Testcontainers tests in the
  integration suite. Root unit and contract suites pass; API unit runs 38/38.
- ESLint and Prettier no longer scan native toolchains/generated artifacts.
  Format, lint, monorepo typecheck, root unit, and contract gates pass. Lint
  still reports 175 pre-existing `no-explicit-any` warnings, so “0 warnings”
  remains an invalid historical evidence claim.

Additional corrective work:

- Added `POST /v1/meetings` and `POST /v1/meetings/:meetingId/start`. Creation
  validates and persists the versioned policy; Start performs an owner-scoped
  lifecycle transition and rejects cloud paths without explicit granted
  consent. Invalid request bodies map to safe 400 errors.
- Added `createNativeCaptureStarter`, connecting the validated P08 command to
  `RecordingService` without inventing a meeting id/storage path or
  acknowledging success before native state reaches `recording`.
- Removed the mobile prototype's false recording toggle; the shell now shows
  Start as unavailable until authenticated setup and native readiness exist.
- Updated migration-restore expectations for the additive `0008` migration and
  made integration teardown safe when Testcontainers cannot start.
- Added the typed mobile `AuthenticatedMeetingApi` and
  `createRemoteCaptureStarter`: create/start requests carry the validated
  policy and idempotency key, while a failed server start cancels local capture
  instead of leaving a split-brain recording.
- Repaired P08 draft restoration: it now validates a strict persisted-draft
  schema, rejects policy/language mismatches, enforces non-empty unique source
  selection, and removes the dummy `speechMode`/unsafe language cast.
- Replaced the duplicate mobile translation helper with the domain contract so
  meeting-only and meeting-translate commands share one typed mapping.
- Fixed `MeetingsRepository.setCaptureSources()`: the child table has no
  `ownerId`, so authorization now goes through the owner-scoped parent meeting;
  source changes are also rejected after recording starts instead of relying
  on an invalid owner-column predicate.
- Tightened `MeetingListQuerySchema.state` to the canonical domain state enum;
  arbitrary query strings no longer cross the HTTP boundary as an unsafe cast
  into the repository filter.
- Start now persists and replays its response under a namespaced
  `Idempotency-Key` inside the same transaction as the recording transition;
  request-hash conflicts are rejected and covered by an API service regression
  test.
- This repository defect was found by checking owner-scoped queries beyond the
  original focused paths; the parent authorization and post-start immutability
  checks are now covered by the implementation, while live SQL evidence still
  awaits Docker integration.

P14 architecture review remains a deliberate boundary finding: the current
meeting End route only performs the P10 lifecycle transition. It does not yet
record an immutable finalization manifest, verify uploaded ranges, enqueue a
final run, or expose completeness. Implementing those in this pass would
violate P14's dependency gate and scope firewall, so P14 remains `NOT_STARTED`
rather than being presented as partially complete.

The remaining blockers are substantive, not hidden by the gates: Docker is
currently unavailable for PostgreSQL/MinIO integration, the P09 Android/iOS
encoders still emit raw PCM until real Opus/WebM encoding is implemented, and the mobile
The app shell still needs runtime composition of the authenticated client,
secure storage directory, and native module; until those dependencies exist it
correctly keeps Start disabled rather than simulating recording.

Latest P00–P12 continuation verification: monorepo typecheck, unit, contract,
build, lint (0 errors), format, execution-plan validation, and the P08/P10
Start idempotency regression all pass. The integration gate still exits non-zero before running
its 14 Testcontainers tests because no container runtime is available; all 14
are skipped rather than treated as passing.
