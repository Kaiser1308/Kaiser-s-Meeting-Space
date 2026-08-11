import { describe, expect, it } from 'vitest';
import { runAiJob } from './handler.js';
const request = {
  ownerId: 'owner',
  meetingId: 'meeting',
  projectionVersion: 2,
  completenessVersion: 1,
  providerId: 'mock',
  model: 'mock-v1',
  promptVersion: 'p1',
  schemaVersion: 's1',
  idempotencyKey: 'id1',
  budgetMicrounits: 10,
  estimatedCostMicrounits: 2,
  input: { synthetic: true },
};
describe('durable AI job policy boundary', () => {
  it('pins owner/versions/idempotency and never mutates source', async () => {
    const result = await runAiJob(request, {
      generate: async () => ({ output: { ok: true }, usage: { costMicrounits: 2 } }),
    });
    expect(result).toMatchObject({ ownerId: 'owner', projectionVersion: 2, sourceMutated: false });
  });
  it('stops before provider call when budget is exceeded', async () => {
    let called = false;
    await expect(
      runAiJob(
        { ...request, estimatedCostMicrounits: 11 },
        {
          generate: async () => {
            called = true;
            return { output: {}, usage: { costMicrounits: 0 } };
          },
        },
      ),
    ).rejects.toThrow('budget');
    expect(called).toBe(false);
  });
});
