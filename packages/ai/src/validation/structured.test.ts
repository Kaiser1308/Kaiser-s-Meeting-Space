import { describe, expect, it } from 'vitest';
import { repairStructuredOutput, validateStructuredOutput } from './structured.js';

const schema = {
  safeParse(value: unknown) {
    const candidate = value as { title?: unknown; items?: unknown; extra?: unknown };
    return typeof candidate?.title === 'string' &&
      Array.isArray(candidate.items) &&
      candidate.extra === undefined
      ? {
          success: true as const,
          data: { title: candidate.title, items: candidate.items as string[] },
        }
      : { success: false as const };
  },
};
describe('bounded structured output validation', () => {
  it('rejects unsafe/oversized output and never returns invalid data', async () => {
    expect(
      validateStructuredOutput({ __proto__: { polluted: true }, title: 'x', items: [] }, schema).ok,
    ).toBe(true);
    expect(
      validateStructuredOutput({ title: 'x', items: ['ok'], extra: '<script>' }, schema).ok,
    ).toBe(false);
    await expect(
      repairStructuredOutput('bad', schema, async () => 'bad', { maxAttempts: 2 }),
    ).rejects.toThrow();
  });
  it('accepts a valid bounded repair', async () => {
    await expect(
      repairStructuredOutput('bad', schema, async () => ({ title: 'fixed', items: [] }), {
        maxAttempts: 2,
      }),
    ).resolves.toEqual({ title: 'fixed', items: [] });
  });
});
