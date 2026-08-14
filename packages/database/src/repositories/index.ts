// ── Repository barrel ──
// T05: exports all repository classes and types.

export { MeetingsRepository } from './meetings.js';
export type { StateUpdate, MeetingListFilter } from './meetings.js';

export { AudioRepository } from './manifests.js';
export type { ChunkRegisterResult, ManifestInput, AudioAssetInput } from './manifests.js';

export { TranscriptRepository } from './transcript.js';

export { TranscriptReviewRepository } from './transcript-review.js';
export { TranscriptSearchRepository } from './transcript-search.js';

export { MinutesRepository } from './minutes.js';
export type { CreateVersionInput } from './minutes.js';

export { FinalizationRepository } from './finalization.js';
export type { FinalizationState, FinalizationRangeRecord, FinalizationRunPart } from './finalization.js';

export { TranslationRepository } from './translation.js';

export { MinutesEditorRepository } from './minutes-editor.js';
export type { MinutesEditorVersionRow } from './minutes-editor.js';

export { JobsMetadataRepository } from './jobs.js';
export type { JobCreateInput, JobListFilter } from './jobs.js';

export { OutboxRepository } from './outbox.js';
export type { OutboxEvent } from './outbox.js';

// Core types
export {
  type OwnerContext,
  type Page,
  type PageQuery,
  type DbErrorCategory,
  DbError,
  FORBIDDEN_AUDIT_KEYS,
  hasForbiddenAuditKey,
  encodeCursor,
  decodeCursor,
} from './types.js';

// Base helpers (useful for custom repositories / tests)
export {
  ownerScope,
  ownerCondition,
  paginate,
  toDomain,
  assertOneRow,
  updateWithVersion,
  mapDbError,
} from './base.js';
