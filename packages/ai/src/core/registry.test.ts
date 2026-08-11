import { describe, expect, it } from 'vitest';
import { ProviderRegistry, selectProvider } from './registry.js';

const capability = (overrides = {}) => ({
  providerId: 'mock',
  model: 'mock-v1',
  healthy: true,
  deprecated: false,
  structuredOutput: true,
  maxContextTokens: 1000,
  maxOutputTokens: 500,
  residency: 'local' as const,
  trainingDisclosure: 'no-training' as const,
  retention: 'none' as const,
  costMicrounitsPer1k: 0,
  ...overrides,
});

describe('provider capability registry', () => {
  it('selects only healthy policy-compatible capabilities', () => {
    const registry = new ProviderRegistry([capability()]);
    expect(
      selectProvider(registry, {
        providerId: 'mock',
        model: 'mock-v1',
        requireStructured: true,
        maxContextTokens: 100,
      }),
    ).toMatchObject({ providerId: 'mock' });
    expect(() =>
      selectProvider(registry, {
        providerId: 'missing',
        model: 'x',
        requireStructured: true,
        maxContextTokens: 1,
      }),
    ).toThrow();
  });
  it('rejects unhealthy, deprecated, oversized, or non-structured choices', () => {
    const registry = new ProviderRegistry([
      capability({ healthy: false }),
      capability({ providerId: 'old', model: 'v1', deprecated: true }),
      capability({ providerId: 'plain', model: 'v1', structuredOutput: false }),
    ]);
    expect(() =>
      selectProvider(registry, {
        providerId: 'mock',
        model: 'mock-v1',
        requireStructured: true,
        maxContextTokens: 100,
      }),
    ).toThrow();
    expect(() =>
      selectProvider(registry, {
        providerId: 'plain',
        model: 'v1',
        requireStructured: true,
        maxContextTokens: 1,
      }),
    ).toThrow();
  });
});
