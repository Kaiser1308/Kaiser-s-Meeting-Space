# Android Physical Recording Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable Android physical-recording harness that exercises the production microphone flow on one explicitly selected phone and verifies durable P07 SQLite metadata and exact on-device chunk hashes without exporting audio.

**Architecture:** Extend the existing P07 SQLite manifest with backward-compatible Android PCM/raw entries and recording-session lifecycle data, then adapt Expo SDK 54 SQLite to the existing `SqliteConnection` contract. Inject that persistence into the production recording service and expose only current-session safe details in the existing recording screen. A Node.js host runner uses ADB and UIAutomator accessibility labels to drive the ordinary app flow, monitor one selected run, hash only its listed chunk files with `run-as`, and write sanitized local evidence.

**Tech Stack:** TypeScript, Expo SDK 54 `expo-sqlite`, SQLite, React Native, Kotlin/Android AudioRecord, Node.js ESM, `node:test`, ADB, Android UIAutomator, Vitest.

## Global Constraints

- Use the host-side Node.js runner with Android Debug Bridge (ADB) and Android's built-in UIAutomator hierarchy/input facilities to drive the installed app's production screens.
- The first profile is `physical-recording`. Supported durations are `5m`, `1h`, `3h`, and `4h`. Run one selected profile and duration per invocation; do not automatically run all durations as a batch.
- The runner must locate controls from the current accessibility/UI hierarchy and their labels, not fixed screen coordinates. It may use coordinates derived from the current hierarchy bounds when ADB input requires a tap. Unknown or ambiguous UI is a stop condition, not permission to guess.
- Use the existing P07 SQLite `ManifestStore`, an Expo SDK 54-compatible `expo-sqlite` adapter behind `SqliteConnection`, and app-private persistent storage. Do not create a parallel JSON manifest.
- Persist `sample_count` from actual captured samples; do not infer it from file size or duration. Keep audio I/O and whole-file hashing out of synchronous JavaScript calls.
- The runner never installs or replaces the APK, changes settings or permissions, clears app data, force-stops the app, deletes recordings, exports the database, copies audio to the host, or scans unrelated meetings. The operator installs the intended debuggable development build separately and handles any OS microphone prompt.
- Hash only basenames listed for the active UUID and matching `<recording-uuid>-chunk-<four-digit-index>.pcm`, using scoped `run-as`. If safe metadata or exact run-owned file access cannot be proven, stop and report `BLOCKED`.
- Evidence contains no raw audio, transcript, meeting title, account identity, screenshots, full UI hierarchy, unredacted logcat, or content logs. Keep only sanitized status/error codes, build/device identity, timing, numeric health samples, chunk metadata, and hashes.
- A shortened run, guessed UI action, missing health sample, synthetic device/provider, or unknown finalization state is never `PASS`. Unit tests of the host runner are not physical-device qualification.
- This harness does not test speech recognition, transcripts, translation, minutes, exports, or the complete P09 physical matrix. P09 remains `IMPLEMENTED`; do not update phase status, traceability, progress, or evidence from a harness implementation or a single run.
- Preserve existing user changes. Stay on the current branch; do not create a worktree. Commit each task separately after its narrow tests pass, stage only that task's files, and run GitNexus `detect_changes({scope: "staged", repo: "Kaiser-s-Meeting-Space"})` before each commit. Before changing an existing class, function, or method, run upstream GitNexus impact and report HIGH/CRITICAL risk before proceeding.
- Do not use real meeting content or claim a manual physical-device test passed unless that exact run was directly performed and its sanitized result was verified.

---

## File Structure

