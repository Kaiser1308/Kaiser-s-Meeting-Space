# P10 Design / Boundary Map

## 1. Contract Inventory

### 1.1 P07 -- `@kms/local-recovery` (Stable)

All exported from `packages/local-recovery/src/index.ts`.

**Contracts:**

| Symbol                 | File                            | Kind      | P10 Consumer                                                                           |
| ---------------------- | ------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `FileSystem`           | `contracts/filesystem.ts:29-61` | Interface | T01 (atomicWrite for transport), T03 (fs.delete, fs.exists), T06 (validate local file) |
| `Clock`                | `contracts/clock.ts:1-10`       | Interface | T02 (scheduling timestamps)                                                            |
| `Checksum`             | `contracts/checksum.ts:3-9`     | Interface | T01/T06 (SHA-256 verification)                                                         |
| `UploadTransport`      | `contracts/transport.ts:25-50`  | Interface | **T01 primary** (registerChunk, uploadChunk, completeChunk, getServerManifest)         |
| `UploadTransportError` | `contracts/transport.ts:4-13`   | Class     | T01 (NETWORK, AUTH_EXPIRED, CHECKSUM_CONFLICT, STORAGE_ERROR, SERVER_ERROR)            |
| `ServerManifestEntry`  | `contracts/transport.ts:16-23`  | Interface | T01 (reconciliation input)                                                             |
| `SqliteConnection`     | `contracts/sqlite.ts:7-22`      | Interface | T02/T03                                                                                |

**Upload:**

| Symbol                                                                  | File                     | P10 Consumer    |
| ----------------------------------------------------------------------- | ------------------------ | --------------- |
| `UploadQueue`                                                           | `upload/queue.ts:84-314` | **T02 primary** |
| `QueueEntry`, `QueueEntryStatus`, `QueueConfig`, `DEFAULT_QUEUE_CONFIG` | `upload/queue.ts`        | T02             |
| `reconcileLocalWithServer`, `getSafeUploads`, `hasConflicts`            | `upload/reconcile.ts`    | T01/T04         |
| `ReconcileResult`, `ReconcileAction`                                    | `upload/reconcile.ts`    | T01/T04         |

**Manifest:**

| Symbol          | File                       | P10 Consumer |
| --------------- | -------------------------- | ------------ |
| `ManifestStore` | `manifest/store.ts:70-264` | T02/T03/T04  |
| `ManifestEntry` | `manifest/store.ts:7-25`   | T02/T03      |

**Recovery:**

| Symbol                                                                                                 | File                       | P10 Consumer    |
| ------------------------------------------------------------------------------------------------------ | -------------------------- | --------------- |
| `RecoveryInbox`                                                                                        | `recovery/inbox.ts:29-232` | **T03 primary** |
| `IncompleteSession`                                                                                    | `recovery/inbox.ts:15-25`  | T03             |
| `RecoveryAction`, `ActionResult`, `createContinueAction`, `createFinalizeAction`, `createDeleteAction` | `recovery/actions.ts`      | T03             |
| `CleanupPolicy`, `CleanupExecutor`, `CleanupDecision`, `SourceState`, `DEFAULT_CLEANUP_CONTEXT`        | `recovery/cleanup.ts`      | T06             |

### 1.2 P09 -- `@kms/mobile-audio` (Stable)

| Symbol                                                                                    | P10 Consumer                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `NativeAudioModule`                                                                       | T01 (event listener), T04 (stop via sendCommand) |
| `NativeCommand`, `NativeEvent`, `ChunkEvent`, `CaptureProfile`, `DEFAULT_CAPTURE_PROFILE` | T01/T04                                          |
| `createFakeAudioModule`, `FakeModuleConfig`                                               | All test use                                     |

### 1.3 Recording Service (P09 Mobile)

| Symbol                                                                         | P10 Consumer                              |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| `RecordingService.getState()`, `.subscribe()`, `.end()`, `.cancel()`           | T04 (end requestor), T03 (recovery state) |
| `RecordingState` (status, meetingId, chunksCommitted, timeline, health, error) | T03, T04, T06                             |
| `recordingReducer`                                                             | T03 (state injection)                     |
| `TimelineEvent`, `HealthMetrics`                                               | T03, T06                                  |

### 1.4 P05 Storage & API

**API Routes** (`apps/api/src/modules/audio/routes.ts`):

- POST `/v1/meetings/:meetingId/audio/chunks/register` → RegisterChunkResponse
- POST `/v1/meetings/:meetingId/audio/chunks/:source/:chunkIndex/complete` → CompleteChunkResponse
- GET `/v1/meetings/:meetingId/audio/manifest` → ManifestResponse

**Storage:** `ObjectStore`, `SignedUrl`, `SignUrlOptions`, `StorageKey`, `deriveStorageKey`, `S3ObjectStore`, `StorageError`

### 1.5 Auth (Mobile)

| Symbol                                    | P10 Consumer           |
| ----------------------------------------- | ---------------------- |
| `ClientAuth.withAccessToken`              | T01 (Bearer injection) |
| `ClientAuth.refresh`                      | T01 (token refresh)    |
| `ClientAuth.getSession`                   | T01 (expiry check)     |
| `AuthStore.getState`, `AuthStore.refresh` | T01, T02               |

### 1.6 Database Repositories

