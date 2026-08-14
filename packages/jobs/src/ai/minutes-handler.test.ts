import { describe, it, expect } from 'vitest';
import { runMinutesJob, validateMinutesJob, type MinutesJobRequest } from './minutes-handler.js';
import type { MinutesVersion, GenerateMinutesInput } from '@kms/domain';
import type { AiProvider } from '@kms/ai';

const projection = {
  ownerId: 'owner-1',
  meetingId: '00000000-0000-4000-8000-000000000001',
  projectionVersion: 1,
  segments: [{ id: 'seg-1', startMs: 0, endMs: 1000 }],
};

const input = {
  meeting: { id: '00000000-0000-4000-8000-000000000001' },
  transcript: [{ id: 'seg-1', startMs: 0, endMs: 1000, text: 'hello', speakerId: 's1', sequence: 0 }],
  template: 'general',
  outputLanguage: 'en',
  detailLevel: 'detailed',
} as unknown as GenerateMinutesInput;

const minutes: MinutesVersion = {
  id: 'm-1',
  documentId: 'doc-1',
  version: 1,
  template: 'general',
  detailLevel: 'detailed',
  outputLanguage: 'en',
  provider: 'mock',
  model: 'mock',
  transcriptProjection: 'current',
  isComplete: true,
  creatorId: 'system',
  createdAt: new Date().toISOString(),
  sections: [{ id: 's1', heading: 'H', content: 'C', evidence: [{ segmentId: 'seg-1', startMs: 0, endMs: 500 }] }],
  decisions: [],
  openQuestions: [],
  actionItems: [],
};

const provider: AiProvider = {
  id: 'mock',
  model: 'mock',
  async generateDetailedMinutes() { return minutes; },
  async healthcheck() { return { ok: true }; },
};

function makeRequest(): MinutesJobRequest {
  return { ownerId: 'owner-1', meetingId: projection.meetingId, projection, input, idempotencyKey: 'k-1' };
}

describe('validateMinutesJob', () => {
  it('rejects missing owner/meeting/idempotency', () => {
    expect(() => validateMinutesJob({ ...makeRequest(), ownerId: '' })).toThrow(/owner/);
  });
  it('rejects empty projection segments', () => {
    expect(() =>
      validateMinutesJob({ ...makeRequest(), projection: { ...projection, segments: [] } }),
    ).toThrow(/segments/);
  });
});

describe('runMinutesJob', () => {
  it('validates schema and citations, then commits', async () => {
    let committed: MinutesVersion | null = null;
    const result = await runMinutesJob(makeRequest(), provider, {
      commit: async (m) => { committed = m; },
    });
    expect(result.id).toBe('m-1');
    expect(committed?.id).toBe('m-1');
  });

  it('rejects out-of-range citations before commit', async () => {
    const bad: MinutesVersion = {
      ...minutes,
      sections: [{ id: 's1', heading: 'H', content: 'C', evidence: [{ segmentId: 'seg-1', startMs: 0, endMs: 9999 }] }],
    };
    const badProvider: AiProvider = { ...provider, generateDetailedMinutes: async () => bad };
    let committed = false;
    await expect(
      runMinutesJob(makeRequest(), badProvider, { commit: async () => { committed = true; } }),
    ).rejects.toThrow(/citation/);
    expect(committed).toBe(false);
  });
});
