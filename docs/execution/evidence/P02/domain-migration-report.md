# P02 Domain Migration Report

**Generated:** 2026-07-22T10:13:00+07:00
**Phase:** P02 — Canonical runtime domain contracts

## Breaking changes from prototype

| Prototype name                                 | Canonical equivalent                                  | Change                                                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Language = 'vi' \| 'en' \| 'mixed'`           | `MeetingLanguage = 'vi' \| 'en'`                      | Removed `'mixed'` (ADR-004)                                                                                                  |
| `MeetingMode = 'record' \| 'record_translate'` | `MeetingMode = 'meeting_only' \| 'meeting_translate'` | Renamed values                                                                                                               |
| `MeetingStatus` (enum)                         | `MeetingState` (10 states + state machine)            | Full state machine replaces simple enum                                                                                      |
| `Meeting` interface                            | `MeetingSettings` (Zod schema)                        | Added ownerId, captureSources, speechMode, timezone; removed `status` (now managed by state machine)                         |
| `AudioAsset` interface                         | `AudioChunk` (Zod schema)                             | Added monotonic clock, wallClock, uploadStatus; renamed `source: 'microphone'\|'system'` to `'mic'\|'system'\|'derived_mix'` |
| `TranscriptSegment` interface                  | `TranscriptSegment` (Zod schema)                      | Removed `speakerLabel` (now in Speaker schema); added `isGap`, `gapReason`, `provider`, `providerEventId`                    |
| `TranscriptRevision` interface                 | `TranscriptRevision` (Zod schema)                     | Added `baseRevisionId` for revision chain                                                                                    |
| `EvidenceRef` interface                        | `EvidenceRef` (Zod schema)                            | Added optional `quoteHash`                                                                                                   |
| `MinutesTemplate` enum                         | `MinutesTemplate` (same values)                       | No change                                                                                                                    |
| `DetailLevel = 'verbatim' \| 'detailed'`       | `DetailLevel = 'detailed' \| 'near_verbatim'`         | Renamed `'verbatim'` to `'near_verbatim'`                                                                                    |
| `DetailedMinutes` interface                    | `MinutesVersion` (Zod schema)                         | Added documentId, version, transcriptProjection, isComplete, creatorId                                                       |
| `GenerateMinutesInput` interface               | `GenerateMinutesInput` (transitional)                 | `detailLevel` type changed to `'detailed' \| 'near_verbatim'`                                                                |

## New modules created

| Module     | Path                              | Content                                                                                  |
| ---------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| Meeting    | `packages/domain/src/meeting/`    | Language, mode, settings, capture profile, chunk IDs, branded types                      |
| Audio      | `packages/domain/src/audio/`      | Audio chunks, upload status, pause/gap intervals, timeline events, manifest, derived mix |
| Transcript | `packages/domain/src/transcript/` | Segments, revisions, translations, speakers, evidence refs, completeness                 |
| Minutes    | `packages/domain/src/minutes/`    | Templates, detail levels, sections, action items, versions, brand, export                |
| Jobs       | `packages/domain/src/jobs/`       | Job types, states, attempts, progress, command/event envelopes                           |
| Errors     | `packages/domain/src/errors/`     | 25 error codes, categories, safe details, catalog                                        |
| State      | `packages/domain/src/state/`      | 10 states, 14 commands, 27 transitions, pure reducer                                     |

## Consumers updated

| Consumer                                  | Changes                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/test-support/src/index.ts`      | `Meeting` → `MeetingSettings`, `Language` → `MeetingLanguage`, added `isGap`, removed `speakerLabel`                              |
| `packages/test-support/src/index.test.ts` | Updated field names (`record` → `meeting_only`, `primaryLanguage` → `language`)                                                   |
| `packages/ai/src/index.ts`                | `DetailedMinutes` → `MinutesVersion`, added `transcriptProjection` and `isComplete`, `segment.speakerLabel` → `segment.speakerId` |
| `packages/ai/src/index.test.ts`           | Updated to canonical types, added `isGap`                                                                                         |
| `apps/api/src/server.ts`                  | No changes needed (uses `GenerateMinutesInput` transitional type)                                                                 |

## Deprecated names search

- `'mixed'` — found only in rejection tests (correct)
- `'record'` / `'record_translate'` — found only in rejection tests (correct)
- `speakerLabel` — removed from all production code
- `primaryLanguage` — remains as test-support fixture parameter name (not a domain type)

## Verification

- Format: PASS
- Lint: PASS (0 errors, 0 warnings)
- Typecheck: PASS (7 packages)
- Test:unit: 274 tests PASS (domain: 228, config: 14, ai: 5, test-support: 21, api: 1, desktop: 3, mobile: 2)
- Deprecated-name search: Clean
