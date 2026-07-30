import { describe, it, expect } from 'vitest';
import { buildStartMeetingCommand } from './command.js';
import type { MeetingSettings } from '@kms/domain';

describe('buildStartMeetingCommand', () => {
  const baseSettings = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    ownerId: 'u1',
    timezone: 'UTC',
    version: 1,
    createdAt: new Date().toISOString(),
    title: 'Hello',
    language: 'vi' as const,
    mode: 'meeting_only' as const,
    captureSources: ['mic' as const],
    speechMode: 'local' as const, // Legacy field
  } as MeetingSettings;

  const basePolicy = {
    version: 1 as const,
    language: 'vi' as const,
    live: 'off' as const,
    final: 'local' as const,
    cloudCheckScope: 'off' as const,
    cloudConsent: 'not_required' as const,
  };

  it('builds a valid command for meeting_only', () => {
    const cmd = buildStartMeetingCommand({
      settings: baseSettings,
      policy: basePolicy,
      idempotencyKey: 'key123',
    });

    expect(cmd.idempotencyKey).toBe('key123');
    expect(cmd.translationTarget).toBeUndefined();
    expect(cmd.settings).toEqual(baseSettings);
  });

  it('builds a valid command for meeting_translate', () => {
    const cmd = buildStartMeetingCommand({
      settings: { ...baseSettings, mode: 'meeting_translate' },
      policy: basePolicy,
      idempotencyKey: 'key123',
    });

    expect(cmd.translationTarget).toBeDefined(); // vi -> en
  });

  it('throws if language mismatch', () => {
    expect(() => {
      buildStartMeetingCommand({
        settings: baseSettings,
        policy: { ...basePolicy, language: 'en' },
        idempotencyKey: 'key123',
      });
    }).toThrow(/must agree/);
  });
});
