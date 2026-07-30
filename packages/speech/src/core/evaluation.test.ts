import { describe, it, expect } from 'vitest';
import {
  computeWer,
  createBlockedReport,
  EVAL_REPORT_SCHEMA,
  THRESHOLDS,
  computePlanCoverage,
} from './evaluation.js';

describe('computeWer', () => {
  it('returns 0 for identical strings', () => {
    expect(computeWer('hello world', 'hello world')).toBe(0);
  });

  it('returns 1 for completely different strings', () => {
    expect(computeWer('hello world', 'goodbye earth')).toBe(1);
  });

  it('returns partial WER for substitution', () => {
    const ref = 'the quick brown fox';
    const hyp = 'the fast brown cat';
    expect(computeWer(ref, hyp)).toBe(0.5);
  });

  it('handles empty reference', () => {
    expect(computeWer('', 'hello')).toBe(1);
    expect(computeWer('', '')).toBe(0);
  });

  it('handles empty hypothesis', () => {
    expect(computeWer('hello', '')).toBe(1);
  });

  it('is case-insensitive', () => {
    expect(computeWer('Hello World', 'hello world')).toBe(0);
  });

  it('handles Vietnamese', () => {
    const ref = 'xin chào mọi người';
    const hyp = 'xin chào các bạn';
    const wer = computeWer(ref, hyp);
    expect(wer).toBe(0.5);
  });
});

describe('EVAL_REPORT_SCHEMA', () => {
  it('accepts a valid blocked report', () => {
    const report = createBlockedReport('vi', 'clean');
    const result = EVAL_REPORT_SCHEMA.safeParse(report);
    expect(result.success).toBe(true);
  });

  it('rejects report with extra fields', () => {
    const report = { ...createBlockedReport('en', 'noisy'), secretAudio: 'base64...' };
    const result = EVAL_REPORT_SCHEMA.safeParse(report);
    expect(result.success).toBe(false);
  });

  it('rejects report with transcript content', () => {
    const report = {
      ...createBlockedReport('vi', 'clean'),
      transcriptText: 'meeting content',
    } as any;
    const result = EVAL_REPORT_SCHEMA.safeParse(report);
    expect(result.success).toBe(false);
  });
});

describe('THRESHOLDS', () => {
  it('clean WER threshold is 18%', () => {
    expect(THRESHOLDS.wer.clean).toBe(0.18);
  });

  it('noisy WER threshold is 30%', () => {
    expect(THRESHOLDS.wer.noisy).toBe(0.3);
  });

  it('timestamp P95 is 1.5s', () => {
    expect(THRESHOLDS.timestampP95).toBe(1.5);
  });

  it('local RTF is 1.0', () => {
    expect(THRESHOLDS.localRtf).toBe(1.0);
  });

  it('cancel ack is 2.0s', () => {
    expect(THRESHOLDS.cancelAck).toBe(2.0);
  });
});

describe('createBlockedReport', () => {
  it('marks all measurements as blocked', () => {
    const report = createBlockedReport('vi', 'clean');
    expect(report.werBlocked).toBe(true);
    expect(report.timestampP95Blocked).toBe(true);
    expect(report.localRtfBlocked).toBe(true);
    expect(report.wer).toBeNull();
    expect(report.cancelAckPass).toBe(false);
  });
});

describe('computePlanCoverage', () => {
  it('returns 100 for single window covering entire duration', () => {
    const windows = [{ startMs: 0, endMs: 300_000 }];
    expect(computePlanCoverage(windows, 300_000)).toBe(100);
  });

  it('returns partial coverage for partial window', () => {
    const windows = [{ startMs: 0, endMs: 150_000 }];
    const cov = computePlanCoverage(windows, 300_000);
    expect(cov).toBeGreaterThan(40);
    expect(cov).toBeLessThan(60);
  });
});
