# API Contracts

**Status:** Draft target contract  
**Owner:** Backend Engineering  
**Last reviewed:** 2026-07-21  
**Base path:** `/v1`

The current API implements only prototype health and minutes generation routes. This is the personal-alpha target.

## 1. Conventions

- JSON UTF-8; Bearer authentication except health.
- Opaque UUID resource IDs; RFC 3339 UTC timestamps; integer milliseconds.
- Retryable mutations require `Idempotency-Key`.
- Responses include `X-Request-Id`; async commands return `202` with a job.
- Cursor pagination uses `limit` and `cursor`.

```json
{
  "error": {
    "code": "MEETING_INVALID_STATE",
    "message": "Meeting cannot be paused from its current state.",
    "requestId": "req_...",
    "details": { "currentState": "finalizing" }
  }
}
```

Production errors never include provider bodies, credentials, transcript text or stack traces.

## 2. Meeting lifecycle

| Method   | Path                       | Purpose                             | Result               |
| -------- | -------------------------- | ----------------------------------- | -------------------- |
| `POST`   | `/meetings`                | Create draft with language and mode | `201 Meeting`        |
| `GET`    | `/meetings`                | Paginated personal library          | `200 MeetingPage`    |
| `GET`    | `/meetings/{id}`           | Meeting and artifact states         | `200 MeetingDetail`  |
| `POST`   | `/meetings/{id}/start`     | Validate capture/session            | `200 MeetingSession` |
| `POST`   | `/meetings/{id}/pause`     | Close capture interval              | `200 Meeting`        |
| `POST`   | `/meetings/{id}/resume`    | Open next interval                  | `200 Meeting`        |
| `POST`   | `/meetings/{id}/end`       | Finalize and enqueue processing     | `202 ProcessingJob`  |
| `DELETE` | `/meetings/{id}`           | Soft delete                         | `204`                |
| `POST`   | `/meetings/{id}/restore`   | Restore in recovery window          | `200 Meeting`        |
| `DELETE` | `/meetings/{id}/permanent` | Enqueue permanent deletion          | `202 DeletionJob`    |

```json
{
  "title": "Weekly leadership meeting",
  "language": "vi",
  "mode": "meeting_translate",
  "timezone": "Asia/Ho_Chi_Minh"
}
```

## 3. Audio and realtime

- `POST /meetings/{id}/audio/chunks/register`: metadata/checksum and scoped upload URL.
- `POST /meetings/{id}/audio/chunks/{chunkId}/complete`: verify object and complete.
- `GET /meetings/{id}/audio/manifest`: expected/received chunks and missing ranges.
- `GET /meetings/{id}/events`: resumable SSE with `Last-Event-ID`.
- Speech transport uses a short-lived session credential bound to meeting/language/source.

An existing chunk ID with a different checksum returns `409 AUDIO_CHUNK_CONFLICT`.

## 4. Transcript and speakers

- `GET /meetings/{id}/transcript?projection=source|current`.
- `POST /transcript-segments/{id}/revisions`.
- `PUT /meetings/{id}/speakers/{speakerId}`.
- `POST /meetings/{id}/speakers/merge`.
- `POST /meetings/{id}/transcript/backfill`.

Revision requests include a base revision ID; stale edits return `409 TRANSCRIPT_REVISION_CONFLICT`.

## 5. Minutes and exports

- `POST /meetings/{id}/minutes`: template, detail, output language, transcript projection and optional provider; returns `202`.
- `GET /minutes/{id}` and `GET /minutes/{id}/versions/{versionId}`.
- `POST /minutes/{id}/versions`: save an edited snapshot with conflict detection.
- `POST /minutes/{id}/rewrite-section`: return proposal/diff without mutation.
- `POST /minutes/{id}/exports`: export pinned to a version/brand preset.
- `GET /exports/{id}`: progress and short-lived download URL.

## 6. Providers and jobs

- `GET /providers`: safe capabilities/configured/health state, never credentials.
- `GET /jobs/{id}`: type, progress, attempts and safe error.
- `POST /jobs/{id}/retry`.
- `POST /jobs/{id}/retry-with-provider`: explicit provider and policy check.

## 7. Authorization and compatibility

- Every resource query is scoped by authenticated owner ID.
- Object URLs are scoped to one object/action and expire quickly.
- Job IDs do not grant access to their meeting.
- Additive v1 response fields are compatible; semantic breaking changes require a new version or coordinated rollout.
- Clients declare their minimum API contract version at startup.

## 8. Versioned transcription policy and runs

`Meeting.transcriptionPolicy` is authoritative:

```json
{
  "version": 1,
  "language": "vi",
  "live": "off",
  "final": "local",
  "cloudCheckScope": "off",
  "cloudConsent": "not_required"
}
```

Legacy `speechMode = api | local` remains readable during migration but cannot infer granted cloud consent.

- `GET /meetings/{id}/transcript-runs` lists owner-scoped immutable run provenance.
- `GET /meetings/{id}/transcript-runs/{runId}` returns parts, exact ranges, locality, engine/provider/model, lifecycle and safe errors.
- `POST /meetings/{id}/transcript-runs` explicitly requests a policy-permitted local final, cloud final or cloud check.
- `POST /meetings/{id}/transcript-comparisons` compares compatible runs from the same audio-manifest lineage.
- `POST /meetings/{id}/transcript-decisions` creates a versioned projection decision using an optimistic base projection.

Every attempt creates an immutable `TranscriptRun`; each deterministic window or full-meeting batch creates immutable `TranscriptRunPart` records. A cloud request is valid only when meeting policy, named-provider disclosure, consent record and approved ranges match. Cloud final batch fallback retains the same provider and approved scope. Local failure never creates cloud work automatically.
