import { z } from 'zod';

export interface EvalReport {
  timestamp: string;
  version: 'stt-window-v1';
  language: 'vi' | 'en';
  condition: 'clean' | 'noisy';
  wer: number | null;
  werBlocked: boolean;
  timestampP95Ms: number | null;
  timestampP95Blocked: boolean;
  localRtf: number | null;
  localRtfBlocked: boolean;
  cancelAckMs: number | null;
  cancelAckPass: boolean;
  planCoverage: number;
  planDeterministic: boolean;
  noNetworkLocal: boolean;
  cloudContactAbsent: boolean;
  memoryPeakBytes: number | null;
  thresholds: {
    wer: { clean: number; noisy: number };
    timestampP95: number;
    localRtf: number;
    cancelAck: number;
  };
}

export const EVAL_REPORT_SCHEMA = z
  .object({
    timestamp: z.string().datetime(),
    version: z.literal('stt-window-v1'),
    language: z.enum(['vi', 'en']),
    condition: z.enum(['clean', 'noisy']),
    wer: z.number().nullable(),
    werBlocked: z.boolean(),
    timestampP95Ms: z.number().nullable(),
    timestampP95Blocked: z.boolean(),
    localRtf: z.number().nullable(),
    localRtfBlocked: z.boolean(),
    cancelAckMs: z.number().nullable(),
    cancelAckPass: z.boolean(),
    planCoverage: z.number().min(0).max(100),
    planDeterministic: z.boolean(),
    noNetworkLocal: z.boolean(),
    cloudContactAbsent: z.boolean(),
    memoryPeakBytes: z.number().int().positive().nullable(),
    thresholds: z
      .object({
        wer: z.object({ clean: z.number(), noisy: z.number() }),
        timestampP95: z.number(),
        localRtf: z.number(),
        cancelAck: z.number(),
      })
      .strict(),
  })
  .strict();

export const THRESHOLDS: EvalReport['thresholds'] = {
  wer: { clean: 0.18, noisy: 0.3 },
  timestampP95: 1.5,
  localRtf: 1.0,
  cancelAck: 2.0,
};

export function computeWer(reference: string, hypothesis: string): number {
  const refWords = reference.toLowerCase().split(/\s+/);
  const hypWords = hypothesis.toLowerCase().split(/\s+/);
  const m = refWords.length;
  const n = hypWords.length;

  if (m === 0) return n === 0 ? 0 : 1;
  if (n === 0) return 1;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = refWords[i - 1] === hypWords[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }

  return dp[m]![n]! / m;
}

export function createBlockedReport(
  language: 'vi' | 'en',
  condition: 'clean' | 'noisy',
): EvalReport {
  return {
    timestamp: new Date().toISOString(),
    version: 'stt-window-v1',
    language,
    condition,
    wer: null,
    werBlocked: true,
    timestampP95Ms: null,
    timestampP95Blocked: true,
    localRtf: null,
    localRtfBlocked: true,
    cancelAckMs: null,
    cancelAckPass: false,
    planCoverage: 0,
    planDeterministic: false,
    noNetworkLocal: true,
    cloudContactAbsent: true,
    memoryPeakBytes: null,
    thresholds: THRESHOLDS,
  };
}

export function computePlanCoverage(
  windows: { startMs: number; endMs: number }[],
  durationMs: number,
): number {
  if (durationMs <= 0) return 0;
  const covered = new Set<number>();
  for (const w of windows) {
    const step = Math.max(1, Math.floor((w.endMs - w.startMs) / 1000));
    for (let t = w.startMs; t < w.endMs; t += step) {
      covered.add(Math.floor(t / 1000));
    }
  }
  const total = Math.ceil(durationMs / 1000);
  return Math.round((covered.size / total) * 10000) / 100;
}
