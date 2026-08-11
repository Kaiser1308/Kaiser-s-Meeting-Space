import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from './registry.js';
describe('minutes template registry', () => {
  it('enumerates exactly five data-defined templates', () => {
    const registry = new TemplateRegistry();
    expect(registry.list()).toHaveLength(5);
    for (const template of registry.list()) expect(template.version).toBe(1);
  });
  it('rejects unknown templates', () =>
    expect(() => new TemplateRegistry().get('team' as never)).not.toThrow());
});
