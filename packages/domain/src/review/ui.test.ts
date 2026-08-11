import { describe, expect, it } from 'vitest';
import {
  appendReviewItems,
  createReviewListState,
  navigateReviewSearch,
  setReviewScrollState,
  type ReviewListItem,
} from './ui.js';

const row = (id: string, text = id): ReviewListItem => ({
  id,
  sourceText: text,
  currentText: text,
  revisedText: null,
  translationText: null,
  isGap: false,
  disagreement: false,
  bookmarked: false,
});

describe('transcript review list model', () => {
  it('uses stable segment keys and preserves gaps/disagreements', () => {
    const state = createReviewListState([row('segment-1'), row('segment-2')]);
    expect(state.rows.map((item) => item.key)).toEqual(['segment-1', 'segment-2']);
    expect(state.rows[0]?.key).not.toBe('0');
  });

  it('disables follow-live after manual scroll and navigates search accessibly', () => {
    const initial = createReviewListState([row('one'), row('two', 'Xin chào')]);
    const scrolled = setReviewScrollState(initial, false);
    const appended = appendReviewItems(scrolled, [row('three')]);
    expect(appended.activeId).toBe('one');
    const found = navigateReviewSearch(appended, 'CHÀO');
    expect(found.activeId).toBe('two');
    expect(found.announce).toContain('two');
  });
});