| Path                                                                                                          | Responsibility                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/local-recovery/src/contracts/sqlite.ts`                                                             | Add a synchronous transaction callback to the existing SQLite connection contract.                                                                    |
| `packages/local-recovery/src/adapters/sqljs-adapter.ts`                                                       | Implement transaction/rollback for the in-memory SQL.js reference adapter.                                                                            |
| `packages/local-recovery/src/manifest/schema.ts`                                                              | Add migration v2 for PCM/raw, explicit nullable legacy sample counts, sessions, and session events.                                                   |
| `packages/local-recovery/src/manifest/store.ts`                                                               | Map new manifest/session fields and expose atomic lifecycle/session operations.                                                                       |
| `packages/local-recovery/src/manifest/index.ts`                                                               | Export the new public session types.                                                                                                                  |
| `packages/local-recovery/test/manifest/store.test.ts`                                                         | Cover v1-to-v2 preservation, PCM/raw rows, sample counts, session lifecycle, and atomic finalization.                                                 |
| `packages/local-recovery/test/upload/reconcile.test.ts`                                                       | Keep existing local manifest fixtures explicit about sample counts.                                                                                   |
| `packages/local-recovery/test/fault/crash-matrix.test.ts`                                                     | Keep crash-matrix manifest fixtures explicit about sample counts.                                                                                     |
| `packages/local-recovery/test/recovery/inbox.test.ts`                                                         | Keep recovery manifest fixtures explicit about sample counts.                                                                                         |
| `packages/mobile-audio/src/contracts/events.ts`                                                               | Require positive `sampleCount` in chunk events.                                                                                                       |
| `packages/mobile-audio/src/adapters/fake-module.ts`                                                           | Supply deterministic decoded sample counts in synthetic contract events.                                                                              |
| `packages/mobile-audio/src/adapters/android/types.ts`                                                         | Keep Android event typings aligned with the shared event schema.                                                                                      |
| `packages/mobile-audio/test/contract.test.ts`                                                                 | Cover required/invalid sample counts and fake event compatibility.                                                                                    |
| `apps/mobile/modules/audio-recorder/android/src/main/java/expo/modules/audiorecorder/AudioCaptureEngine.kt`   | Count samples from buffers actually written and include that count in finalized chunk events.                                                         |
| `apps/mobile/modules/audio-recorder/android/src/main/java/expo/modules/audiorecorder/PcmSampleCounter.kt`     | Small tested counter for actual PCM frames accepted by the writer.                                                                                    |
| `apps/mobile/modules/audio-recorder/android/src/test/java/expo/modules/audiorecorder/PcmSampleCounterTest.kt` | Verify actual-buffer accumulation and per-chunk reset behavior.                                                                                       |
| `apps/mobile/modules/audio-recorder/android/build.gradle`                                                     | Add the local unit-test dependency required for the counter test.                                                                                     |
| `apps/mobile/src/features/recording/persistence/expo-sqlite-connection.ts`                                    | Adapt Expo SDK 54 synchronous SQLite methods to `SqliteConnection`.                                                                                   |
| `apps/mobile/src/features/recording/persistence/recording-manifest.ts`                                        | Initialize `ManifestStore`, map native events to P07 rows, validate safe chunk basenames, and return current-session display data.                    |
| `apps/mobile/src/features/recording/persistence/expo-sqlite-connection.test.ts`                               | Verify Expo adapter parameter forwarding, row mapping, transaction commit, and rollback with a controlled SQLite API double.                          |
| `apps/mobile/src/features/recording/persistence/recording-manifest.test.ts`                                   | Verify Android PCM mapping, sample counts, lifecycle/event persistence, and path/basename rejection.                                                  |
| `apps/mobile/src/features/recording/service/recording-service.ts`                                             | Make durable manifest writes precede committed/finalized reducer actions and serialize native chunk handling.                                         |
| `apps/mobile/src/features/recording/service/recording-service.test.ts`                                        | Cover lifecycle order, persistence failures, and persisted pause/resume/gap events.                                                                   |
| `apps/mobile/src/features/recording/service/end-handshake.test.ts`                                            | Assert final chunk plus finalized session commit atomically before `FINALIZE_OK`.                                                                     |
| `apps/mobile/src/features/recording/reducer/types.ts`                                                         | Add serializable current-session details to recording state/actions.                                                                                  |
| `apps/mobile/src/features/recording/reducer/recording-reducer.ts`                                             | Apply session/detail updates without weakening existing recording-state transitions.                                                                  |
| `apps/mobile/src/features/recording/reducer/recording-reducer.test.ts`                                        | Cover detail updates and preserve existing transition rejection behavior.                                                                             |
| `apps/mobile/src/features/recording/screens/RecordingScreen.tsx`                                              | Expose current UUID, persisted session state, and safe current-session chunk fields accessibly.                                                       |
| `apps/mobile/src/features/recording/screens/RecordingScreen.test.tsx`                                         | Verify accessible details, control labels, and absence of absolute paths/title/content.                                                               |
| `apps/mobile/App.tsx`                                                                                         | Construct and inject the production Expo SQLite-backed recording manifest.                                                                            |
| `apps/mobile/scripts/android-recording-harness/args.mjs`                                                      | Parse exactly one profile, duration, serial, and real-audio opt-in.                                                                                   |
| `apps/mobile/scripts/android-recording-harness/adb-client.mjs`                                                | Run argument-vector ADB commands against only the selected serial with bounded timeouts.                                                              |
| `apps/mobile/scripts/android-recording-harness/ui-hierarchy.mjs`                                              | Parse hierarchy in memory and resolve exactly one visible semantic control by label/resource ID.                                                      |
| `apps/mobile/scripts/android-recording-harness/preflight.mjs`                                                 | Perform read-only device/app/build/permission/native/storage/UI preflight and duration estimates.                                                     |
| `apps/mobile/scripts/android-recording-harness/evidence.mjs`                                                  | Whitelist summary fields and write one JSON plus one human-readable sanitized report.                                                                 |
| `apps/mobile/scripts/android-recording-harness/runner.mjs`                                                    | Drive the production screen route, wait at the permission prompt, sample health, end visibly, validate manifest details, and hash exact listed files. |
| `apps/mobile/scripts/android-recording-harness/cli.mjs`                                                       | Select one run, provide long-run confirmation, invoke the runner, and set truthful exit status.                                                       |
| `apps/mobile/scripts/android-recording-harness/args.test.mjs`                                                 | Cover selection/consent/duplicate/unknown argument validation.                                                                                        |
| `apps/mobile/scripts/android-recording-harness/preflight.test.mjs`                                            | Cover read-only blocking conditions and storage estimates.                                                                                            |
| `apps/mobile/scripts/android-recording-harness/evidence.test.mjs`                                             | Cover report allowlisting and content-free output.                                                                                                    |
| `apps/mobile/scripts/android-recording-harness/ui-hierarchy.test.mjs`                                         | Cover unique semantic matches, bounds parsing, ambiguous labels, and unknown UI stops.                                                                |
| `apps/mobile/scripts/android-recording-harness/runner.test.mjs`                                               | Cover polling, state classification, cancellation, command allowlist, hash scope, and sanitized every-exit evidence using an injected ADB transport.  |
| `apps/mobile/package.json`                                                                                    | Add `expo-sqlite` and selectable Android harness/unit-test scripts.                                                                                   |
| `pnpm-lock.yaml`                                                                                              | Record the Expo-SDK-compatible SQLite package resolution.                                                                                             |
| `.gitignore`                                                                                                  | Ignore only `apps/mobile/test-results/android/`, the harness's local evidence directory.                                                              |

## Task 1: P07 Manifest v2 and Atomic Session Operations

**Files:**

- Modify: `packages/local-recovery/src/contracts/sqlite.ts`
- Modify: `packages/local-recovery/src/adapters/sqljs-adapter.ts`
- Modify: `packages/local-recovery/src/manifest/schema.ts`
- Modify: `packages/local-recovery/src/manifest/store.ts`
- Modify: `packages/local-recovery/src/manifest/index.ts`
- Test: `packages/local-recovery/test/manifest/store.test.ts`
- Modify: `packages/local-recovery/test/upload/reconcile.test.ts`
- Modify: `packages/local-recovery/test/fault/crash-matrix.test.ts`
- Modify: `packages/local-recovery/test/recovery/inbox.test.ts`

**Interfaces:**

- Add `SqliteConnection.transaction<T>(operation: () => T): T`; the callback is synchronous and must roll back then rethrow if it throws.
- Change `ManifestEntry.codec` to `'opus' | 'pcm'`, `container` to `'webm' | 'raw'`, and add `sampleCount: number | null`. `null` is reserved for legacy rows whose v1 schema did not store exact sample counts.
- Export `RecordingSessionState = 'configured' | 'recording' | 'paused' | 'finalizing' | 'finalized' | 'recovery_required'` and `RecordingSession` with `{ meetingId, source, state, startedAt, endedAt, version }`.
- Export `ManifestSessionEvent` with `{ meetingId, eventType: 'pause' | 'resume' | 'gap', startMs, endMs, durationMs, reason?: 'buffer_overflow' | 'source_disconnect' | 'crash_recovery' | 'route_change', version }`; pause/resume store a monotonic point (`startMs === endMs`, `durationMs === 0`), and gap stores its exact interval/reason.
- Add `ManifestStore.createSession(session): Promise<void>`, `getSession(meetingId): Promise<RecordingSession | null>`, `updateSessionState(meetingId, state, timestamps?: { startedAt?: string; endedAt?: string }): Promise<void>`, `appendSessionEvent(event): Promise<void>`, `listSessionEvents(meetingId): Promise<ManifestSessionEvent[]>`, and `finalizeSession(entry, endedAt): Promise<void>`.
- `finalizeSession` inserts the final chunk and updates the matching session to `finalized` inside one `SqliteConnection.transaction`; the two changes either both commit or both roll back.

- [ ] **Step 1: Add red migration/store tests.** In `store.test.ts`, add tests that seed a v1 `manifest_entries` row before migration, verify every prior value remains unchanged after v2, and verify its `sampleCount` is `null`. Add PCM/raw insert/read coverage with `sampleCount: 240000`, reject new `appendEntry` rows with a null/non-positive count, add session create/state/event/list coverage, and force finalization failure to assert neither final row nor finalized state remains. Update the `ManifestEntry` fixtures in `test/upload/reconcile.test.ts`, `test/fault/crash-matrix.test.ts`, and `test/recovery/inbox.test.ts` with explicit sample counts; do not make the new field optional to avoid updating callers.

- [ ] **Step 2: Run the focused tests and confirm the new assertions fail.**

Run: `pnpm --filter @kms/local-recovery exec vitest run test/manifest/store.test.ts`

Expected: FAIL because v1 rejects PCM/raw, has no sample-count/session fields, and `SqliteConnection` has no transaction operation.

- [ ] **Step 3: Run GitNexus impact before editing the existing P07 API.** Run `impact({target: "ManifestStore", direction: "upstream", repo: "Kaiser-s-Meeting-Space"})` and `impact({target: "SqliteConnection", direction: "upstream", repo: "Kaiser-s-Meeting-Space"})`; review direct callers and affected flows. Stop and report first if either risk is HIGH or CRITICAL.

- [ ] **Step 4: Implement schema v2 and transactions.** Add a v2 migration that rebuilds `manifest_entries` with `codec IN ('opus','pcm')`, `container IN ('webm','raw')`, a codec/container-pair check, and nullable-positive `sample_count`; copy every v1 field and use SQL `NULL` for only the new legacy count. Recreate existing indexes. Add `recording_sessions` and `recording_session_events` with foreign keys/check constraints. Run each migration in its own SQLite transaction. Implement SQL.js `BEGIN`/`COMMIT`/`ROLLBACK` in the new transaction method. Implement session CRUD and finalization without deriving samples. Reject `appendEntry` calls with `sampleCount: null`; only migration-copy rows may retain null.

```sql
CHECK ((codec = 'opus' AND container = 'webm') OR (codec = 'pcm' AND container = 'raw')),
sample_count INTEGER CHECK (sample_count IS NULL OR sample_count > 0)
```

```ts
transaction<T>(operation: () => T): T {
  db.run('BEGIN TRANSACTION');
  try { const value = operation(); db.run('COMMIT'); return value; }
  catch (error) { db.run('ROLLBACK'); throw error; }
}
```

- [ ] **Step 5: Rerun focused tests, then package tests/typecheck.**

Run: `pnpm --filter @kms/local-recovery exec vitest run test/manifest/store.test.ts`

Expected: PASS, including v1 data preservation and rollback assertions.

Run: `pnpm --filter @kms/local-recovery test:unit`

Expected: PASS with the complete existing recovery/upload/fault test suite.

Run: `pnpm --filter @kms/local-recovery typecheck`

Expected: PASS with no adapter or manifest type errors.

- [ ] **Step 6: Stage only Task 1 files, inspect GitNexus, and commit.** Stage the five production files and four named manifest/reconcile/crash/recovery test files; run `detect_changes({scope: "staged", repo: "Kaiser-s-Meeting-Space"})`. Commit only if the staged symbols/flows are expected:

```powershell
git add packages/local-recovery/src/contracts/sqlite.ts packages/local-recovery/src/adapters/sqljs-adapter.ts packages/local-recovery/src/manifest/schema.ts packages/local-recovery/src/manifest/store.ts packages/local-recovery/src/manifest/index.ts packages/local-recovery/test/manifest/store.test.ts packages/local-recovery/test/upload/reconcile.test.ts packages/local-recovery/test/fault/crash-matrix.test.ts packages/local-recovery/test/recovery/inbox.test.ts
```

```powershell
git commit -m "feat: extend local manifest for Android recording sessions"
```

## Task 2: Persist Actual Sample Counts in Native Chunk Events

**Files:**

- Modify: `packages/mobile-audio/src/contracts/events.ts`
- Modify: `packages/mobile-audio/src/adapters/fake-module.ts`
- Modify: `packages/mobile-audio/src/adapters/android/types.ts`
- Test: `packages/mobile-audio/test/contract.test.ts`
- Modify: `apps/mobile/modules/audio-recorder/android/src/main/java/expo/modules/audiorecorder/AudioCaptureEngine.kt`
- Create: `apps/mobile/modules/audio-recorder/android/src/main/java/expo/modules/audiorecorder/PcmSampleCounter.kt`
- Create: `apps/mobile/modules/audio-recorder/android/src/test/java/expo/modules/audiorecorder/PcmSampleCounterTest.kt`
- Modify: `apps/mobile/modules/audio-recorder/android/build.gradle`

**Interfaces:**

- Add required `sampleCount: number` to the Zod `ChunkEvent` contract; it must be a positive safe integer.
- Add Android event field `sampleCount: Long`, accumulated from successfully written `ShortArray.size` sample frames and reset when opening each chunk.
- Add internal Kotlin `PcmSampleCounter.addWrittenSamples(count: Int)` and `reset(): Long`; the native writer calls `addWrittenSamples` only after a successful buffer write.

- [ ] **Step 1: Add red TypeScript and Kotlin tests.** In the mobile-audio contract test, assert a chunk with `sampleCount: 240000` parses, while absent, zero, negative, and fractional counts fail. Assert fake emitted chunk events provide a positive count. Add Kotlin unit tests for multiple accepted buffers, zeroed new chunks, and no increment for a buffer not passed to the successful-write counter. Add `testImplementation 'junit:junit:4.13.2'` to the audio-recorder module as the test-only setup required by those tests.

- [ ] **Step 2: Run both focused test commands and confirm they fail for missing sample-count support.**

Run: `pnpm --filter @kms/mobile-audio exec vitest run test/contract.test.ts`

Run: `apps/mobile/android/gradlew.bat -p apps/mobile/android projects`

Run: `apps/mobile/android/gradlew.bat -p apps/mobile/android :audio-recorder:testDebugUnitTest`

Expected: the TypeScript schema lacks the required field and the Kotlin test fails to compile because `PcmSampleCounter` has not been implemented. The generated module currently appears as `:audio-recorder`; if Gradle reports a different project name, use the exact listed name in this and the final Kotlin unit-test command and do not skip that test.

- [ ] **Step 3: Run GitNexus impact before changing the existing native/event contracts.** Run upstream impact for `ChunkEventSchema` and `closeCurrentChunkInternal` with repository `Kaiser-s-Meeting-Space`; review all native/fake producers and consumers. Stop and report HIGH/CRITICAL risk before editing.

- [ ] **Step 4: Implement actual counting.** Require a positive integer `sampleCount` in the shared event schema; update every typed chunk fixture and the fake module. Implement the Kotlin counter, increment it only after `currentWriter?.write(buffer)` succeeds in both the normal drain loop and final drain loop, reset it in `openNewChunk()`, and emit its value after the file has closed, hashed, renamed, and directory-fsynced. At close, calculate audio duration once from accumulated actual samples (`sampleCount * 1000 / 48000`) instead of adding a separately truncated millisecond duration for each buffer. Keep byte length as independently observed writer output; never calculate `sampleCount` from `byteLength`.

```kotlin
internal class PcmSampleCounter {
  private var writtenSamples = 0L
  fun addWrittenSamples(count: Int) { require(count >= 0); writtenSamples += count }
  fun reset(): Long = writtenSamples.also { writtenSamples = 0L }
}
```

- [ ] **Step 5: Rerun focused tests and the Android module unit test.**

Run: `pnpm --filter @kms/mobile-audio exec vitest run test/contract.test.ts`

Run: `apps/mobile/android/gradlew.bat -p apps/mobile/android :audio-recorder:testDebugUnitTest`

Expected: PASS for contract validation, fake event shape, sample accumulation, and per-chunk reset. If the preceding `projects` output names the module differently, substitute that exact project name. Then run `pnpm --filter @kms/mobile-audio typecheck` and expect PASS.

- [ ] **Step 6: Stage only Task 2 files, run staged GitNexus detection, and commit.**

```powershell
git add packages/mobile-audio/src/contracts/events.ts packages/mobile-audio/src/adapters/fake-module.ts packages/mobile-audio/src/adapters/android/types.ts packages/mobile-audio/test/contract.test.ts apps/mobile/modules/audio-recorder/android/src/main/java/expo/modules/audiorecorder/AudioCaptureEngine.kt apps/mobile/modules/audio-recorder/android/src/main/java/expo/modules/audiorecorder/PcmSampleCounter.kt apps/mobile/modules/audio-recorder/android/src/test/java/expo/modules/audiorecorder/PcmSampleCounterTest.kt apps/mobile/modules/audio-recorder/android/build.gradle
```

Run `detect_changes({scope: "staged", repo: "Kaiser-s-Meeting-Space"})`; commit only the expected mobile-audio/native event flows as `feat: report exact Android PCM sample counts`.

## Task 3: Expo SDK 54 SQLite Adapter and Mobile Manifest Facade

**Files:**

- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/mobile/src/features/recording/persistence/expo-sqlite-connection.ts`
- Create: `apps/mobile/src/features/recording/persistence/recording-manifest.ts`
- Create: `apps/mobile/src/features/recording/persistence/expo-sqlite-connection.test.ts`
- Create: `apps/mobile/src/features/recording/persistence/recording-manifest.test.ts`

