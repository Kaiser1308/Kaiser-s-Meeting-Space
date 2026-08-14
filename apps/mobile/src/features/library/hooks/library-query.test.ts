import { describe, it, expect } from 'vitest';
import { applyLibraryQuery, mergeLibraryPages, type LibraryMeeting } from './library-query.js';

const meetings: LibraryMeeting[] = [
  { id: 'm1', title: 'Kickoff', language: 'en', createdAt: '2026-08-01T00:00:00.000Z' },
  { id: 'm2', title: 'Sync', language: 'vi', createdAt: '2026-08-02T00:00:00.000Z' },
  { id: 'm3', title: 'Kickoff vi', language: 'vi', createdAt: '2026-08-03T00:00:00.000Z' },
];

describe('applyLibraryQuery', () => {
  it('filters by title and language, newest first', () => {
    const result = applyLibraryQuery(meetings, { title: 'kickoff', language: 'vi' });
    expect(result.map((m) => m.id)).toEqual(['m3']);
  });
  it('orders newest first without filters', () => {
    expect(applyLibraryQuery(meetings, {}).map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
  });
});

describe('mergeLibraryPages', () => {
  it('dedupes by id and preserves first-seen order', () => {
    const merged = mergeLibraryPages([
      [{ id: 'a', v: 1 }, { id: 'b', v: 1 }],
      [{ id: 'b', v: 2 }, { id: 'c', v: 1 }],
    ]);
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(merged.find((x) => x.id === 'b')).toMatchObject({ v: 2 });
  });
});
