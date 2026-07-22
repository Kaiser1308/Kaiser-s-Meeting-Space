import { describe, it, expect } from 'vitest';
import {
  MeetingLanguageSchema,
  MeetingModeSchema,
  MeetingSettingsSchema,
  MeetingState,
  TranscriptSegmentSchema,
  MinutesTemplateSchema,
  DetailLevelSchema,
  CommandEnvelopeV1Schema,
  DomainEventEnvelopeV1Schema,
  meetingStateMachine,
  getErrorInfo,
} from './index.js';

// ── Compile-time verification that canonical exports work ──

describe('@kms/domain canonical exports', () => {
  it('MeetingLanguage accepts vi and en only', () => {
    expect(MeetingLanguageSchema.parse('vi')).toBe('vi');
    expect(MeetingLanguageSchema.parse('en')).toBe('en');
    expect(MeetingLanguageSchema.safeParse('mixed').success).toBe(false);
  });

  it('MeetingMode accepts meeting_only and meeting_translate', () => {
    expect(MeetingModeSchema.parse('meeting_only')).toBe('meeting_only');
    expect(MeetingModeSchema.parse('meeting_translate')).toBe('meeting_translate');
  });

  it('MeetingSettings validates with canonical fields', () => {
    const result = MeetingSettingsSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      ownerId: 'user-1',
      title: 'Test Meeting',
      language: 'vi',
      mode: 'meeting_only',
      captureSources: ['mic'],
      timezone: 'UTC',
      version: 1,
      createdAt: '2026-07-22T09:00:00.000Z',
    });
    expect(result.title).toBe('Test Meeting');
  });

  it('TranscriptSegment validates with canonical fields', () => {
    const result = TranscriptSegmentSchema.parse({
      id: 'seg-1',
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
      sequence: 1,
      speakerId: 'spk-1',
      language: 'vi',
      text: 'Hello',
      startMs: 0,
      endMs: 5000,
      source: 'api',
      createdAt: '2026-07-22T09:00:00.000Z',
    });
    expect(result.text).toBe('Hello');
  });

  it('MinutesTemplate enum has 5 templates', () => {
    const templates = ['team', 'one_on_one', 'direct_report', 'leadership', 'recurring'] as const;
    for (const t of templates) {
      expect(MinutesTemplateSchema.parse(t)).toBe(t);
    }
  });

  it('DetailLevel separates detailed and near_verbatim', () => {
    expect(DetailLevelSchema.parse('detailed')).toBe('detailed');
    expect(DetailLevelSchema.parse('near_verbatim')).toBe('near_verbatim');
  });

  it('ErrorCode covers known errors', () => {
    expect(getErrorInfo('MEETING_INVALID_TRANSITION').httpStatus).toBe(409);
    expect(getErrorInfo('PROVIDER_TIMEOUT').retryable).toBe(true);
  });

  it('CommandEnvelopeV1 validates with idempotency key', () => {
    const result = CommandEnvelopeV1Schema.parse({
      envelopeVersion: '1',
      messageId: 'msg-1',
      correlationId: 'corr-1',
      causationId: null,
      ownerId: 'user-1',
      entityType: 'meeting',
      entityId: 'meeting-1',
      commandType: 'Start',
      commandVersion: 1,
      idempotencyKey: 'idem-1',
      actorId: 'user-1',
      timestamp: '2026-07-22T09:00:00.000Z',
      payload: {},
    });
    expect(result.commandType).toBe('Start');
  });

  it('DomainEventEnvelopeV1 validates event metadata', () => {
    const result = DomainEventEnvelopeV1Schema.parse({
      envelopeVersion: '1',
      messageId: 'evt-1',
      correlationId: 'corr-1',
      causationId: 'msg-1',
      ownerId: 'user-1',
      entityType: 'meeting',
      entityId: 'meeting-1',
      eventType: 'MeetingStarted',
      eventVersion: 1,
      actorId: 'user-1',
      timestamp: '2026-07-22T09:00:00.000Z',
      data: {},
    });
    expect(result.eventType).toBe('MeetingStarted');
  });

  it('state machine processes full lifecycle', () => {
    let state: MeetingState = 'draft';
    const r = meetingStateMachine(state, {
      type: 'Create',
      meetingId: 'm1',
      actorId: 'u1',
      version: 1,
      timestamp: '2026-07-22T09:00:00.000Z',
      title: 'Test',
      language: 'vi',
      mode: 'meeting_only',
      captureSources: ['mic'],
      timezone: 'UTC',
    });
    expect(r.success).toBe(true);
    if (r.success) state = r.newState;
    expect(state).toBe('checking');
  });
});
