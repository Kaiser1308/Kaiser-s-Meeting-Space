import { describe, it, expect } from 'vitest';
import {
  CommandEnvelopeV1Schema,
  DomainEventEnvelopeV1Schema,
  EnvelopeVersionSchema,
  IdempotencyKeySchema,
  CorrelationIdSchema,
  CausationIdSchema,
  EntityTypeSchema,
  isCommandEnvelope,
  isEventEnvelope,
  parseEnvelope,
  serializeEnvelope,
} from './envelopes.js';

const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = '2026-07-22T09:00:00.000Z';

describe('IdempotencyKey', () => {
  it('accepts valid idempotency key', () => {
    expect(IdempotencyKeySchema.parse('idem-abc123')).toBe('idem-abc123');
  });

  it('rejects empty key', () => {
    const result = IdempotencyKeySchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('CorrelationId and CausationId', () => {
  it('accepts valid IDs', () => {
    expect(CorrelationIdSchema.parse(MEETING_ID)).toBe(MEETING_ID);
    expect(CausationIdSchema.parse(MEETING_ID)).toBe(MEETING_ID);
  });
});

describe('EnvelopeVersion', () => {
  it('accepts "1"', () => {
    expect(EnvelopeVersionSchema.parse('1')).toBe('1');
  });

  it('rejects unknown versions', () => {
    const result = EnvelopeVersionSchema.safeParse('2');
    expect(result.success).toBe(false);
  });
});

describe('EntityType', () => {
  it('accepts known entity types', () => {
    expect(EntityTypeSchema.parse('meeting')).toBe('meeting');
    expect(EntityTypeSchema.parse('audio_chunk')).toBe('audio_chunk');
    expect(EntityTypeSchema.parse('transcript_segment')).toBe('transcript_segment');
    expect(EntityTypeSchema.parse('minutes_version')).toBe('minutes_version');
  });
});

describe('CommandEnvelopeV1', () => {
  const validCommand = {
    envelopeVersion: '1' as const,
    messageId: 'msg-001',
    correlationId: MEETING_ID,
    causationId: null,
    ownerId: 'user-1',
    entityType: 'meeting' as const,
    entityId: MEETING_ID,
    commandType: 'Start',
    commandVersion: 1,
    idempotencyKey: 'idem-start-001',
    actorId: 'user-1',
    timestamp: NOW,
    payload: {},
  };

  it('accepts valid command envelope', () => {
    const result = CommandEnvelopeV1Schema.parse(validCommand);
    expect(result.commandType).toBe('Start');
    expect(result.envelopeVersion).toBe('1');
  });

  it('accepts command with causationId', () => {
    const withCausation = {
      ...validCommand,
      causationId: 'evt-001',
    };
    const result = CommandEnvelopeV1Schema.parse(withCausation);
    expect(result.causationId).toBe('evt-001');
  });

  it('rejects unknown envelope version', () => {
    const result = CommandEnvelopeV1Schema.safeParse({
      ...validCommand,
      envelopeVersion: '99',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing idempotencyKey', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { idempotencyKey, ...without } = validCommand;
    const result = CommandEnvelopeV1Schema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = CommandEnvelopeV1Schema.safeParse({
      ...validCommand,
      secretData: 'leak',
    });
    expect(result.success).toBe(false);
  });

  it('payload is preserved as-is (content validation is command-specific)', () => {
    // The envelope itself does not inspect or reject payload content.
    // Content security is enforced at the API layer by command-specific validators.
    const contentPayload = {
      ...validCommand,
      payload: { transcriptText: 'confidential', audioUrl: 'https://...' },
    };
    const result = CommandEnvelopeV1Schema.parse(contentPayload);
    expect(result.payload).toEqual({ transcriptText: 'confidential', audioUrl: 'https://...' });
  });
});

describe('DomainEventEnvelopeV1', () => {
  const validEvent = {
    envelopeVersion: '1' as const,
    messageId: 'evt-001',
    correlationId: MEETING_ID,
    causationId: 'msg-001',
    ownerId: 'user-1',
    entityType: 'meeting' as const,
    entityId: MEETING_ID,
    eventType: 'MeetingStarted',
    eventVersion: 1,
    actorId: 'user-1',
    timestamp: NOW,
    data: { startedAt: NOW },
  };

  it('accepts valid event envelope', () => {
    const result = DomainEventEnvelopeV1Schema.parse(validEvent);
    expect(result.eventType).toBe('MeetingStarted');
  });

  it('rejects unknown version', () => {
    const result = DomainEventEnvelopeV1Schema.safeParse({
      ...validEvent,
      envelopeVersion: '99',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = DomainEventEnvelopeV1Schema.safeParse({
      ...validEvent,
      rawProviderBody: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('Serialization round-trip', () => {
  it('serializes and deserializes command envelope', () => {
    const cmd = CommandEnvelopeV1Schema.parse({
      envelopeVersion: '1',
      messageId: 'msg-001',
      correlationId: MEETING_ID,
      causationId: null,
      ownerId: 'user-1',
      entityType: 'meeting',
      entityId: MEETING_ID,
      commandType: 'Start',
      commandVersion: 1,
      idempotencyKey: 'idem-001',
      actorId: 'user-1',
      timestamp: NOW,
      payload: {},
    });

    const serialized = serializeEnvelope(cmd);
    const parsed = parseEnvelope(serialized);
    expect(parsed).toEqual(cmd);
  });

  it('serializes and deserializes event envelope', () => {
    const evt = {
      envelopeVersion: '1' as const,
      messageId: 'evt-001',
      correlationId: MEETING_ID,
      causationId: 'msg-001',
      ownerId: 'user-1',
      entityType: 'meeting' as const,
      entityId: MEETING_ID,
      eventType: 'MeetingStarted',
      eventVersion: 1,
      actorId: 'user-1',
      timestamp: NOW,
      data: { startedAt: NOW },
    };

    const serialized = serializeEnvelope(evt);
    const parsed = parseEnvelope(serialized);
    expect(parsed).toEqual(evt);
  });

  it('throws on unknown envelope version during parse', () => {
    const unknown = JSON.stringify({ envelopeVersion: '99', messageId: 'x' });
    expect(() => parseEnvelope(unknown)).toThrow();
  });
});

describe('Type guards', () => {
  it('isCommandEnvelope identifies commands', () => {
    const cmd = CommandEnvelopeV1Schema.parse({
      envelopeVersion: '1',
      messageId: 'msg-001',
      correlationId: MEETING_ID,
      causationId: null,
      ownerId: 'user-1',
      entityType: 'meeting',
      entityId: MEETING_ID,
      commandType: 'Start',
      commandVersion: 1,
      idempotencyKey: 'idem-001',
      actorId: 'user-1',
      timestamp: NOW,
      payload: {},
    });
    expect(isCommandEnvelope(cmd)).toBe(true);
    expect(isEventEnvelope(cmd)).toBe(false);
  });

  it('isEventEnvelope identifies events', () => {
    const evt = DomainEventEnvelopeV1Schema.parse({
      envelopeVersion: '1',
      messageId: 'evt-001',
      correlationId: MEETING_ID,
      causationId: 'msg-001',
      ownerId: 'user-1',
      entityType: 'meeting',
      entityId: MEETING_ID,
      eventType: 'MeetingStarted',
      eventVersion: 1,
      actorId: 'user-1',
      timestamp: NOW,
      data: {},
    });
    expect(isEventEnvelope(evt)).toBe(true);
    expect(isCommandEnvelope(evt)).toBe(false);
  });
});

describe('Dedupe equality', () => {
  it('same idempotency key identifies duplicate commands', () => {
    const cmd1 = CommandEnvelopeV1Schema.parse({
      envelopeVersion: '1',
      messageId: 'msg-001',
      correlationId: MEETING_ID,
      causationId: null,
      ownerId: 'user-1',
      entityType: 'meeting',
      entityId: MEETING_ID,
      commandType: 'Start',
      commandVersion: 1,
      idempotencyKey: 'idem-001',
      actorId: 'user-1',
      timestamp: NOW,
      payload: {},
    });
    const cmd2 = CommandEnvelopeV1Schema.parse({
      ...cmd1,
      messageId: 'msg-002', // different message
      idempotencyKey: 'idem-001', // same idempotency key
    });
    expect(cmd1.idempotencyKey).toBe(cmd2.idempotencyKey);
    expect(cmd1.messageId).not.toBe(cmd2.messageId);
  });

  it('same event messageId detects duplicate events', () => {
    const evt1 = DomainEventEnvelopeV1Schema.parse({
      envelopeVersion: '1',
      messageId: 'evt-001',
      correlationId: MEETING_ID,
      causationId: 'msg-001',
      ownerId: 'user-1',
      entityType: 'meeting',
      entityId: MEETING_ID,
      eventType: 'MeetingStarted',
      eventVersion: 1,
      actorId: 'user-1',
      timestamp: NOW,
      data: {},
    });
    const evt2 = DomainEventEnvelopeV1Schema.parse({
      ...evt1,
      messageId: 'evt-001', // same message ID
    });
    expect(evt1.messageId).toBe(evt2.messageId);
  });
});

describe('Clock and unit separation', () => {
  it('timestamp is RFC3339 string, not Date object', () => {
    const evt = DomainEventEnvelopeV1Schema.parse({
      envelopeVersion: '1',
      messageId: 'evt-001',
      correlationId: MEETING_ID,
      causationId: 'msg-001',
      ownerId: 'user-1',
      entityType: 'meeting',
      entityId: MEETING_ID,
      eventType: 'Test',
      eventVersion: 1,
      actorId: 'user-1',
      timestamp: NOW,
      data: {},
    });
    expect(typeof evt.timestamp).toBe('string');
    expect(evt.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('version is integer, not string', () => {
    const cmd = CommandEnvelopeV1Schema.parse({
      envelopeVersion: '1',
      messageId: 'msg-001',
      correlationId: MEETING_ID,
      causationId: null,
      ownerId: 'user-1',
      entityType: 'meeting',
      entityId: MEETING_ID,
      commandType: 'Start',
      commandVersion: 3,
      idempotencyKey: 'idem-001',
      actorId: 'user-1',
      timestamp: NOW,
      payload: {},
    });
    expect(typeof cmd.commandVersion).toBe('number');
    expect(Number.isInteger(cmd.commandVersion)).toBe(true);
  });
});
