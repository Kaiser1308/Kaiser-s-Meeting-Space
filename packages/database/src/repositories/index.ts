// ── Repository barrel ──
// T05: exports all repository classes and types.

export { MeetingsRepository } from './meetings.js';
export type { StateUpdate, MeetingListFilter } from './meetings.js';

export { AudioRepository } from './manifests.js';
export type { ChunkRegisterResult, ManifestInput, AudioAssetInput } from './manifests.js';

export { TranscriptRepository } from './transcript.js';

export { MinutesRepository } from './minutes.js';
export type { CreateVersionInput } from './minutes.js';

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
