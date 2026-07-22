import { describe, it, expect } from 'vitest';
import { createAiProvider, MockAiProvider } from './index.js';
import type { GenerateMinutesInput } from '@kms/domain';

const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000' as import('@kms/domain').MeetingId;

const baseInput: GenerateMinutesInput = {
  meeting: {
    id: MEETING_ID,
    ownerId: 'user-1',
    title: 'Test',
    language: 'vi',
    mode: 'meeting_only',
    captureSources: ['mic'],
    speechMode: 'api',
    timezone: 'UTC',
    version: 1,
    createdAt: new Date().toISOString(),
  },
  transcript: [
    {
      id: 's1',
      meetingId: MEETING_ID,
      sequence: 1,
      speakerId: 'sp1',
      language: 'vi' as const,
      text: 'Xin chào',
      startMs: 0,
      endMs: 1000,
      source: 'api' as const,
      isGap: false,
      createdAt: new Date().toISOString(),
    },
  ],
  template: 'team' as const,
  outputLanguage: 'vi' as const,
  detailLevel: 'detailed' as const,
};

describe('createAiProvider', () => {
  it('creates mock provider with default config', () => {
    const provider = createAiProvider({ provider: 'mock' });
    expect(provider.id).toBe('mock');
    expect(provider.model).toBe('deterministic-development');
  });

  it('throws for openai-compatible without credentials', () => {
    expect(() => createAiProvider({ provider: 'openai-compatible' })).toThrow('AI_API_KEY');
  });
});

describe('MockAiProvider', () => {
  it('returns healthy', async () => {
    const provider = new MockAiProvider();
    const result = await provider.healthcheck();
    expect(result.ok).toBe(true);
  });

  it('generates minutes with sections per transcript segment', async () => {
    const provider = new MockAiProvider();
    const result = await provider.generateDetailedMinutes(baseInput);
    expect(result.provider).toBe('mock');
    expect(result.template).toBe('team');
    expect(result.outputLanguage).toBe('vi');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.content).toBe('Xin chào');
    expect(result.sections[0]?.evidence).toHaveLength(1);
  });

  it('includes evidence references with correct segment IDs', async () => {
    const provider = new MockAiProvider();
    const result = await provider.generateDetailedMinutes(baseInput);
    for (const section of result.sections) {
      for (const ref of section.evidence) {
        expect(ref.segmentId).toBeTruthy();
        expect(ref.startMs).toBeGreaterThanOrEqual(0);
        expect(ref.endMs).toBeGreaterThan(ref.startMs);
      }
    }
  });
});
