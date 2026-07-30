import { describe, expect, it } from 'vitest';
import {
  planWindowsV1,
  STT_WINDOW_V1,
  WINDOW_MS,
  OVERLAP_MS,
  WindowPlanSchema,
  WindowPlanItemSchema,
  BackfillRangeSchema,
  canonicalStringify,
  InvalidDurationError,
  type WindowPlan,
  type WindowPlanItem,
  type BackfillRange,
} from './window-planner.js';
import type { GapEntry } from '@kms/domain';

const HEX64 = /^[0-9a-fA-F]{64}$/;

describe('stt-window-v1 constants', () => {
  it('exposes the version tag and tuning constants', () => {
    expect(STT_WINDOW_V1).toBe('stt-window-v1');
    expect(WINDOW_MS).toBe(300_000);
    expect(OVERLAP_MS).toBe(2_000);
  });
});

describe('stt-window-v1 / short', () => {
  it('emits exactly one clipped window with overlapMs=0 when duration < WINDOW', () => {
    const plan = planWindowsV1({ durationMs: 60_000 });
    expect(plan.windows).toHaveLength(1);
    expect(plan.backfillRanges).toEqual([]);
    const w = plan.windows[0]!;
    expect(w.index).toBe(0);
    expect(w.startMs).toBe(0);
    expect(w.endMs).toBe(60_000);
    expect(w.overlapMs).toBe(0);
    expect(w.endMs - w.startMs).toBe(60_000);
  });
});

describe('stt-window-v1 / exact_multiple', () => {
  it('emits exactly N windows for duration = N*WINDOW with last overlapMs=0', () => {
    const plan = planWindowsV1({ durationMs: 900_000 });
    expect(plan.windows).toHaveLength(3);
    expect(plan.backfillRanges).toEqual([]);
    expect(plan.windows[0]).toMatchObject({ startMs: 0, endMs: 300_000, overlapMs: 2_000 });
    expect(plan.windows[1]).toMatchObject({ startMs: 300_000, endMs: 600_000, overlapMs: 2_000 });
    expect(plan.windows[2]).toMatchObject({ startMs: 600_000, endMs: 900_000, overlapMs: 0 });
    const coverage = plan.windows.reduce((s, w) => s + (w.endMs - w.startMs), 0);
    expect(coverage).toBe(900_000);
  });
});

describe('stt-window-v1 / two_hour', () => {
  it('covers [0, durationMs) exactly with endMs <= durationMs and overlap is metadata only', () => {
    const durationMs = 7_200_000;
    const plan = planWindowsV1({ durationMs });
    expect(plan.windows.length).toBeGreaterThan(0);
    for (const w of plan.windows) {
      expect(w.endMs).toBeLessThanOrEqual(durationMs);
      expect(w.startMs).toBeGreaterThanOrEqual(0);
      expect(w.endMs).toBeGreaterThan(w.startMs);
    }
    const uniqueCoverage = plan.windows.reduce((s, w) => s + (w.endMs - w.startMs), 0);
    expect(uniqueCoverage).toBe(durationMs);
    expect(plan.windows[0]!.startMs).toBe(0);
    expect(plan.windows[plan.windows.length - 1]!.endMs).toBe(durationMs);
    const overlapSum = plan.windows.reduce((s, w) => s + w.overlapMs, 0);
    expect(overlapSum).toBe(plan.windows.filter((w) => w.overlapMs > 0).length * OVERLAP_MS);
  });
});

describe('stt-window-v1 / single_full_plus_remainder', () => {
  it('emits a full window (overlap=OVERLAP) then a clipped remainder (overlap=0)', () => {
    const plan = planWindowsV1({ durationMs: WINDOW_MS + 1 });
    expect(plan.windows).toHaveLength(2);
    expect(plan.windows[0]).toMatchObject({
      index: 0,
      startMs: 0,
      endMs: 300_000,
      overlapMs: 2_000,
    });
    expect(plan.windows[1]).toMatchObject({
      index: 1,
      startMs: 300_000,
      endMs: 300_001,
      overlapMs: 0,
    });
  });
});

describe('stt-window-v1 / pause_or_gap', () => {
  it('does not let any window cross a gap; emits a backfill_range for the gap interval', () => {
    const gap: GapEntry = { startMs: 100_000, endMs: 110_000, reason: 'network_loss' };
    const plan = planWindowsV1({ durationMs: 600_000, gaps: [gap] });
    for (const w of plan.windows) {
      const crossesGap = w.startMs < gap.endMs && w.endMs > gap.startMs;
      expect(crossesGap).toBe(false);
    }
    expect(plan.backfillRanges).toEqual([
      { kind: 'backfill_required', startMs: 100_000, endMs: 110_000 },
    ]);
    expect(plan.windows.length).toBeGreaterThan(0);
    const left = plan.windows.find((w) => w.endMs <= gap.startMs);
    const right = plan.windows.find((w) => w.startMs >= gap.endMs);
    expect(left).toBeDefined();
    expect(right).toBeDefined();
  });
});

