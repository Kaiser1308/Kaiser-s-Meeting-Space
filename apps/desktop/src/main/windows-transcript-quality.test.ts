import { describe, expect, it } from 'vitest';
import { compareTranscript } from './windows-transcript-quality.js';

const expected = [{ startMs: 0, endMs: 1000, text: 'Alpha approves the action item.' }];

describe('Windows transcript quality comparator', () => {
  it('accepts an exact transcript', () => expect(compareTranscript(expected, expected, { maxWer: 0, minPhraseCoverage: 1 }).pass).toBe(true));
  it('covers reference sentences when recognizer segmentation and number formatting differ', () => {
    const reference = [{
      startMs: 0,
      endMs: 13_002,
      text: 'Hello. This is the Kaiser synthetic meeting fixture. We approve action item one. The owner is Alex and the due date is Friday. No real meeting content is included.',
    }];
    const recognized = [
      { startMs: 0, endMs: 4_510, text: 'Hello. This is the Kaiser Synthetic Meeting fixture.' },
      { startMs: 4_510, endMs: 8_520, text: 'We approve Action Item 1. The owner is Alex and the due date is Friday.' },
      { startMs: 8_520, endMs: 13_002, text: 'No real meeting content is included.' },
    ];
    const result = compareTranscript(recognized, reference, { maxWer: 0.45, minPhraseCoverage: 0.8 });
    expect(result.pass).toBe(true);
    expect(result.wer).toBeGreaterThan(0);
    expect(result.phraseCoverage).toBe(1);
  });
  it('does not hide a mismatch in a short idiom', () => {
    const reference = [{ startMs: 0, endMs: 1000, text: 'They support one another.' }];
    const recognized = [{ startMs: 0, endMs: 1000, text: 'They support 1 another.' }];
    const result = compareTranscript(recognized, reference, { maxWer: 1, minPhraseCoverage: 1 });
    expect(result.pass).toBe(false);
    expect(result.phraseCoverage).toBe(0);
    expect(result.failureCodes).toContain('phrase_coverage_failed');
  });
  it('does not count one recognized phrase twice', () => {
    const reference = [{ startMs: 0, endMs: 2000, text: 'Alpha. Alpha.' }];
    const recognized = [{ startMs: 0, endMs: 1000, text: 'Alpha.' }];
    const result = compareTranscript(recognized, reference, { maxWer: 0.6, minPhraseCoverage: 1 });
    expect(result.pass).toBe(false);
    expect(result.phraseCoverage).toBe(0.5);
    expect(result.failureCodes).toContain('phrase_coverage_failed');
  });
  it('does not let a partial phrase consume tokens from a later matching phrase', () => {
    const reference = [{ startMs: 0, endMs: 2000, text: 'Alpha beta missing phrase extra. Alpha beta.' }];
    const recognized = [{ startMs: 0, endMs: 1000, text: 'Alpha beta.' }];
    const result = compareTranscript(recognized, reference, { maxWer: 1, minPhraseCoverage: 1 });
    expect(result.pass).toBe(false);
    expect(result.phraseCoverage).toBe(0.5);
    expect(result.failureCodes).toContain('phrase_coverage_failed');
  });
  it('reports missing phrases and empty transcripts', () => {
    const result = compareTranscript([], expected, { maxWer: 0, minPhraseCoverage: 1 });
    expect(result.pass).toBe(false); expect(result.failureCodes).toEqual(expect.arrayContaining(['wer_threshold_failed', 'phrase_coverage_failed', 'empty_transcript']));
  });
  it('rejects duplicate or out-of-bounds segments', () => {
    const result = compareTranscript([{ startMs: 0, endMs: 1000, text: expected[0]!.text }, { startMs: 1000, endMs: 2000, text: expected[0]!.text }], expected, { maxWer: 0, minPhraseCoverage: 1 });
    expect(result.pass).toBe(false); expect(result.timestampCoverage).toBe(0.5); expect(result.failureCodes).toContain('timestamp_coverage_failed');
  });
});
