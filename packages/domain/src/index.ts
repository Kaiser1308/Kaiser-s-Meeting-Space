// ── Canonical domain exports ──
// P02: This is the single reviewed public source for all domain types.
// Breaking changes from prototype: see docs/execution/evidence/P02/domain-migration-report.md

export * from './meeting/schemas.js';
export * from './transcription/policy.js';
export * from './audio/schemas.js';
export * from './transcript/schemas.js';
export * from './transcript/runs.js';
export * from './transcript/events.js';
export * from './transcript/capability.js';
export * from './minutes/schemas.js';
export * from './jobs/schemas.js';
export * from './jobs/envelopes.js';
export * from './errors/catalog.js';
export * from './state/machine.js';

// ── Transitional types for prototype consumers ──
// These map old prototype names to canonical equivalents.
// They will be removed once all consumers migrate to canonical names.

import type { MeetingSettings } from './meeting/schemas.js';
import type { MeetingLanguage } from './meeting/schemas.js';
import type { MeetingState } from './state/machine.js';
import type { TranscriptSegment } from './transcript/schemas.js';
import type { MinutesTemplate } from './minutes/schemas.js';
import type { MinutesVersion } from './minutes/schemas.js';

/** @deprecated Use MeetingSettings */
export type Meeting = MeetingSettings;

/** @deprecated Use MeetingLanguage */
export type Language = MeetingLanguage;

/** @deprecated Use MeetingState */
export type MeetingStatus = MeetingState;

/** @deprecated Use MinutesVersion */
export type DetailedMinutes = MinutesVersion;

/** @deprecated Use MeetingSettings with state machine */
export interface GenerateMinutesInput {
  meeting: MeetingSettings;
  transcript: readonly TranscriptSegment[];
  template: MinutesTemplate;
  outputLanguage: MeetingLanguage;
  detailLevel: 'detailed' | 'near_verbatim';
}