describe('stt-window-v1 / gap_at_end', () => {
  it('clips the backfill range to durationMs and emits no extra window past the end', () => {
    const plan = planWindowsV1({
      durationMs: 100_000,
      gaps: [{ startMs: 99_000, endMs: 110_000, reason: 'source_disconnect' }],
    });
    for (const w of plan.windows) {
      expect(w.endMs).toBeLessThanOrEqual(100_000);
    }
    expect(plan.backfillRanges).toEqual([
      { kind: 'backfill_required', startMs: 99_000, endMs: 100_000 },
    ]);
    const last = plan.windows[plan.windows.length - 1]!;
    expect(last.endMs).toBeLessThanOrEqual(100_000);
  });
});

describe('stt-window-v1 / gap_at_start', () => {
  it('emits a backfill range [0, gapEnd) and starts the first window at gapEnd', () => {
    const plan = planWindowsV1({
      durationMs: 600_000,
      gaps: [{ startMs: 0, endMs: 5_000, reason: 'buffer_overflow' }],
    });
    expect(plan.backfillRanges).toEqual([{ kind: 'backfill_required', startMs: 0, endMs: 5_000 }]);
    expect(plan.windows[0]!.startMs).toBe(5_000);
  });
});

describe('stt-window-v1 / overlapping_gaps_merged', () => {
  it('treats overlapping gap ranges as a single merged gap for planning', () => {
    const plan = planWindowsV1({
      durationMs: 600_000,
      gaps: [
        { startMs: 10_000, endMs: 15_000, reason: 'network_loss' },
        { startMs: 12_000, endMs: 20_000, reason: 'crash_recovery' },
      ],
    });
    expect(plan.backfillRanges).toEqual([
      { kind: 'backfill_required', startMs: 10_000, endMs: 20_000 },
    ]);
    for (const w of plan.windows) {
      const crosses = w.startMs < 20_000 && w.endMs > 10_000;
      expect(crosses).toBe(false);
    }
  });
});

describe('stt-window-v1 / repeatability', () => {
  it('returns deep-equal plans for identical inputs', () => {
    const a = planWindowsV1({ durationMs: 1_000_000 });
    const b = planWindowsV1({ durationMs: 1_000_000 });
    expect(a).toEqual(b);
  });
});

describe('stt-window-v1 / stable_hash', () => {
  it('produces identical planHash for identical inputs', () => {
    const a = planWindowsV1({ durationMs: 1_234_567 });
    const b = planWindowsV1({ durationMs: 1_234_567 });
    expect(a.planHash).toBe(b.planHash);
  });

  it('changes planHash when durationMs changes', () => {
    const a = planWindowsV1({ durationMs: 1_000_000 });
    const b = planWindowsV1({ durationMs: 1_000_001 });
    expect(a.planHash).not.toBe(b.planHash);
  });

  it('changes planHash when gaps change', () => {
    const withoutGap = planWindowsV1({ durationMs: 600_000 });
    const withGap = planWindowsV1({
      durationMs: 600_000,
      gaps: [{ startMs: 100_000, endMs: 110_000, reason: 'network_loss' }],
    });
    expect(withoutGap.planHash).not.toBe(withGap.planHash);
  });
});

describe('stt-window-v1 / monotonic_only', () => {
  it('rejects gap entries carrying unknown fields such as chunkIndex', () => {
    const bogusGap = {
      chunkIndex: 5,
      startMs: 100_000,
      endMs: 110_000,
      reason: 'network_loss',
    } as unknown as GapEntry;
    expect(() => planWindowsV1({ durationMs: 600_000, gaps: [bogusGap] })).toThrowError(
      /chunkIndex|strict|invalid/i,
    );
  });

  it('computes the plan from durationMs + monotonic gap ranges only', () => {
    const plan = planWindowsV1({
      durationMs: 600_000,
      gaps: [{ startMs: 100_000, endMs: 110_000, reason: 'network_loss' }],
    });
    expect(plan.version).toBe(STT_WINDOW_V1);
    expect(plan.durationMs).toBe(600_000);
  });
});