**Interfaces:**

- Implement `createExpoSqliteConnection(database: SQLite.SQLiteDatabase): SqliteConnection` using SDK 54 `execSync`, `runSync`, `getFirstSync`, `getAllSync`, `withTransactionSync`, and `closeSync` methods.
- Implement `RecordingManifest.initialize(): Promise<void>`, `createSession(meetingId: string): Promise<void>`, `setSessionState(meetingId, state, timestamps?: { startedAt?: string; endedAt?: string }): Promise<void>`, `appendEvent(meetingId, event): Promise<void>`, `commitChunk(event): Promise<void>`, `finalizeChunk(event, endedAt): Promise<void>`, and `getDetails(meetingId): Promise<RecordingDetails>`.
- `RecordingDetails` contains only `{ meetingId, state, chunks: Array<{ chunkIndex, basename, byteLength, sampleCount, durationMs, monotonicStart, monotonicEnd, sha256 }> }`; it never contains a title, account fields, database contents, or absolute native path.

- [ ] **Step 1: Add failing adapter/facade tests.** Mock the SDK 54 `SQLiteDatabase` methods and verify SQL/parameter forwarding, row mapping, transaction rollback, and close. Test PCM/raw event mapping including exact `sampleCount`; reject an event unless its UUID and index produce exactly `<uuid>-chunk-<four-digit-index>.pcm` and its basename contains no separator or traversal component.

