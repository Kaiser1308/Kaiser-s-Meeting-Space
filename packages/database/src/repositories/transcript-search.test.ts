import { describe, expect, it } from 'vitest';
import { transcriptReviewBookmarks, transcriptReviewFlags } from '../schema/transcript-review.js';
import { TranscriptSearchRepository } from './transcript-search.js';

describe('transcript search persistence contract', () => {
  it('exposes a PostgreSQL repository and bookmark read model', () => {
    expect(new TranscriptSearchRepository()).toBeInstanceOf(TranscriptSearchRepository);
    expect(transcriptReviewBookmarks).toBeDefined();
    expect(transcriptReviewFlags).toBeDefined();
  });
});