describe('stt-window-v1 / reject_zero_duration', () => {
  it('throws a typed INVALID_DURATION error for durationMs = 0', () => {
    let caught: unknown;
    try {
      planWindowsV1({ durationMs: 0 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/duration/i);
    expect(String((caught as { code?: string }).code)).toBe('INVALID_DURATION');
  });
});

describe('stt-window-v1 / reject_negative_duration', () => {
  it('throws a typed INVALID_DURATION error for durationMs < 0', () => {
    expect(() => planWindowsV1({ durationMs: -1 })).toThrowError(/duration/i);
    let caught: unknown;
    try {
      planWindowsV1({ durationMs: -100 });
    } catch (e) {
      caught = e;
    }
    expect(String((caught as { code?: string }).code)).toBe('INVALID_DURATION');
  });
});

describe('stt-window-v1 / hash_format', () => {
  it('emits a 64-char hex planHash matching /^[0-9a-fA-F]{64}$/', () => {
    const plan = planWindowsV1({ durationMs: 1_000_000 });
    expect(plan.planHash).toHaveLength(64);
    expect(plan.planHash).toMatch(HEX64);
  });
});

describe('stt-window-v1 / index_monotonic', () => {
  it('assigns window indices 0,1,2,... strictly increasing by 1', () => {
    const plan = planWindowsV1({ durationMs: 2_500_000 });
    expect(plan.windows[0]!.index).toBe(0);
    for (let i = 1; i < plan.windows.length; i++) {
      expect(plan.windows[i]!.index).toBe(plan.windows[i - 1]!.index + 1);
    }
  });
});

describe('stt-window-v1 / overlap_only_between_full_windows', () => {
  it('sets overlapMs > 0 only when endMs-startMs === WINDOW_MS AND endMs < durationMs', () => {
    const durationMs = 1_234_567;
    const plan = planWindowsV1({ durationMs });
    for (const w of plan.windows) {
      const isFull = w.endMs - w.startMs === WINDOW_MS;
      const hasMore = w.endMs < durationMs;
      if (w.overlapMs > 0) {
        expect(isFull).toBe(true);
        expect(hasMore).toBe(true);
        expect(w.overlapMs).toBe(OVERLAP_MS);
      } else {
        expect(w.overlapMs).toBe(0);
      }
    }
    const last = plan.windows[plan.windows.length - 1]!;
    expect(last.overlapMs).toBe(0);
  });
});

describe('stt-window-v1 / schema shapes', () => {
  it('WindowPlanSchema accepts a constructed plan', () => {
    const plan = planWindowsV1({ durationMs: 750_000 });
    expect(() => WindowPlanSchema.parse(plan)).not.toThrow();
    expect(WindowPlanSchema.parse(plan)).toEqual(plan);
  });

  it('WindowPlanItemSchema rejects endMs <= startMs', () => {
    expect(() =>
      WindowPlanItemSchema.parse({ index: 0, startMs: 100, endMs: 100, overlapMs: 0 }),
    ).toThrowError(/greater than startMs|endMs/i);
  });

  it('BackfillRangeSchema accepts a valid range', () => {
    const parsed = BackfillRangeSchema.parse({
      kind: 'backfill_required',
      startMs: 10,
      endMs: 20,
    });
    expect(parsed).toEqual({ kind: 'backfill_required', startMs: 10, endMs: 20 });
  });

  it('BackfillRangeSchema rejects an unknown kind', () => {
    expect(() =>
      BackfillRangeSchema.parse({ kind: 'something_else', startMs: 10, endMs: 20 }),
    ).toThrowError();
  });

  it('exposes inferred WindowPlan / WindowPlanItem / BackfillRange types (compile-time only)', () => {
    const plan: WindowPlan = planWindowsV1({ durationMs: 1 });
    const item: WindowPlanItem = plan.windows[0]!;
    const range: BackfillRange | undefined = plan.backfillRanges[0];
    expect(plan.version).toBe(STT_WINDOW_V1);
    expect(item.index).toBe(0);
    expect(range).toBeUndefined();
  });
});

describe('stt-window-v1 / canonicalStringify (deterministic JSON)', () => {
  it('serializes null', () => {
    expect(canonicalStringify(null)).toBe('null');
  });

  it('serializes a string with JSON escaping', () => {
    expect(canonicalStringify('hello "world"')).toBe('"hello \\"world\\""');
    expect(canonicalStringify('a\nb')).toBe('"a\\nb"');
  });

  it('serializes numbers and booleans', () => {
    expect(canonicalStringify(0)).toBe('0');
    expect(canonicalStringify(42)).toBe('42');
    expect(canonicalStringify(-1)).toBe('-1');
    expect(canonicalStringify(true)).toBe('true');
    expect(canonicalStringify(false)).toBe('false');
  });

  it('serializes arrays preserving order', () => {
    expect(canonicalStringify([1, 2, 3])).toBe('[1,2,3]');
    expect(canonicalStringify([])).toBe('[]');
    expect(canonicalStringify(['a', 'b'])).toBe('["a","b"]');
  });

  it('serializes objects with alphabetically sorted keys at every depth', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalStringify({})).toBe('{}');
    expect(canonicalStringify({ z: { y: 1, x: 2 }, a: [3, 4] })).toBe(
      '{"a":[3,4],"z":{"x":2,"y":1}}',
    );
  });

  it('maps unexpected value kinds (function/symbol/undefined) to null', () => {
    expect(canonicalStringify(undefined)).toBe('null');
    expect(canonicalStringify(() => 0)).toBe('null');
    expect(canonicalStringify(Symbol('s'))).toBe('null');
  });

  it('produces identical output regardless of input key order', () => {
    const a = canonicalStringify({ version: 'x', duration: 5, gaps: [] });
    const b = canonicalStringify({ gaps: [], duration: 5, version: 'x' });
    expect(a).toBe(b);
  });
});

