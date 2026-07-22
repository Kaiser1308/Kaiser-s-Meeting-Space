import { describe, it, expect } from 'vitest';
import {
  MeetingLanguageSchema,
  MeetingModeSchema,
  AudioSourceSchema,
  SpeechModeSchema,
  MeetingSettingsSchema,
  CaptureProfileSchema,
  MeetingIdSchema,
  ChunkIdSchema,
  Sha256Schema,
  MillisecondsSchema,
  parseChunkId,
  formatChunkId,
  deriveTranslationTarget,
} from './schemas.js';

describe('MeetingLanguage', () => {
  it('accepts "vi"', () => {
    expect(MeetingLanguageSchema.parse('vi')).toBe('vi');
  });

  it('accepts "en"', () => {
    expect(MeetingLanguageSchema.parse('en')).toBe('en');
  });

  it('rejects "mixed"', () => {
    const result = MeetingLanguageSchema.safeParse('mixed');
    expect(result.success).toBe(false);
  });

  it('rejects arbitrary strings', () => {
    const result = MeetingLanguageSchema.safeParse('fr');
    expect(result.success).toBe(false);
  });
});

describe('MeetingMode', () => {
  it('accepts "meeting_only"', () => {
    expect(MeetingModeSchema.parse('meeting_only')).toBe('meeting_only');
  });

  it('accepts "meeting_translate"', () => {
    expect(MeetingModeSchema.parse('meeting_translate')).toBe('meeting_translate');
  });

  it('rejects "record" (deprecated prototype name)', () => {
    const result = MeetingModeSchema.safeParse('record');
    expect(result.success).toBe(false);
  });

  it('rejects "record_translate" (deprecated prototype name)', () => {
    const result = MeetingModeSchema.safeParse('record_translate');
    expect(result.success).toBe(false);
  });
});

describe('AudioSource', () => {
  it('accepts mic, system, derived_mix', () => {
    expect(AudioSourceSchema.parse('mic')).toBe('mic');
    expect(AudioSourceSchema.parse('system')).toBe('system');
    expect(AudioSourceSchema.parse('derived_mix')).toBe('derived_mix');
  });

  it('rejects unknown sources', () => {
    const result = AudioSourceSchema.safeParse('bluetooth');
    expect(result.success).toBe(false);
  });
});

describe('SpeechMode', () => {
  it('accepts "api" and "local"', () => {
    expect(SpeechModeSchema.parse('api')).toBe('api');
    expect(SpeechModeSchema.parse('local')).toBe('local');
  });

  it('defaults to "api"', () => {
    expect(SpeechModeSchema.parse(undefined)).toBe('api');
  });
});

