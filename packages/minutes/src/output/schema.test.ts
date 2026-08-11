import { describe, expect, it } from 'vitest';
import { validateDetailedMinutesDraft } from './schema.js';
const base = {
  version: 1 as const,
  id: 'd',
  meetingId: 'm',
  ownerId: 'o',
  projectionVersion: 1,
  completenessVersion: 1,
  templateId: 'team',
  outputLanguage: 'vi' as const,
  context: 'synthetic',
  discussion: [],
  decisions: [],
  actions: [],
  risks: [],
  followUps: [],
};
describe('detailed minutes schema', () => {
  it('accepts provenance-complete draft', () =>
    expect(validateDetailedMinutesDraft(base).ok).toBe(true));
  it('rejects broken citations and missing sections', () => {
    expect(
      validateDetailedMinutesDraft({
        ...base,
        actions: [
          {
            id: 'a',
            text: 'x',
            citations: [{ segmentId: 's', startMs: 2, endMs: 1 }],
            needsConfirmation: false,
          },
        ],
      }).ok,
    ).toBe(false);
    expect(validateDetailedMinutesDraft({ ...base, risks: undefined }).ok).toBe(false);
  });
});