describe('stt-window-v1 / zero-width and out-of-timeline gaps', () => {
  it('ignores zero-width gaps (startMs === endMs)', () => {
    const plan = planWindowsV1({
      durationMs: 600_000,
      gaps: [{ startMs: 100_000, endMs: 100_000, reason: 'network_loss' }],
    });
    expect(plan.backfillRanges).toEqual([]);
    const ref = planWindowsV1({ durationMs: 600_000 });
    expect(plan.windows).toEqual(ref.windows);
    expect(plan.planHash).toBe(ref.planHash);
  });

  it('ignores gaps entirely past durationMs', () => {
    const plan = planWindowsV1({
      durationMs: 100_000,
      gaps: [{ startMs: 200_000, endMs: 300_000, reason: 'network_loss' }],
    });
    expect(plan.backfillRanges).toEqual([]);
    expect(plan.windows).toHaveLength(1);
    expect(plan.windows[0]).toMatchObject({ startMs: 0, endMs: 100_000 });
  });

  it('rejects gaps with negative startMs (GapEntrySchema guarantees nonnegative)', () => {
    expect(() =>
      planWindowsV1({
        durationMs: 100_000,
        gaps: [{ startMs: -5_000, endMs: 5_000, reason: 'buffer_overflow' }],
      }),
    ).toThrowError(/startMs|nonnegative|invalid/i);
  });

  it('merges a fully-contained second gap into the first', () => {
    const plan = planWindowsV1({
      durationMs: 600_000,
      gaps: [
        { startMs: 10_000, endMs: 50_000, reason: 'network_loss' },
        { startMs: 20_000, endMs: 30_000, reason: 'crash_recovery' },
      ],
    });
    expect(plan.backfillRanges).toEqual([
      { kind: 'backfill_required', startMs: 10_000, endMs: 50_000 },
    ]);
  });

  it('emits a final backfill range and breaks when a gap straddles the end after a full window', () => {
    const plan = planWindowsV1({
      durationMs: 300_500,
      gaps: [{ startMs: 300_000, endMs: 310_000, reason: 'provider_unavailable' }],
    });
    expect(plan.windows).toEqual([{ index: 0, startMs: 0, endMs: 300_000, overlapMs: 0 }]);
    expect(plan.backfillRanges).toEqual([
      { kind: 'backfill_required', startMs: 300_000, endMs: 300_500 },
    ]);
  });
});

describe('stt-window-v1 / InvalidDurationError', () => {
  it('is exposed as a typed error class', () => {
    expect(InvalidDurationError).toBeInstanceOf(Function);
    const err = new InvalidDurationError(0);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('INVALID_DURATION');
    expect(err.name).toBe('InvalidDurationError');
    expect(err.message).toMatch(/duration/i);
  });

  it('rejects non-integer duration with INVALID_DURATION', () => {
    expect(() => planWindowsV1({ durationMs: 1.5 })).toThrowError(InvalidDurationError);
  });
});

describe('stt-window-v1 / gap_adjacent_merged', () => {
  it('treats adjacent (touching) gap ranges as one continuous gap', () => {
    const plan = planWindowsV1({
      durationMs: 600_000,
      gaps: [
        { startMs: 10_000, endMs: 20_000, reason: 'network_loss' },
        { startMs: 20_000, endMs: 30_000, reason: 'crash_recovery' },
      ],
    });
    expect(plan.backfillRanges).toEqual([
      { kind: 'backfill_required', startMs: 10_000, endMs: 30_000 },
    ]);
  });

  it('merges two gaps that share the same startMs (deterministic tiebreak by endMs)', () => {
    const plan = planWindowsV1({
      durationMs: 600_000,
      gaps: [
        { startMs: 10_000, endMs: 15_000, reason: 'network_loss' },
        { startMs: 10_000, endMs: 20_000, reason: 'crash_recovery' },
      ],
    });
    expect(plan.backfillRanges).toEqual([
      { kind: 'backfill_required', startMs: 10_000, endMs: 20_000 },
    ]);
  });
});
