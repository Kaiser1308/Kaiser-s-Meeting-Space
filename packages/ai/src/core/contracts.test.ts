import { describe, expect, it } from 'vitest';
import { DeterministicGenerativeProvider } from '../adapters/deterministic-mock.js';
import { ProviderSafeError } from './contracts.js';
describe('provider-neutral generative contracts', () => {
  it('returns deterministic unknown output and safe usage metadata', async () => {
    const provider = new DeterministicGenerativeProvider();
    const first = await provider.generate({
      ownerId: 'owner',
      meetingId: 'meeting',
      model: 'mock-v1',
      schemaVersion: '1',
      promptVersion: '1',
      input: { b: 2 },
      maxOutputTokens: 10,
    });
    const second = await provider.generate({
      ownerId: 'owner',
      meetingId: 'meeting',
      model: 'mock-v1',
      schemaVersion: '1',
      promptVersion: '1',
      input: { b: 2 },
      maxOutputTokens: 10,
    });
    expect(first.output).toEqual(second.output);
    expect(first.output).not.toHaveProperty('providerBody');
  });
  it('rejects oversized input with a safe typed error', async () => {
    await expect(
      new DeterministicGenerativeProvider().generate({
        ownerId: 'owner',
        meetingId: 'meeting',
        model: 'mock-v1',
        schemaVersion: '1',
        promptVersion: '1',
        input: 'x'.repeat(1_000_001),
        maxOutputTokens: 10,
      }),
    ).rejects.toBeInstanceOf(ProviderSafeError);
  });
});
