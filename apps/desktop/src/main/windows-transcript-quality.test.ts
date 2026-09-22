import { describe, expect, it } from 'vitest';
import { compareTranscript } from './windows-transcript-quality.js';

const expected = [{ startMs: 0, endMs: 1000, text: 'Alpha approves the action item.' }];

describe('Windows transcript quality comparator', () => {
  it('accepts an exact transcript', () => expect(compareTranscript(expected, expected, { maxWer: 0, minPhraseCoverage: 1 }).pass).toBe(true));
  it('reports missing phrases and empty transcripts', () => {
    const result = compareTranscript([], expected, { maxWer: 0, minPhraseCoverage: 1 });
    expect(result.pass).toBe(false); expect(result.failureCodes).toEqual(expect.arrayContaining(['wer_threshold_failed', 'phrase_coverage_failed', 'empty_transcript']));
  });
  it('rejects duplicate or out-of-bounds segments', () => {
    const result = compareTranscript([{ startMs: 0, endMs: 1000, text: expected[0]!.text }, { startMs: 1000, endMs: 2000, text: expected[0]!.text }], expected, { maxWer: 0, minPhraseCoverage: 1 });
    expect(result.pass).toBe(false); expect(result.timestampCoverage).toBe(0.5); expect(result.failureCodes).toContain('timestamp_coverage_failed');
  });
});
