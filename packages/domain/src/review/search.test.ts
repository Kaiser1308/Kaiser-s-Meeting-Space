import { describe, expect, it } from 'vitest';
import {
  searchTranscriptProjection,
  TranscriptSearchQuerySchema,
  type TranscriptSearchItem,
} from './search.js';

const item = (overrides: Partial<TranscriptSearchItem> = {}): TranscriptSearchItem => ({
  id: 'segment-1',
  ownerId: 'owner-1',
  meetingId: '00000000-0000-4000-8000-000000000001' as TranscriptSearchItem['meetingId'],
  sequence: 1,
  sourceText: 'Xin chào thế giới',
  currentText: 'Xin chào thế giới',
  revisedText: null,
  translationText: 'Hello world',
  speakerId: 'speaker-1',
  startMs: 1000,
  endMs: 2000,
  confidence: 0.9,
  isGap: false,
  locality: 'local',
  disagreement: false,
  bookmarked: false,
  ...overrides,
});

describe('transcript projection search', () => {
  it('matches Unicode text and preserves owner isolation', () => {
    const result = searchTranscriptProjection({
      items: [item(), item({ id: 'foreign', ownerId: 'owner-2', sourceText: 'Xin chào' })],
      query: { ownerId: 'owner-1', text: 'THẾ GIỚI', limit: 20 },
    });
    expect(result.items.map((entry) => entry.id)).toEqual(['segment-1']);
  });

  it('filters flags and uses stable cursor ordering', () => {
    const items = [
      item({ id: 'segment-2', startMs: 2000, disagreement: true, bookmarked: true }),
      item({ id: 'segment-1', startMs: 1000 }),
    ];
    const first = searchTranscriptProjection({
      items,
      query: { ownerId: 'owner-1', disagreement: true, limit: 1 },
    });
    expect(first.items[0]?.id).toBe('segment-2');
    expect(first.nextCursor).toBeNull();
    const page = searchTranscriptProjection({ items, query: { ownerId: 'owner-1', limit: 1 } });
    expect(page.items[0]?.id).toBe('segment-1');
    expect(page.nextCursor).toBeTruthy();
    expect(
      searchTranscriptProjection({
        items,
        query: { ownerId: 'owner-1', cursor: page.nextCursor!, limit: 1 },
      }).items[0]?.id,
    ).toBe('segment-2');
  });

  it('validates locality/revision filters and rejects malformed cursors', () => {
    expect(
      TranscriptSearchQuerySchema.parse({ ownerId: 'owner-1', locality: 'local', revised: true }),
    ).toMatchObject({ locality: 'local', revised: true, limit: 50 });
    expect(() => TranscriptSearchQuerySchema.parse({ ownerId: 'owner-1', cursor: '1:' })).toThrow();
  });
});
