import { describe, expect, it } from 'vitest';
import { ArtifactRegistry } from './artifacts.js';
describe('immutable AI artifact registry', () => {
  it('resolves active and historical versions', () => {
    const registry = new ArtifactRegistry();
    registry.register({
      kind: 'prompt',
      name: 'minutes',
      version: '1.0.0',
      hash: 'a',
      body: { text: 'synthetic' },
    });
    registry.register({
      kind: 'prompt',
      name: 'minutes',
      version: '2.0.0',
      hash: 'b',
      body: { text: 'synthetic-v2' },
    });
    registry.activate('prompt', 'minutes', '2.0.0');
    expect(registry.resolve('prompt', 'minutes').version).toBe('2.0.0');
    expect(registry.resolve('prompt', 'minutes', '1.0.0').hash).toBe('a');
  });
  it('rejects mutation under an existing version and unknown activation', () => {
    const registry = new ArtifactRegistry();
    registry.register({ kind: 'schema', name: 'minutes', version: '1', hash: 'a', body: {} });
    expect(() =>
      registry.register({ kind: 'schema', name: 'minutes', version: '1', hash: 'b', body: {} }),
    ).toThrow();
    expect(() => registry.activate('schema', 'minutes', '2')).toThrow();
  });
});
