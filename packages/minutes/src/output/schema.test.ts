import { describe, expect, it } from 'vitest';
import { toMinutesDocumentV1, validateDetailedMinutesDraft } from './schema.js';
const base = {
  version: 1 as const,
  id: 'd',
  meetingId: 'm',
  ownerId: 'o',
  projectionVersion: 1,
  completenessVersion: 1,
  templateId: 'team',
  templateVersion: 1,
  detailLevel: 'detailed' as const,
  outputLanguage: 'vi' as const,
  context: 'synthetic',
  provider: 'mock',
  model: 'mock-model',
  promptVersion: 'prompt:minutes-team:1',
  schemaVersion: 'schema:detailed-minutes:1',
  configVersion: 'config:minutes:1',
  inputHash: 'a'.repeat(64),
  usage: { inputTokens: 10, outputTokens: 20, costMicrounits: 30 },
  evaluation: {
    status: 'passed' as const,
    citationCoverage: 1,
    unsupportedClaimCount: 0,
    confirmationCount: 0,
    claimCount: 0,
  },
  discussion: [],
  viewpoints: [],
  proposals: [],
  agreements: [],
  unresolvedItems: [],
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
            status: 'supported',
            owner: 'owner',
            dueDate: '2026-08-12',
          },
        ],
      }).ok,
    ).toBe(false);
    expect(validateDetailedMinutesDraft({ ...base, risks: undefined }).ok).toBe(false);
  });

  it('requires complete provenance, strict citations, and unique claim IDs', () => {
    expect(validateDetailedMinutesDraft({ ...base, provider: undefined }).ok).toBe(false);
    expect(
      validateDetailedMinutesDraft({
        ...base,
        discussion: [
          {
            id: 'same',
            text: 'supported',
            citations: [{ segmentId: 's', startMs: 0, endMs: 1, extra: true }],
            needsConfirmation: false,
            status: 'supported',
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      validateDetailedMinutesDraft({
        ...base,
        discussion: [
          {
            id: 'same',
            text: 'supported',
            citations: [{ segmentId: 's', startMs: 0, endMs: 1 }],
            needsConfirmation: false,
            status: 'supported',
          },
        ],
        risks: [
          {
            id: 'same',
            text: 'duplicate',
            citations: [{ segmentId: 's', startMs: 1, endMs: 2 }],
            needsConfirmation: false,
            status: 'supported',
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it('requires explicit unknown and confirmation semantics instead of invented action facts', () => {
    const action = {
      id: 'action-1',
      text: 'Follow up',
      citations: [{ segmentId: 's', startMs: 0, endMs: 1 }],
      needsConfirmation: true,
      status: 'unknown' as const,
      owner: null,
      dueDate: null,
      unknownFields: ['owner', 'dueDate'] as const,
    };
    expect(validateDetailedMinutesDraft({ ...base, actions: [action] }).ok).toBe(true);
    expect(
      validateDetailedMinutesDraft({
        ...base,
        actions: [{ ...action, owner: 'invented', needsConfirmation: false, status: 'supported' }],
      }).ok,
    ).toBe(false);
    expect(
      validateDetailedMinutesDraft({
        ...base,
        actions: [{ ...action, unknownFields: undefined }],
      }).ok,
    ).toBe(false);
  });

  it('rejects invalid ranges, unsafe sizes, and unsupported section content', () => {
    expect(
      validateDetailedMinutesDraft({
        ...base,
        discussion: [
          {
            id: 'x',
            text: 'supported',
            citations: [{ segmentId: 's', startMs: -1, endMs: 1 }],
            needsConfirmation: false,
            status: 'supported',
          },
        ],
      }).ok,
    ).toBe(false);
    expect(validateDetailedMinutesDraft({ ...base, context: 'x'.repeat(100_001) }).ok).toBe(false);
    expect(validateDetailedMinutesDraft({ ...base, unsupported: [] }).ok).toBe(false);
  });

  it('rejects excessive claim counts and deeply nested hostile input', () => {
    const claims = Array.from({ length: 10_001 }, (_, index) => ({
      id: `claim-${index}`,
      text: 'supported',
      citations: [{ segmentId: 's', startMs: 0, endMs: 1 }],
      needsConfirmation: false,
      status: 'supported' as const,
    }));
    expect(validateDetailedMinutesDraft({ ...base, discussion: claims }).ok).toBe(false);

    let nested: Record<string, unknown> = { value: 'synthetic' };
    for (let index = 0; index < 20; index += 1) nested = { nested };
    expect(validateDetailedMinutesDraft({ ...base, evaluation: nested }).ok).toBe(false);
  });

  it('rejects claims without evidence and malformed date/owner semantics', () => {
    const unsupported = {
      id: 'unsupported',
      text: 'material claim',
      citations: [],
      needsConfirmation: false,
      status: 'supported' as const,
    };
    expect(validateDetailedMinutesDraft({ ...base, decisions: [unsupported] }).ok).toBe(false);
    expect(
      validateDetailedMinutesDraft({
        ...base,
        actions: [
          {
            ...unsupported,
            id: 'action-2',
            citations: [{ segmentId: 's', startMs: 0, endMs: 1 }],
            needsConfirmation: true,
            status: 'unknown' as const,
            unknownFields: ['owner'],
            owner: '',
            dueDate: '2026-02-30',
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it('rejects non-positive provenance versions and non-finite usage values', () => {
    expect(validateDetailedMinutesDraft({ ...base, projectionVersion: 0 }).ok).toBe(false);
    expect(validateDetailedMinutesDraft({ ...base, completenessVersion: 0 }).ok).toBe(false);
    expect(
      validateDetailedMinutesDraft({
        ...base,
        usage: { ...base.usage, inputTokens: Number.POSITIVE_INFINITY },
      }).ok,
    ).toBe(false);
  });

  it('converts validated output to an editor-ready immutable document seam', () => {
    const result = validateDetailedMinutesDraft(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const document = toMinutesDocumentV1(result.value);
      expect(document.version).toBe(1);
      expect(document.id).toBe('d');
      expect(document.ownerId).toBe('o');
      expect(document.meetingId).toBe('m');
      expect(document.nodes.length).toBeGreaterThan(0);
      expect(Object.isFrozen(document)).toBe(true);
    }
  });

  it('converts claims into stable editable nodes while preserving citations and confirmation state', () => {
    const result = validateDetailedMinutesDraft({
      ...base,
      discussion: [{
        id: 'claim-1',
        text: 'Discussed launch',
        citations: [{ segmentId: 'segment-1', startMs: 0, endMs: 100 }],
        needsConfirmation: false,
        status: 'supported',
      }],
      actions: [{
        id: 'action-1',
        text: 'Follow up',
        citations: [{ segmentId: 'segment-2', startMs: 100, endMs: 200 }],
        needsConfirmation: true,
        status: 'unknown',
        unknownFields: ['owner', 'dueDate'],
        owner: null,
        dueDate: null,
      }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const document = toMinutesDocumentV1(result.value);
      expect(document.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'paragraph', id: 'claim-1', text: 'Discussed launch' }),
        expect.objectContaining({ type: 'citation', segmentId: 'segment-1', startMs: 0, endMs: 100 }),
        expect.objectContaining({ type: 'confirmation', id: 'action-1:confirmation', needsConfirmation: true }),
      ]));
    }
  });
});
