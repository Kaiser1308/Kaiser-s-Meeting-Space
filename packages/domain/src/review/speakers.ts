import { z } from 'zod';
import { MeetingIdSchema } from '../meeting/schemas.js';

const SpeakerMappingOperationSchema = z.enum(['rename', 'merge']);
const SpeakerMappingBaseSchema = z
  .object({
    id: z.string().min(1),
    ownerId: z.string().trim().min(1),
    meetingId: MeetingIdSchema,
    fromSpeakerId: z.string().min(1),
    toSpeakerId: z.string().min(1),
    operation: SpeakerMappingOperationSchema,
    mergeConfirmed: z.boolean().optional(),
    actorId: z.string().min(1),
    baseVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(1).max(256),
    createdAt: z.string().datetime(),
  })
  .strict();

export const SpeakerMappingCommandSchema = SpeakerMappingBaseSchema.superRefine(
  (command, context) => {
    if (command.fromSpeakerId === command.toSpeakerId)
      context.addIssue({ code: 'custom', message: 'speaker mapping is self-cyclic' });
    if (command.operation === 'merge' && command.mergeConfirmed !== true)
      context.addIssue({ code: 'custom', message: 'speaker merge confirmation is required' });
  },
);
export type SpeakerMappingCommand = z.infer<typeof SpeakerMappingCommandSchema>;

const SpeakerLabelSchema = z
  .object({
    speakerId: z.string().min(1),
    providerLabel: z.string().min(1),
    sessionLabel: z.string().min(1),
  })
  .strict();
export type SpeakerLabel = z.infer<typeof SpeakerLabelSchema>;

const MappingSchema = SpeakerMappingBaseSchema.extend({
  version: z.number().int().positive(),
}).strict();
export type SpeakerMapping = z.infer<typeof MappingSchema>;

export interface SpeakerMappingHistory {
  readonly ownerId: string;
  readonly meetingId: string;
  readonly version: number;
  readonly rawLabels: readonly SpeakerLabel[];
  mappings: SpeakerMapping[];
}

export const SpeakerMappingHistorySchema = z
  .object({
    ownerId: z.string().trim().min(1),
    meetingId: MeetingIdSchema,
    version: z.number().int().nonnegative(),
    rawLabels: z.array(SpeakerLabelSchema),
    mappings: z.array(MappingSchema),
  })
  .strict();

export interface SpeakerProjection {
  readonly ownerId: string;
  readonly meetingId: string;
  readonly version: number;
  readonly rawLabels: readonly SpeakerLabel[];
  readonly mappings: readonly SpeakerMapping[];
  resolve(speakerId: string): string;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function replaySpeakerMappings(input: SpeakerMappingHistory): SpeakerProjection {
  const parsed = SpeakerMappingHistorySchema.parse(input);
  const rawLabels = parsed.rawLabels.map((label) => SpeakerLabelSchema.parse(label));
  const known = new Set(rawLabels.map((label) => label.speakerId));
  const mappings = parsed.mappings
    .map((mapping) => MappingSchema.parse(mapping))
    .sort((left, right) => left.version - right.version || left.id.localeCompare(right.id));
  const ids = new Set<string>();
  for (const mapping of mappings) {
    if (ids.has(mapping.id)) throw new Error('duplicate speaker mapping id');
    ids.add(mapping.id);
  }
  for (let index = 0; index < mappings.length; index += 1)
    if (mappings[index]!.version !== index + 1)
      throw new Error('speaker mapping version has a gap');
  if (mappings.length !== parsed.version) throw new Error('speaker mapping version has a gap');
  const bySource = new Map<string, SpeakerMapping>();
  for (const mapping of mappings) {
    if (mapping.ownerId !== parsed.ownerId || mapping.meetingId !== parsed.meetingId)
      throw new Error('speaker mapping crosses owner or meeting');
    if (!known.has(mapping.fromSpeakerId) || !known.has(mapping.toSpeakerId))
      throw new Error('speaker mapping references unknown speaker');
    if (mapping.version > parsed.version || mapping.baseVersion >= mapping.version)
      throw new Error('speaker mapping has invalid base version');
    const existing = bySource.get(mapping.fromSpeakerId);
    if (
      existing &&
      mapping.version === existing.version &&
      mapping.toSpeakerId !== existing.toSpeakerId
    )
      throw new Error('speaker mapping has conflicting version');
    if (!existing || mapping.version > existing.version)
      bySource.set(mapping.fromSpeakerId, mapping);
  }
  const resolve = (speakerId: string): string => {
    if (!known.has(speakerId)) throw new Error('unknown speaker');
    let current = speakerId;
    const seen = new Set<string>();
    while (bySource.has(current)) {
      if (seen.has(current)) throw new Error('speaker mapping cycle');
      seen.add(current);
      current = bySource.get(current)!.toSpeakerId;
    }
    return current;
  };
  for (const speakerId of known) resolve(speakerId);
  return {
    ownerId: parsed.ownerId,
    meetingId: parsed.meetingId,
    version: parsed.version,
    rawLabels: deepFreeze(rawLabels),
    mappings: deepFreeze(mappings),
    resolve,
  };
}

function appendSpeakerMapping(
  history: SpeakerMappingHistory,
  command: SpeakerMappingCommand,
  operation: 'rename' | 'merge',
): SpeakerMappingHistory {
  const current = replaySpeakerMappings(history);
  const parsed = SpeakerMappingCommandSchema.parse({ ...command, operation });
  if (parsed.ownerId !== current.ownerId || parsed.meetingId !== current.meetingId)
    throw new Error('speaker mapping crosses owner or meeting');
  if (parsed.baseVersion !== current.version) throw new Error('speaker mapping version conflict');
  if (!current.resolve(parsed.fromSpeakerId) || !current.resolve(parsed.toSpeakerId))
    throw new Error('unknown speaker');
  return {
    ownerId: current.ownerId,
    meetingId: current.meetingId,
    version: current.version + 1,
    rawLabels: current.rawLabels,
    mappings: [...current.mappings, { ...parsed, version: current.version + 1, operation }],
  };
}

export function renameSpeaker(
  history: SpeakerMappingHistory,
  command: SpeakerMappingCommand,
): SpeakerMappingHistory {
  return appendSpeakerMapping(history, command, 'rename');
}

export function mergeSpeakers(
  history: SpeakerMappingHistory,
  command: SpeakerMappingCommand,
): SpeakerMappingHistory {
  return appendSpeakerMapping(history, command, 'merge');
}
