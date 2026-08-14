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

  it('validates custom definitions at runtime, including duplicates and artifact refs', () => {
    const template = new TemplateRegistry().list()[0];
    expect(() => new TemplateRegistry([...new TemplateRegistry().list(), { ...template }])).toThrow(
      /duplicate template id/i,
    );
    expect(() => new TemplateRegistry([{ ...template, version: undefined } as never])).toThrow(
      /version/i,
    );
    expect(
      () => new TemplateRegistry([{ ...template, promptRef: 'prompt:minutes-team' } as never]),
    ).toThrow(/artifact ref/i);
  });

  it('exposes required and optional sections and compatibility metadata for every template', () => {
    for (const template of new TemplateRegistry().list()) {
      expect(template.requiredSections.length).toBeGreaterThan(0);
      expect(template.requiredSections).toEqual(expect.arrayContaining(['context', 'discussion']));
      expect(
        template.requiredSections.every((section) => template.sections.includes(section)),
      ).toBe(true);
      expect(template.optionalSections).toBeDefined();
      expect(template.fields.length).toBeGreaterThan(0);
      expect(template.evidenceRules.requireCitations).toBe(true);
      expect(template.confirmationRules.unknownValues).toContain('needs_confirmation');
      expect(template.compatibility.schemaVersion).toBe(template.schemaRef);
    }
  });

  it('rejects invalid sections and detail levels at runtime', () => {
    const template = new TemplateRegistry().list()[0]!;
    expect(
      () =>
        new TemplateRegistry([
          { ...template, sections: ['context'], requiredSections: ['context', 'discussion'] },
        ]),
    ).toThrow(/section/i);
    expect(
      () =>
        new TemplateRegistry([{ ...template, sections: [...template.sections, 'unsupported'] }]),
    ).toThrow(/section/i);
    expect(
      () => new TemplateRegistry([{ ...template, detailLevels: ['summary'] } as never]),
    ).toThrow(/detail/i);
  });

  it('rejects duplicate artifact references and unresolved references', () => {
    const definitions = new TemplateRegistry().list();
    expect(
      () =>
        new TemplateRegistry([
          definitions[0]!,
          { ...definitions[1]!, promptRef: definitions[0]!.promptRef },
          ...definitions.slice(2),
        ]),
    ).toThrow(/reference|duplicate/i);

    const knownReferences = new Set(
      definitions.flatMap((definition) => [
        definition.promptRef,
        definition.schemaRef,
        definition.rubricRef,
      ]),
    );
    expect(
      () =>
        new TemplateRegistry({
          definitions: [
            { ...definitions[0]!, promptRef: 'prompt:minutes-team:99' },
            ...definitions.slice(1),
          ],
          references: knownReferences,
        }),
    ).toThrow(/reference/i);
  });

  it('requires the complete five-template registry and keeps definitions immutable', () => {
    const definitions = new TemplateRegistry().list();
    expect(() => new TemplateRegistry([definitions[0]!])).toThrow(/five|registry/i);
    const template = definitions[0]!;
    expect(() => (template.sections as string[]).push('context')).toThrow();
  });
});
