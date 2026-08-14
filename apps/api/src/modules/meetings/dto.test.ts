import { describe, it, expect } from 'vitest';
import { CreateMeetingBodySchema, MeetingListQuerySchema } from './dto.js';

const validBody = {
  title: 'Team sync',
  language: 'en',
  mode: 'meeting_only',
  timezone: 'Asia/Ho_Chi_Minh',
  captureSources: ['mic'],
  speechMode: 'local',
  policy: {
    version: 1,
    language: 'en',
    live: 'off',
    final: 'local',
    cloudCheckScope: 'off',
    cloudConsent: 'not_required',
  },
};

describe('CreateMeetingBodySchema', () => {
  it('accepts a valid body', () => {
    expect(CreateMeetingBodySchema.parse(validBody).title).toBe('Team sync');
  });
  it('rejects duplicate capture sources', () => {
    expect(() => CreateMeetingBodySchema.parse({ ...validBody, captureSources: ['mic', 'mic'] })).toThrow();
  });
  it('rejects an empty capture sources list', () => {
    expect(() => CreateMeetingBodySchema.parse({ ...validBody, captureSources: [] })).toThrow();
  });
});

describe('MeetingListQuerySchema', () => {
  it('coerces and defaults the limit', () => {
    expect(MeetingListQuerySchema.parse({}).limit).toBe(20);
    expect(MeetingListQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });
  it('rejects an out-of-range limit', () => {
    expect(() => MeetingListQuerySchema.parse({ limit: 0 })).toThrow();
  });
});
