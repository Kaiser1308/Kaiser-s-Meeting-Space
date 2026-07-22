import { z } from 'zod';

// ── Primitives ──

export const IdempotencyKeySchema = z.string().min(1);
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

export const CorrelationIdSchema = z.string().min(1);
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;

export const CausationIdSchema = z.string().min(1);
export type CausationId = z.infer<typeof CausationIdSchema>;

export const EnvelopeVersionSchema = z.literal('1');
export type EnvelopeVersion = z.infer<typeof EnvelopeVersionSchema>;

// ── Entity types ──

export const EntityTypeSchema = z.enum([
  'meeting',
  'audio_chunk',
  'transcript_segment',
  'transcript_revision',
  'translation_segment',
  'speaker',
  'minutes_document',
  'minutes_version',
  'export_job',
  'processing_job',
]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

// ── Command envelope V1 ──

export const CommandEnvelopeV1Schema = z
  .object({
    envelopeVersion: EnvelopeVersionSchema,
    messageId: z.string().min(1),
    correlationId: CorrelationIdSchema,
    causationId: CausationIdSchema.nullable(),
    ownerId: z.string().min(1),
    entityType: EntityTypeSchema,
    entityId: z.string().min(1),
    commandType: z.string().min(1),
    commandVersion: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema,
    actorId: z.string().min(1),
    timestamp: z.string().datetime(),
    payload: z.record(z.unknown()),
  })
  .strict();
export type CommandEnvelopeV1 = z.infer<typeof CommandEnvelopeV1Schema>;

// ── Domain event envelope V1 ──

export const DomainEventEnvelopeV1Schema = z
  .object({
    envelopeVersion: EnvelopeVersionSchema,
    messageId: z.string().min(1),
    correlationId: CorrelationIdSchema,
    causationId: CausationIdSchema,
    ownerId: z.string().min(1),
    entityType: EntityTypeSchema,
    entityId: z.string().min(1),
    eventType: z.string().min(1),
    eventVersion: z.number().int().positive(),
    actorId: z.string().min(1),
    timestamp: z.string().datetime(),
    data: z.record(z.unknown()),
  })
  .strict();
export type DomainEventEnvelopeV1 = z.infer<typeof DomainEventEnvelopeV1Schema>;

// ── Envelope union ──

export const EnvelopeSchema = z.union([CommandEnvelopeV1Schema, DomainEventEnvelopeV1Schema]);
export type Envelope = z.infer<typeof EnvelopeSchema>;

// ── Type guards ──

export function isCommandEnvelope(env: Envelope): env is CommandEnvelopeV1 {
  return 'commandType' in env && 'idempotencyKey' in env;
}

export function isEventEnvelope(env: Envelope): env is DomainEventEnvelopeV1 {
  return 'eventType' in env;
}

// ── Serialization ──

export function serializeEnvelope(env: Envelope): string {
  return JSON.stringify(env);
}

export function parseEnvelope(json: string): Envelope {
  const raw = JSON.parse(json);

  if (!raw.envelopeVersion || raw.envelopeVersion !== '1') {
    throw new Error(`Unsupported envelope version: ${raw.envelopeVersion}`);
  }

  const result = EnvelopeSchema.parse(raw);
  return result;
}