- [ ] **Step 2: Run the focused mobile tests and confirm the adapter/facade imports or assertions fail.**

Run: `pnpm --filter @kms/mobile exec vitest run src/features/recording/persistence/expo-sqlite-connection.test.ts src/features/recording/persistence/recording-manifest.test.ts`

Expected: FAIL because the adapter/facade files and `expo-sqlite` dependency do not exist.

- [ ] **Step 3: Install the Expo SDK-compatible dependency and implement the adapter.** Run `pnpm --filter @kms/mobile exec expo install expo-sqlite`, keep the version selected by Expo SDK 54 validation, and implement the synchronous adapter. Use `withTransactionSync` only for short SQL statements; do not place file I/O, hashing, awaits, or audio processing inside it.

```ts
transaction<T>(operation: () => T): T {
  return database.withTransactionSync(() => operation());
}
```

- [ ] **Step 4: Implement the manifest facade.** On initialization run `ManifestStore.runMigrations()`. Map native mic chunks to `ManifestEntry` with actual format, count, timings, checksum, bytes, and pending upload state. Derive only the basename from the native path; verify it matches the UUID/index pattern before returning display details. For current-session reads, query one session and only that ID's mic entries.

```ts
const basename = event.filePath.split(/[\\/]/).at(-1);
if (basename !== `${event.meetingId}-chunk-${String(event.chunkIndex).padStart(4, '0')}.pcm`) {
  throw new Error('unsafe_chunk_identity');
}
```

- [ ] **Step 5: Rerun focused tests and mobile typecheck.**

Run: `pnpm --filter @kms/mobile exec vitest run src/features/recording/persistence/expo-sqlite-connection.test.ts src/features/recording/persistence/recording-manifest.test.ts`

Run: `pnpm --filter @kms/mobile typecheck`

Expected: both PASS; the dependency resolver remains compatible with the repository's Expo SDK 54.

- [ ] **Step 6: Stage only Task 3 files, run staged GitNexus detection, and commit.**

```powershell
git add apps/mobile/src/features/recording/persistence/expo-sqlite-connection.ts apps/mobile/src/features/recording/persistence/recording-manifest.ts apps/mobile/src/features/recording/persistence/expo-sqlite-connection.test.ts apps/mobile/src/features/recording/persistence/recording-manifest.test.ts apps/mobile/package.json pnpm-lock.yaml
```

Run `detect_changes({scope: "staged", repo: "Kaiser-s-Meeting-Space"})`; commit only the expected persistence/dependency scope as `feat: add Expo SQLite recording manifest adapter`.

## Task 4: Durable RecordingService Lifecycle Integration

**Files:**