| Symbol                                        | P10 Consumer |
| --------------------------------------------- | ------------ |
| `MeetingsRepository.list` (cursor pagination) | T05          |
| `MeetingsRepository.get`                      | T05          |
| `MeetingsRepository.updateState`              | T04          |
| `AudioRepository.listChunks`                  | T05, T06     |
| `Page<T>`, `PageQuery`, `OwnerContext`        | T05          |

---

## 2. Boundary Diagram

```
 P05 API Server                    P07 local-recovery pkg
──────────────────────          ──────────────────────────────
 POST /register                   ManifestStore (SQLite)
 POST /complete    ◄──REST──     UploadQueue (SQLite)
 GET  /manifest                   RecoveryInbox, CleanupPolicy
 GET  /library  *NEW*            reconcileLocalWithServer
 POST /end      *NEW*            FileSystem, Clock, Checksum
 POST /playback-url *NEW*
──────────────────────          ──────────────────────────────
         │                                    │
         ▼                                    ▼
 ┌──────────────────────────────────────────────────────────────┐
 │              P10 Sync/API Package (T01, T02, T04)            │
 │  SyncTransport ──implements──► UploadTransport               │
 │       │                 (wraps P05 API + Bearer auth)        │
 │       ├──► SyncScheduler ──uses──► UploadQueue               │
 │       └──► EndRequestor ──uses──► RecordingService.end()     │
 └───────────────────────┬──────────────────────────────────────┘
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
 ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
 │Recovery (T03)│ │Library (T05) │ │Player (T06)      │
 │RecoveryInbox │ │MeetingsRepo  │ │FileSystem.stat   │
 │  .discover() │ │  .list()     │ │Checksum.verify   │
 │  .getActions │ │  .get()      │ │ObjectStore.get   │
 │  .executeAct │ │AudioRepo     │ │CleanupPolicy     │
 │UI:actions    │ │CacheLayer    │ │Timeline render   │
 └──────────────┘ └──────────────┘ └──────────────────┘
          └──────────────┼──────────────┘
                         ▼
              ┌──────────────────────┐
              │  Independent QA (T07)│
              │  Android/iOS matrix  │
              │  network/auth/crash  │
              │  two-user security   │
              └──────────────────────┘
```

---

## 3. Gap Analysis & Resolutions

### Critical Gaps (MUST resolve for implementation)

| Gap                                                     | Priority | Resolution                                                         |
| ------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| No API End endpoint                                     | Critical | Add POST `/v1/meetings/:meetingId/end` in T04 scope                |
| No API Library endpoint                                 | Critical | Add GET `/v1/meetings` with cursor pagination in T05 scope         |
| No `endMeeting` in `UploadTransport`                    | High     | Add method to interface in T01 scope                               |
| No mobile platform adapters (FileSystem/Clock/Checksum) | High     | Create expo-* adapters in T01 scope                                |
| No playback URL endpoint                                | High     | Add POST `/v1/meetings/:meetingId/audio/playback-url` in T06 scope |

### Medium Gaps (resolve during implementation)

| Gap                         | Resolution                                                       |
| --------------------------- | ---------------------------------------------------------------- |
| ManifestEntry type mismatch | Document P07 ManifestEntry as authoritative for upload lifecycle |
| No i18n keys                | Define recovery/library/player keys before UI work               |
| No auth-aware HTTP client   | Create `AuthHttpClient` in T01 scope                             |
| No E2E/Maestro setup        | T07 defines test matrix and flows                                |

---

## 4. Risk Matrix

| Risk                             | T01  | T02  | T03 | T04  | T05  | T06  | T07  |
| -------------------------------- | :--: | :--: | :-: | :--: | :--: | :--: | :--: |
| Auth token expires mid-upload    | HIGH | MED  |  -  | HIGH | MED  | MED  | HIGH |
| Network flap (partial upload)    | HIGH | HIGH |  -  | MED  | LOW  | MED  | HIGH |
| App kill after object upload     | HIGH | HIGH | MED | HIGH |  -   |  -   | HIGH |
| Signed URL expiry before upload  | HIGH | MED  |  -  |  -   |  -   |  -   | MED  |
| Checksum conflict                | HIGH | MED  | MED | MED  |  -   | LOW  | HIGH |
| Server unavailable / 5xx         | HIGH | HIGH | LOW | MED  | LOW  | MED  | HIGH |
| Stale cache (library)            |  -   |  -   |  -  |  -   | HIGH |  -   | MED  |
| Local file corrupted / missing   | LOW  | LOW  | MED |  -   |  -   | HIGH | HIGH |
| Playback URL expiry mid-playback |  -   |  -   |  -  |  -   |  -   | HIGH | MED  |
| Cross-user access (security)     |  -   |  -   |  -  |  -   | HIGH | HIGH | HIGH |

---

## 5. Sequencing

Critical path: T01 → {T02, T04, T05} → {T03, T06} → T07

Execution order:

1. **T01** (SyncTransport + adapters + HTTP client): Critical blocker for all downstream work
2. **T01+Gap Fixes** (API End + Library + Playback endpoints + UploadTransport.endMeeting)
3. **T02** (SyncScheduler) + **T04** (EndRequestor) + **T05** (Library) -- parallel after T01
4. **T03** (Recovery UI) -- after T02
5. **T06** (Player) -- after T05
6. **T07** (QA) -- after all