describe('MeetingId', () => {
  it('accepts valid UUIDs', () => {
    expect(MeetingIdSchema.parse('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('rejects non-UUID strings', () => {
    const result = MeetingIdSchema.safeParse('not-a-uuid');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = MeetingIdSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('Sha256', () => {
  it('accepts valid 64-char hex string', () => {
    const hash = 'a'.repeat(64);
    expect(Sha256Schema.parse(hash)).toBe(hash);
  });

  it('rejects wrong length', () => {
    const result = Sha256Schema.safeParse('abc123');
    expect(result.success).toBe(false);
  });

  it('rejects non-hex characters', () => {
    const result = Sha256Schema.safeParse('z'.repeat(64));
    expect(result.success).toBe(false);
  });
});

describe('Milliseconds', () => {
  it('accepts positive integers', () => {
    expect(MillisecondsSchema.parse(5000)).toBe(5000);
  });

  it('rejects negative values', () => {
    const result = MillisecondsSchema.safeParse(-1);
    expect(result.success).toBe(false);
  });

  it('rejects zero', () => {
    const result = MillisecondsSchema.safeParse(0);
    expect(result.success).toBe(false);
  });

  it('rejects non-integers', () => {
    const result = MillisecondsSchema.safeParse(5.5);
    expect(result.success).toBe(false);
  });
});

describe('ChunkId parsing and formatting', () => {
  it('parses valid chunk ID', () => {
    const parsed = parseChunkId('550e8400-e29b-41d4-a716-446655440000/mic/0');
    expect(parsed).toEqual({
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
      source: 'mic',
      chunkIndex: 0,
    });
  });

  it('parses system source with higher index', () => {
    const parsed = parseChunkId('550e8400-e29b-41d4-a716-446655440000/system/42');
    expect(parsed).toEqual({
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
      source: 'system',
      chunkIndex: 42,
    });
  });

  it('round-trips through format and parse', () => {
    const id = formatChunkId('550e8400-e29b-41d4-a716-446655440000', 'mic', 5);
    const parsed = parseChunkId(id);
    expect(parsed.meetingId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(parsed.source).toBe('mic');
    expect(parsed.chunkIndex).toBe(5);
  });

  it('rejects invalid chunk ID format', () => {
    expect(() => parseChunkId('invalid')).toThrow();
  });

  it('rejects unknown source in chunk ID', () => {
    expect(() => parseChunkId('550e8400-e29b-41d4-a716-446655440000/bluetooth/0')).toThrow();
  });

  it('rejects non-numeric chunkIndex', () => {
    expect(() => parseChunkId('550e8400-e29b-41d4-a716-446655440000/mic/abc')).toThrow();
  });

  it('rejects non-UUID meetingId in chunk ID', () => {
    expect(() => parseChunkId('not-a-uuid/mic/0')).toThrow();
  });

  it('ChunkIdSchema validates formatted chunk IDs', () => {
    const id = formatChunkId('550e8400-e29b-41d4-a716-446655440000', 'mic', 0);
    expect(ChunkIdSchema.parse(id)).toBe(id);
  });
});

describe('MeetingSettings', () => {
  const validSettings = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    ownerId: 'owner-123',
    title: 'Weekly Standup',
    language: 'vi' as const,
    mode: 'meeting_only' as const,
    captureSources: ['mic'] as const,
    speechMode: 'api' as const,
    timezone: 'Asia/Ho_Chi_Minh',
    version: 1,
    createdAt: '2026-07-22T09:00:00.000Z',
  };

  it('accepts valid minimal settings', () => {
    const result = MeetingSettingsSchema.parse(validSettings);
    expect(result.title).toBe('Weekly Standup');
    expect(result.language).toBe('vi');
  });

  it('accepts full settings with startedAt and endedAt', () => {
    const full = {
      ...validSettings,
      startedAt: '2026-07-22T09:00:00.000Z',
      endedAt: '2026-07-22T10:00:00.000Z',
    };
    const result = MeetingSettingsSchema.parse(full);
    expect(result.startedAt).toBe('2026-07-22T09:00:00.000Z');
    expect(result.endedAt).toBe('2026-07-22T10:00:00.000Z');
  });

  it('rejects empty title', () => {
    const result = MeetingSettingsSchema.safeParse({ ...validSettings, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects title over 500 characters', () => {
    const result = MeetingSettingsSchema.safeParse({ ...validSettings, title: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('rejects empty captureSources', () => {
    const result = MeetingSettingsSchema.safeParse({ ...validSettings, captureSources: [] });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate capture sources', () => {
    const result = MeetingSettingsSchema.safeParse({
      ...validSettings,
      captureSources: ['mic', 'mic'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects endedAt before startedAt', () => {
    const result = MeetingSettingsSchema.safeParse({
      ...validSettings,
      startedAt: '2026-07-22T10:00:00.000Z',
      endedAt: '2026-07-22T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects endedAt without startedAt', () => {
    const result = MeetingSettingsSchema.safeParse({
      ...validSettings,
      endedAt: '2026-07-22T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects version <= 0', () => {
    const result = MeetingSettingsSchema.safeParse({ ...validSettings, version: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict mode)', () => {
    const result = MeetingSettingsSchema.safeParse({ ...validSettings, extraField: true });
    expect(result.success).toBe(false);
  });

  it('rejects "mixed" language', () => {
    const result = MeetingSettingsSchema.safeParse({ ...validSettings, language: 'mixed' });
    expect(result.success).toBe(false);
  });
});

describe('CaptureProfile', () => {
  it('accepts valid profile', () => {
    const profile = CaptureProfileSchema.parse({
      container: 'webm',
      codec: 'opus',
      sampleRate: 48000,
      bitDepth: 16,
      channels: 1,
      bitrate: 96000,
      opusFrameDurationMs: 20,
      complexity: 5,
    });
    expect(profile.sampleRate).toBe(48000);
  });

  it('rejects invalid container', () => {
    const result = CaptureProfileSchema.safeParse({
      container: 'mp4',
      codec: 'opus',
      sampleRate: 48000,
      bitDepth: 16,
      channels: 1,
      bitrate: 96000,
      opusFrameDurationMs: 20,
      complexity: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid sample rate', () => {
    const result = CaptureProfileSchema.safeParse({
      container: 'webm',
      codec: 'opus',
      sampleRate: 44100,
      bitDepth: 16,
      channels: 1,
      bitrate: 96000,
      opusFrameDurationMs: 20,
      complexity: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe('deriveTranslationTarget', () => {
  it('returns "en" for "vi"', () => {
    expect(deriveTranslationTarget('vi')).toBe('en');
  });

  it('returns "vi" for "en"', () => {
    expect(deriveTranslationTarget('en')).toBe('vi');
  });
});