- Modify: `apps/mobile/src/features/recording/service/recording-service.ts`
- Modify: `apps/mobile/src/features/recording/service/recording-service.test.ts`
- Modify: `apps/mobile/src/features/recording/service/end-handshake.test.ts`
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/src/features/recording/reducer/types.ts`
- Modify: `apps/mobile/src/features/recording/reducer/recording-reducer.ts`
- Modify: `apps/mobile/src/features/recording/reducer/recording-reducer.test.ts`

**Interfaces:**

- Change the constructor to `new RecordingService(nativeModule: NativeAudioModule, manifest: RecordingManifest)`; production must inject the Expo SQLite-backed facade.
- `RecordingService.initialize(): Promise<void>` initializes/migrates persistence before attaching the native listener.
- Each native event is serialized through a FIFO promise chain so chunk writes cannot race or overtake each other.
- Internal `markRecoveryRequired(error: unknown): Promise<void>` persists session state `recovery_required`, refreshes safe current-session details when possible, and dispatches a sanitized service error without deleting the native file.
- `RecordingState` adds `sessionState: RecordingSessionState | null` and `recordingDetails: RecordingDetails | null`; reducer action `MANIFEST_DETAILS_UPDATE` carries both fields.
- App readiness must remain disabled until `initialize()` succeeds; a failed SQLite open/migration is shown as a truthful error and cannot start microphone capture.

- [ ] **Step 1: Add red service-order tests.** Use an in-memory `RecordingManifest` test double that records method/action order. Assert configure persists `configured` before native configure, start persists `recording` with `startedAt` before native start, pause/resume/gap persist session events, active cancel persists `recovery_required` without deleting native files, and a chunk is not dispatched as `CHUNK_COMMITTED` until its manifest operation resolves. Inject chunk persistence failure and assert the audio is left untouched, service reports `recovery_required`, and no local-safe/finalized state is emitted.

- [ ] **Step 2: Add red end-handshake ordering/failure tests.** Assert the final chunk is passed to `finalizeChunk(event, endedAt)` as one operation that atomically stores the row and final session state; only after it resolves may `FINALIZE_OK` be dispatched. Reject the operation and assert `FINALIZE_ERROR`, no final committed action, and non-finalized session.

- [ ] **Step 3: Run the two focused test files and confirm the new ordering assertions fail.**

Run: `pnpm --filter @kms/mobile exec vitest run src/features/recording/service/recording-service.test.ts src/features/recording/service/end-handshake.test.ts`

Expected: FAIL because the service currently dispatches the native chunk immediately and has no persistence dependency.

- [ ] **Step 4: Run upstream GitNexus impact before editing lifecycle symbols.** Run `impact({target: "RecordingService", direction: "upstream", repo: "Kaiser-s-Meeting-Space"})` and inspect callers/flows. Report HIGH/CRITICAL risk and pause before modification if returned.

- [ ] **Step 5: Implement persistence ordering and app composition.** Require manifest injection, await `initialize()` before listening, create the session before native configure, and persist successful state transitions/events with actual wall-clock session start/end values. Serialize native events through one promise chain and await that chain after native stop acknowledgment before returning from `end()`. For ordinary chunks await `commitChunk` before dispatch. For the final chunk await `finalizeChunk` before `CHUNK_COMMITTED` and `FINALIZE_OK`. On cancel or any manifest write error preserve native files, set `recovery_required`, and never report saved. Construct `SQLite.openDatabaseSync('recording-manifest.db')` in app-private storage, wrap it with the adapter/facade, and inject it into `RecordingService` in `App.tsx`.

```ts
private eventQueue: Promise<void> = Promise.resolve();

private enqueueNativeEvent(event: NativeEvent): void {
  this.eventQueue = this.eventQueue
    .then(() => this.handleNativeEvent(event))
    .catch((error) => this.markRecoveryRequired(error));
}
```

```ts
if (isFinalChunk) {
  await manifest.finalizeChunk(event, endedAt);
  dispatch({ type: 'CHUNK_COMMITTED', chunk: event });
  dispatch({
    type: 'MANIFEST_DETAILS_UPDATE',
    details: await manifest.getDetails(event.meetingId),
  });
  dispatch({ type: 'FINALIZE_OK' });
} else {
  await manifest.commitChunk(event);
  dispatch({ type: 'CHUNK_COMMITTED', chunk: event });
}
```

- [ ] **Step 6: Rerun focused tests and the full mobile unit/type gates.**

Run: `pnpm --filter @kms/mobile exec vitest run src/features/recording/service/recording-service.test.ts src/features/recording/service/end-handshake.test.ts src/features/recording/reducer/recording-reducer.test.ts`

Run: `pnpm --filter @kms/mobile test:unit`

Run: `pnpm --filter @kms/mobile typecheck`

Expected: PASS; all existing fake-module-based tests inject explicit test persistence, while production has no no-op persistence path.

- [ ] **Step 7: Stage only Task 4 files, run staged GitNexus detection, and commit.**

```powershell
git add apps/mobile/src/features/recording/service/recording-service.ts apps/mobile/src/features/recording/service/recording-service.test.ts apps/mobile/src/features/recording/service/end-handshake.test.ts apps/mobile/App.tsx apps/mobile/src/features/recording/reducer/types.ts apps/mobile/src/features/recording/reducer/recording-reducer.ts apps/mobile/src/features/recording/reducer/recording-reducer.test.ts
```

Run `detect_changes({scope: "staged", repo: "Kaiser-s-Meeting-Space"})`; commit only expected service/reducer flows as `feat: persist Android recording lifecycle in P07`.

## Task 5: Accessible Current-Session Manifest Details

**Files:**

- Modify: `apps/mobile/src/features/recording/screens/RecordingScreen.tsx`
- Modify: `apps/mobile/src/features/recording/screens/RecordingScreen.test.tsx`

**Interfaces:**

- Render a section with stable `accessibilityLabel="Recording details"` and `testID="recording-details"` containing the active UUID, persisted session state, and for each entry the index, validated relative basename, byte length, sample count, duration, monotonic start/end, and SHA-256.
- Render child labels `Recording ID: <uuid>`, `Session state: <state>`, and one chunk label formatted by `formatSafeChunkDetails(chunk): string` as `index=<n>;basename=<name>;byteLength=<n>;sampleCount=<n>;durationMs=<n>;monotonicStart=<n>;monotonicEnd=<n>;sha256=<hex>`.
- Do not render a native absolute path, title, transcript, account identity, unrelated session, or audio data. The screen consumes only `RecordingState.recordingDetails` from Task 4.

- [ ] **Step 1: Add failing screen tests.** Verify all safe details appear in the accessible tree with a stable label/testID; assert a supplied absolute path/title is not present and the existing pause/resume/end controls remain accessible.

- [ ] **Step 2: Run the screen test and confirm the details section is absent.**

Run: `pnpm --filter @kms/mobile exec vitest run src/features/recording/screens/RecordingScreen.test.tsx`

Expected: FAIL on the missing details section/label.

- [ ] **Step 3: Run GitNexus upstream impact for `RecordingScreen`.** Report direct callers and risk; stop for user review if the result is HIGH or CRITICAL.

- [ ] **Step 4: Add the accessible product details section.** Render only the state facade's current-session safe model. Keep the details readable and stable for accessibility hierarchy parsing; do not add a debug-only route or test-specific screen. Assign stable child IDs `recording-session-id`, `recording-session-state`, and `recording-chunk-<index>` so the host can parse individual values without relying on positions.

```tsx
<View accessibilityLabel="Recording details" testID="recording-details">
  <Text accessibilityLabel={`Recording ID: ${details.meetingId}`} testID="recording-session-id">
    Recording ID: {details.meetingId}
  </Text>
  <Text accessibilityLabel={`Session state: ${details.state}`} testID="recording-session-state">
    Session state: {details.state}
  </Text>
  {details.chunks.map((chunk) => (
    <Text
      key={chunk.chunkIndex}
      accessibilityLabel={formatSafeChunkDetails(chunk)}
      testID={`recording-chunk-${chunk.chunkIndex}`}
    >
      {formatSafeChunkDetails(chunk)}
    </Text>
  ))}
