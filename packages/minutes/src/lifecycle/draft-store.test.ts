import { describe, expect, it } from 'vitest';
import { DraftStore, DraftStoreError } from './draft-store.js';

const provenance = {
  meetingId: 'meeting-a',
  projectionVersion: 4,
  completenessVersion: 2,
  templateId: 'team',
  detailLevel: 'detailed' as const,
  outputLanguage: 'vi' as const,
  provider: 'deterministic',
  model: 'synthetic-v1',
  promptVersion: 'prompt:1',
  schemaVersion: 'schema:1',
  configVersion: 'config:1',
  inputHash: 'a'.repeat(64),
  usage: { inputTokens: 10, outputTokens: 5, costMicrounits: 2 },
};

describe('immutable minutes draft lifecycle', () => {
  it('deduplicates generation requests by owner and idempotency key', () => {
    const store = new DraftStore();
    const first = store.request({ ownerId: 'owner-a', idempotencyKey: 'same', ...provenance });
    const second = store.request({ ownerId: 'owner-a', idempotencyKey: 'same', ...provenance });
    expect(second).toEqual(first);
    expect(store.listJobs('owner-a')).toHaveLength(1);
  });

  it('keeps versions immutable and rejects stale or cross-owner commits', () => {
    const store = new DraftStore();
    const job = store.request({ ownerId: 'owner-a', idempotencyKey: 'one', ...provenance });
    const version = store.commit({
      ...job,
      ownerId: 'owner-a',
      versionId: 'version-1',
      content: { text: 'synthetic' },
    });
    expect(store.current('owner-a', 'meeting-a')).toEqual(version);
    expect(() =>
      store.commit({
        ...job,
        ownerId: 'owner-a',
        versionId: 'version-2',
        projectionVersion: 3,
        content: { text: 'stale' },
      }),
    ).toThrowError(new DraftStoreError('stale_projection'));
    expect(() => store.current('owner-b', 'meeting-a')).toThrowError(
      new DraftStoreError('not_found'),
    );
    expect(() => store.replace('owner-a', version.id, { text: 'mutated' })).toThrowError(
      new DraftStoreError('immutable'),
    );
  });

  it('uses compare-and-set for current version selection', () => {
    const store = new DraftStore();
    const job = store.request({ ownerId: 'owner-a', idempotencyKey: 'one', ...provenance });
    const version = store.commit({
      ...job,
      ownerId: 'owner-a',
      versionId: 'version-1',
      content: { text: 'synthetic' },
    });
    expect(() => store.selectCurrent('owner-a', version.id, 99)).toThrowError(
      new DraftStoreError('version_conflict'),
    );
    expect(store.selectCurrent('owner-a', version.id, 1)).toEqual(version);
  });
});
