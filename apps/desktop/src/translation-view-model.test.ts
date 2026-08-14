import { describe, it, expect } from 'vitest';
import { mapTranslationProjections, isProvisionalAuthoritative } from './translation-view-model.js';

describe('mapTranslationProjections', () => {
  it('separates final and provisional, and marks source accessible', () => {
    const state = mapTranslationProjections('hello', [], []);
    expect(state.final).toEqual([]);
    expect(state.provisional).toEqual([]);
    expect(state.sourceAccessible).toBe(true);
  });

  it('marks source inaccessible when null/empty', () => {
    expect(mapTranslationProjections(null, [], []).sourceAccessible).toBe(false);
    expect(mapTranslationProjections('', [], []).sourceAccessible).toBe(false);
  });
});

describe('isProvisionalAuthoritative', () => {
  it('is always false (realtime is never authoritative)', () => {
    expect(isProvisionalAuthoritative()).toBe(false);
  });
});