</View>
```

Implement `formatSafeChunkDetails` in `RecordingScreen.tsx` as one semicolon-separated `key=value` string in the interface order above; do not interpolate `filePath` or any free-form native error text.

- [ ] **Step 5: Rerun screen/reducer tests, mobile unit tests, and typecheck.**

Run: `pnpm --filter @kms/mobile exec vitest run src/features/recording/screens/RecordingScreen.test.tsx src/features/recording/reducer/recording-reducer.test.ts`

Run: `pnpm --filter @kms/mobile test:unit`

Run: `pnpm --filter @kms/mobile typecheck`

Expected: PASS, including absence-of-sensitive-fields assertions.

- [ ] **Step 6: Stage only Task 5 files, run staged GitNexus detection, and commit.**

```powershell
git add apps/mobile/src/features/recording/screens/RecordingScreen.tsx apps/mobile/src/features/recording/screens/RecordingScreen.test.tsx
```

Run `detect_changes({scope: "staged", repo: "Kaiser-s-Meeting-Space"})`; commit only expected recording-screen flows as `feat: expose safe recording manifest details`.

## Pre-Runner Physical Capability Gate

Complete this gate after Tasks 1–5 and before implementing the host ADB runner. It verifies the two assumptions on which the runner depends: accessible current-session data in the production UI and narrowly scoped on-device hashing.

- [ ] Run all P07, mobile-audio, and mobile unit/type checks from the final handoff list, then build only with `apps/mobile/android/gradlew.bat -p apps/mobile/android :app:assembleDebug`. Do not use `expo run:android` to install the package.
- [ ] Have the operator install that reviewed development APK through the normal process, confirm the phone is authorized/unlocked and already logged in, and explicitly choose one `5m` capability run before any real microphone capture. No helper APK, permission command, setting change, database export, or real meeting title/content is allowed.
- [ ] Start one synthetic-title recording by the ordinary visible product flow. After its normal End/finalization, read only the current screen's accessible UUID/chunk fields and use `run-as com.anonymous.kaisermeetingspace toybox sha256sum files/recordings/<validated-current-chunk-basename>.pcm` plus `toybox wc -c` on those same exact validated basenames. Compare each digest/byte count with the current-session UI metadata; do not copy any file or inspect other sessions.
- [ ] This capability run creates real on-device audio and leaves it there; record its retention notice and ask the operator to clean it later through a supported app path. It is not phase evidence and does not close P09.
- [ ] If UI metadata or exact `run-as` checksumming is unavailable, unsafe, or requires any rejected mechanism, stop before Task 6 and report the observed blocker for user direction. Do not silently switch to a sidecar, helper APK, product test route, or broad export.

## Task 6: Harness CLI, Read-Only ADB Preflight, and Evidence Whitelist

**Files:**

- Create: `apps/mobile/scripts/android-recording-harness/args.mjs`
- Create: `apps/mobile/scripts/android-recording-harness/adb-client.mjs`
- Create: `apps/mobile/scripts/android-recording-harness/preflight.mjs`
- Create: `apps/mobile/scripts/android-recording-harness/evidence.mjs`
- Create: `apps/mobile/scripts/android-recording-harness/args.test.mjs`
- Create: `apps/mobile/scripts/android-recording-harness/preflight.test.mjs`
- Create: `apps/mobile/scripts/android-recording-harness/evidence.test.mjs`

**Interfaces:**

- `parseArgs(argv): { profile: 'physical-recording'; duration: '5m' | '1h' | '3h' | '4h'; device: string; allowRealAudio: true }` rejects absent/duplicate/unknown values before constructing the ADB client.
- `createAdbClient({ spawnProcess, serial }): { run(args: string[], options?: { timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>; readAdbVersion(): Promise<string> }` always binds `-s <serial>` for device commands and never uses shell interpolation. `readAdbVersion()` invokes only the fixed host-level command `adb version` without a device selector.
- `runPreflight(selection, adb): Promise<{ status: 'READY' | 'BLOCKED'; failureCode?: string; facts: SanitizedPreflightFacts }>` is read-only and validates that the explicit serial returns `get-state=device`, identifies a physical (not emulator) device by read-only properties, and has expected package `com.anonymous.kaisermeetingspace` already in the foreground, an identifiable debuggable build, an existing authenticated development session, permission state, native app/UI readiness, and the storage floor. An ungranted but requestable microphone permission is allowed to continue to the normal OS prompt; a denial or non-requestable state blocks without opening Settings. If the operator has not opened the app, return `BLOCKED` and ask them to open it manually.
- `writeEvidence(directory, summary): Promise<void>` writes exactly `<runId>.json` and `<runId>.md` after filtering against a fixed field allowlist.

- [ ] **Step 1: Add failing parser, preflight, and privacy tests.** Cover only supported profile/duration, duplicate/missing/unknown arguments, required serial and `--allow-real-audio`, selected-serial `get-state` authorization, physical/emulator properties, wrong package/build, unauthenticated screen, missing native readiness, requestable versus denied microphone permission, insufficient storage, duration calculations at 96,000 bytes/s plus 25%, and evidence filtering of titles, account fields, hierarchy XML, screenshots, logs, and arbitrary nested keys.

- [ ] **Step 2: Run the focused Node tests and confirm they fail because the modules do not exist.**

Run: `node --test apps/mobile/scripts/android-recording-harness/args.test.mjs apps/mobile/scripts/android-recording-harness/preflight.test.mjs apps/mobile/scripts/android-recording-harness/evidence.test.mjs`

Expected: FAIL with missing module errors.

- [ ] **Step 3: Implement argument parsing, ADB process control, preflight, and evidence.** Parse every flag before any ADB invocation. Restrict ADB calls to read-only device/app/storage/permission/process queries during preflight. Treat inaccessible or ambiguous facts as `BLOCKED`. Compute the estimate from 96,000 bytes/second and apply `ceil(bytes * 1.25)`; do not hardcode estimates independently of that formula. Use Node built-ins only for runner orchestration and keep errors as stable safe codes.

```js
const selection = parseArgs(argv); // throws before any ADB process starts
const adb = createAdbClient({ spawnProcess, serial: selection.device });
const preflight = await runPreflight(selection, adb);
```

- [ ] **Step 4: Rerun the focused tests and static syntax checks.**

Run: `node --test apps/mobile/scripts/android-recording-harness/args.test.mjs apps/mobile/scripts/android-recording-harness/preflight.test.mjs apps/mobile/scripts/android-recording-harness/evidence.test.mjs`

Run: `node --check apps/mobile/scripts/android-recording-harness/args.mjs; node --check apps/mobile/scripts/android-recording-harness/adb-client.mjs; node --check apps/mobile/scripts/android-recording-harness/preflight.mjs; node --check apps/mobile/scripts/android-recording-harness/evidence.mjs`

Expected: all tests pass; `node --check` exits 0 for every module.

- [ ] **Step 5: Stage only Task 6 files, run staged GitNexus detection, and commit.**

```powershell
git add apps/mobile/scripts/android-recording-harness/args.mjs apps/mobile/scripts/android-recording-harness/adb-client.mjs apps/mobile/scripts/android-recording-harness/preflight.mjs apps/mobile/scripts/android-recording-harness/evidence.mjs apps/mobile/scripts/android-recording-harness/args.test.mjs apps/mobile/scripts/android-recording-harness/preflight.test.mjs apps/mobile/scripts/android-recording-harness/evidence.test.mjs
```

Run `detect_changes({scope: "staged", repo: "Kaiser-s-Meeting-Space"})`; commit only expected harness preflight/evidence modules as `feat: add Android recording harness preflight`.

## Task 7: UIAutomator Recording Run, Integrity Check, and Selectable Commands

**Files:**

- Create: `apps/mobile/scripts/android-recording-harness/ui-hierarchy.mjs`
- Create: `apps/mobile/scripts/android-recording-harness/runner.mjs`
- Create: `apps/mobile/scripts/android-recording-harness/cli.mjs`
- Create: `apps/mobile/scripts/android-recording-harness/ui-hierarchy.test.mjs`
- Create: `apps/mobile/scripts/android-recording-harness/runner.test.mjs`
- Modify: `apps/mobile/package.json`
- Modify: `.gitignore`

**Interfaces:**

- `parseHierarchy(xml): UiNode[]` parses in memory and returns only `text`, `contentDesc`, `resourceId`, `clickable`, and integer `bounds` fields.
- `findUniqueControl(nodes, label): UiNode` returns one visible, enabled exact semantic match; zero or multiple matches throw stable `ui_control_missing`/`ui_control_ambiguous` codes.
- `readCurrentHierarchy(adb): Promise<UiNode[]>`, `tapUniqueControl(adb, label): Promise<void>`, `readRecordingState(nodes): { screen: string; nativeState: string; sessionState: string | null; chunksCommitted: number }`, `driveToPermissionPrompt(adb): Promise<void>`, `waitForPermissionDecision(prompt, adb): Promise<'granted' | 'denied'>`, `waitForActiveRecording(adb): Promise<UiNode[]>`, `collectHealthSample(adb, nodes, elapsedMs): Promise<HealthSample>`, `waitForFinalizedSession(adb, timeoutMs): Promise<RecordingDetails>`, `readCurrentSessionDetails(nodes): RecordingDetails`, and `hashExactListedChunks(adb, details): Promise<HashResult[]>` are the runner's only UI, prompt, health, and integrity helpers.
- `HealthSample = { elapsedMs, chunksCommitted, freeBytes, processPssBytes, batteryLevelPct?, batteryTemperatureC? }`; `HashResult = { basename, sha256, byteLength }`. `buildBlockedSummary(selection, failureCode): RunSummary` and `buildRunSummary(preflight, details, hashes, healthSamples): RunSummary` create allowlisted data for `writeEvidence` from Task 6.
- `durationMilliseconds(duration): number` maps only the four supported durations; use `stopTimeoutMs = 30_000` for the terminal wait.
- `runPhysicalRecording({ selection, adb, prompt, clock, outputDirectory }): Promise<RunSummary>` returns `PASS | FAIL | BLOCKED`; inject dependencies only for deterministic host unit tests, never as an alternate production capture path.
- `RunSummary` contains only `{ runId, profile, duration, status, safeFailureCode?, safeErrorCodes, redactedDevice, appBuild, runnerVersion, adbVersion, hostStartedMonotonicMs?, hostEndedMonotonicMs?, elapsedMs?, healthSamples, observedInterruptions, initialFreeBytes?, finalFreeBytes?, totalBytes, sampleCount, chunkCount, chunks, manifestState, finalizationState, retentionNotice }`; each health row contains only `{ elapsedMs, chunksCommitted, freeBytes, processPssBytes, batteryLevelPct?, batteryTemperatureC? }`; `chunks` contains only validated basenames, index, bytes, samples, duration, native monotonic bounds, and SHA-256.
- Set mobile scripts to `"test:android": "node scripts/android-recording-harness/cli.mjs"` and `"test:android:unit": "node --test scripts/android-recording-harness/args.test.mjs scripts/android-recording-harness/preflight.test.mjs scripts/android-recording-harness/evidence.test.mjs scripts/android-recording-harness/ui-hierarchy.test.mjs scripts/android-recording-harness/runner.test.mjs"`.

- [ ] **Step 1: Add failing hierarchy and run-orchestration tests.** Test exact unique labels and bounds, missing/ambiguous control stops, the ordinary route `Set up meeting` → synthetic title `Synthetic physical recording harness` → `Continue` → `Continue to readiness` → operator-controlled Android permission prompt → `Start recording` → `End recording`, monotonic duration/tolerance, 5-second liveness polling, 60-second health samples, missing-sample failure, terminal manifest state, and every-exit evidence. Assert missing prerequisites classify `BLOCKED`, failed assertions/crashes classify `FAIL`, and only complete runs with all integrity/finalization/health checks classify `PASS`.

- [ ] **Step 2: Add security/privacy assertions before the runner implementation.** Inject an ADB command recorder and assert the run never issues `install`, `uninstall`, `pm grant`, `pm clear`, `settings put`, `am force-stop`, broad `find`/database-export commands, or `rm` except for the exact unique UI hierarchy temp path created by this run. Assert checksum calls accept only current UUID/index-matching `.pcm` basenames, execute scoped `run-as com.anonymous.kaisermeetingspace toybox sha256sum`, and never pull a file/database to the host. Assert report output omits raw hierarchy, screenshots, logs, meeting title, and account identity.

- [ ] **Step 3: Run the focused Node tests and confirm they fail before implementation.**

Run: `node --test apps/mobile/scripts/android-recording-harness/ui-hierarchy.test.mjs apps/mobile/scripts/android-recording-harness/runner.test.mjs`

Expected: FAIL with missing module errors.

- [ ] **Step 4: Implement hierarchy parsing and safe UI actions.** Read the current accessibility hierarchy into process memory, parse it, and never include it in evidence. If the device command requires a file destination, first verify the unique run-owned `/data/local/tmp/kms-ui-<runId>.xml` does not exist; then stream it to memory and remove only that exact temporary file in `finally`. If it already exists, stop without overwrite or delete. Do not write a hierarchy beneath app-private storage. Match the exact existing labels `Set up meeting`, `Continue`, `Continue to readiness`, `Start recording`, `Recording details`, and `End recording`; use the current node's bounds midpoint only when a tap is needed. Enter only the fixed synthetic title, never a real meeting title. If hierarchy collection would require retaining content-bearing output or the expected label cannot be matched uniquely, stop as `BLOCKED` without guessing.

- [ ] **Step 5: Implement the one-run lifecycle.** Run read-only preflight first. For `1h`, `3h`, and `4h`, show the selected duration, byte estimate, and wall-clock expectation and require an explicit affirmative terminal confirmation; default to no. Wait for a human to handle Android's normal microphone prompt; after the operator responds, re-read permission state, and do not start capture if permission was denied. Start the host monotonic timer only after the recording screen confirms active state. Poll foreground/process/UI state every 5 seconds and record committed-chunk count, free storage, process PSS, battery level, and battery temperature where exposed every 60 seconds. At the deadline tap only the visible `End recording` control, wait for the persisted `finalized` state, validate each chunk's monotonic bounds and ordered boundaries, sample counts and bytes (for PCM16 mono, `byteLength === sampleCount * 2`), and verify active capture duration against native chunk monotonic bounds (10-second tolerance for 5m; 30 seconds for longer runs). Then hash only the exact listed basenames in app-private storage. Never copy or delete recordings. On cancellation/failure, use End only if the known production control is visible and safe; otherwise instruct manual inspection and write `FAIL`/`BLOCKED` with unknown finalization accurately represented.

```js
const preflight = await runPreflight(selection, adb);
if (preflight.status === 'BLOCKED') {
  await writeEvidence(outputDirectory, buildBlockedSummary(selection, preflight.failureCode));
  return;
}
await driveToPermissionPrompt(adb);
if ((await waitForPermissionDecision(prompt, adb)) === 'denied') {
  const summary = buildBlockedSummary(selection, 'microphone_permission_denied');
  await writeEvidence(outputDirectory, summary);
  return summary;
}
await tapUniqueControl(adb, 'Start recording');
const activeNodes = await waitForActiveRecording(adb);
if (readRecordingState(activeNodes).nativeState !== 'recording')
  throw new Error('recording_start_not_acknowledged');
const startedAt = performance.now();
const healthSamples = [];
let nextHealthAt = 60_000;
const selectedDurationMs = durationMilliseconds(selection.duration);
while (performance.now() - startedAt < selectedDurationMs) {
  const nodes = await readCurrentHierarchy(adb);
  const state = readRecordingState(nodes);
  if (state.screen !== 'recording' || state.nativeState !== 'recording')
    throw new Error('recording_liveness_failed');
  const elapsedMs = performance.now() - startedAt;
  if (elapsedMs >= nextHealthAt) {
    healthSamples.push(await collectHealthSample(adb, nodes, elapsedMs));
    nextHealthAt += 60_000;
  }
  await sleep(Math.min(5_000, selectedDurationMs - elapsedMs));
}
await tapUniqueControl(adb, 'End recording');
const details = await waitForFinalizedSession(adb, 30_000);
const hashes = await hashExactListedChunks(adb, details);
const summary = buildRunSummary(preflight, details, hashes, healthSamples);
await writeEvidence(outputDirectory, summary);
return summary;
```

- [ ] **Step 6: Add package scripts and local-output ignore.** Add the two scripts above and ignore only `apps/mobile/test-results/android/`. Write one JSON and one concise Markdown report for every started or blocked run; include the on-device retention notice and operator cleanup guidance, not an automatic cleanup action.

- [ ] **Step 7: Run all host harness tests and mobile checks.**

Run: `pnpm --filter @kms/mobile test:android:unit`

Run: `pnpm --filter @kms/mobile test:android -- --profile physical-recording --duration 5m --allow-real-audio`

Expected: unit tests PASS; the CLI rejects the missing explicit device serial before invoking ADB or touching a phone. This argument-validation check is not a physical recording test.

Run: `pnpm --filter @kms/mobile test:unit`

Run: `pnpm --filter @kms/mobile typecheck`

Expected: PASS with no regression to product UI, reducer, SQLite, or native adapter tests.

- [ ] **Step 8: Stage only Task 7 files, run staged GitNexus detection, and commit.**

```powershell
git add apps/mobile/scripts/android-recording-harness/ui-hierarchy.mjs apps/mobile/scripts/android-recording-harness/runner.mjs apps/mobile/scripts/android-recording-harness/cli.mjs apps/mobile/scripts/android-recording-harness/ui-hierarchy.test.mjs apps/mobile/scripts/android-recording-harness/runner.test.mjs apps/mobile/package.json .gitignore
```

Run `detect_changes({scope: "staged", repo: "Kaiser-s-Meeting-Space"})`; commit only expected harness/package/output-ignore scope as `feat: add selectable Android physical recording harness`.

## Final Handoff Gate

- [ ] Confirm the working branch is unchanged and every harness/product task is in its own commit; do not stage or alter the pre-existing user changes.
- [ ] Run `pnpm --filter @kms/local-recovery test:unit`, `pnpm --filter @kms/local-recovery typecheck`, `pnpm --filter @kms/mobile-audio test:unit`, `pnpm --filter @kms/mobile-audio typecheck`, `pnpm --filter @kms/mobile test:android:unit`, `pnpm --filter @kms/mobile test:unit`, and `pnpm --filter @kms/mobile typecheck`.
- [ ] Build, but do not install, the Android development app using `apps/mobile/android/gradlew.bat -p apps/mobile/android :app:assembleDebug`; the operator separately installs the reviewed APK through the normal process.
- [ ] On the existing explicitly selected physical device, first validate that the ordinary recording screen exposes the active UUID and exact persisted chunk metadata and that scoped `run-as ... toybox sha256sum` can hash only the listed current-session chunk. If a helper APK, permission mutation, broad private-data scan, full DB export, or product test-only route is required, stop and ask for design approval.
- [ ] Only when the operator later selects one duration and invokes the real opt-in CLI should that one direct-device run occur. Verify its JSON/Markdown artifacts and the retained on-device recording before describing its result. A unit-suite pass or preflight `BLOCKED` result does not qualify the device.
- [ ] Do not change `docs/execution/STATUS.md`, `docs/execution/TRACEABILITY.md`, `docs/execution/PROGRESS.md`, P07/P09 phase state, or phase evidence as part of this harness implementation. P09 remains `IMPLEMENTED` until its independent authoritative gates have evidence.

## Plan Self-Review

- **Spec coverage:** The seven tasks cover manifest migration/session/events/sample counts, SDK-compatible SQLite, durable lifecycle order, accessible safe metadata, explicit one-run CLI selection, physical-only preflight, operator-controlled permission, timing/health sampling, exact scoped hash verification, sanitized every-exit evidence, non-destructive behavior, and P09 status boundaries. Full pipeline/transcription and automatic cleanup are explicitly excluded.
- **Placeholder scan:** No implementation item is deferred; unresolved device facts result in the specified `BLOCKED`/stop behavior. The missing-device CLI invocation is argument validation only and is not claimed as device evidence.
- **Type consistency:** `ManifestEntry.sampleCount` and `ChunkEvent.sampleCount` feed `RecordingManifest.commitChunk/finalizeChunk`; `RecordingManifest.getDetails` produces the `RecordingDetails` held in reducer state and rendered by `RecordingScreen`; the host parses only that UI-safe details contract and hashes validated basenames. Final chunk persistence precedes the reducer's terminal success state.

## References

- Approved design: `docs/superpowers/specs/2026-09-25-android-physical-recording-harness-design.md`
- P07 contract: `docs/execution/phases/P07-local-recovery-engine.md`
- P09 boundary: `docs/execution/phases/P09-mobile-recording.md`
- Expo SDK 54 SQLite API: <https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/>
- Expo CLI build/run flags: <https://docs.expo.dev/more/expo-cli/>
- Android UI Automator API: <https://developer.android.com/reference/androidx/test/uiautomator/UiDevice>
