import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GapEntrySchema, type GapEntry } from '@kms/domain';

// ── stt-window-v1 constants ──

export const STT_WINDOW_V1 = 'stt-window-v1';
export const WINDOW_MS = 300_000;
export const OVERLAP_MS = 2_000;

// ── Schemas ──

export const WindowPlanItemSchema = z
  .object({
    index: z.number().int().nonnegative(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    overlapMs: z.number().int().nonnegative().default(0),
  })
  .strict()
  .refine((d) => d.endMs > d.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });

export const BackfillRangeSchema = z
  .object({
    kind: z.literal('backfill_required'),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .strict()
  .refine((d) => d.endMs >= d.startMs, {
    message: 'endMs must be >= startMs',
    path: ['endMs'],
  });

export const WindowPlanSchema = z
  .object({
    version: z.literal(STT_WINDOW_V1),
    durationMs: z.number().int().positive(),
    windows: z.array(WindowPlanItemSchema).min(1),
    backfillRanges: z.array(BackfillRangeSchema).default([]),
    planHash: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]{64}$/),
  })
  .strict();

export type WindowPlanItem = z.infer<typeof WindowPlanItemSchema>;
export type BackfillRange = z.infer<typeof BackfillRangeSchema>;
export type WindowPlan = z.infer<typeof WindowPlanSchema>;

// ── Errors ──

export class InvalidDurationError extends Error {
  readonly code = 'INVALID_DURATION';
  constructor(durationMs: number) {
    super(`durationMs must be a positive integer; got ${durationMs}`);
    this.name = 'InvalidDurationError';
  }
}

// ── Internal helpers ──

type NormalizedGap = { startMs: number; endMs: number };

/**
 * Validate every supplied gap against the strict {@link GapEntrySchema}.
 * Unknown fields (e.g. fake chunk-index hints) are rejected here so the
 * planner never reads capture-chunk metadata.
 */
function validateGaps(gaps: readonly GapEntry[]): GapEntry[] {
  return gaps.map((g) => GapEntrySchema.parse(g));
}

/**
 * Sort, clip, and merge gap ranges into a canonical monotonic form used both
 * for planning and for the stable hash. The `reason` field is intentionally
 * dropped: the planner reads only timeline ranges, never gap metadata, so the
 * hash must not depend on it.
 */
function normalizeGaps(gaps: readonly GapEntry[], durationMs: number): NormalizedGap[] {
  const clipped: NormalizedGap[] = [];
  for (const g of gaps) {
    // GapEntrySchema already guarantees startMs >= 0, endMs >= startMs, and
    // integer fields. Only the upper clip to durationMs is needed here.
    if (g.endMs <= g.startMs) continue; // drop zero-width (defensive)
    const endMs = Math.min(g.endMs, durationMs);
    if (endMs <= g.startMs) continue; // entirely past durationMs
    clipped.push({ startMs: g.startMs, endMs });
  }
  clipped.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: NormalizedGap[] = [];
  for (const g of clipped) {
    const last = merged[merged.length - 1];
    if (last && g.startMs <= last.endMs) {
      if (g.endMs > last.endMs) last.endMs = g.endMs;
    } else {
      merged.push({ startMs: g.startMs, endMs: g.endMs });
    }
  }
  return merged;
}

/**
 * Deterministic JSON serializer. Object keys are emitted in sorted order at
 * every depth; arrays preserve order; primitives use their canonical JS
 * representation. Whitespace-free. Reproducible across processes/runtimes.
 *
 * Exported so downstream consumers (e.g. P14 reconciliation) can recompute a
 * plan hash independently and verify lineage.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}'
    );
  }
  // Functions, symbols, undefined etc. are not part of any plan payload.
  return 'null';
}

function computePlanHash(input: {
  version: string;
  durationMs: number;
  gaps: NormalizedGap[];
  windows: WindowPlanItem[];
  backfillRanges: BackfillRange[];
}): string {
  const json = canonicalStringify(input);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

// ── Public API ──

/**
 * Deterministic `stt-window-v1` planner.
 *
 * Splits a monotonic audio timeline `[0, durationMs)` into 300s windows with a
 * 2s overlap between consecutive *full* windows. Overlap is metadata only — it
 * does not extend coverage. Gap ranges are never spanned by a window: each gap
 * becomes a `backfill_required` range in the plan output for downstream
 * reconciliation (P14).
 *
 * The planner reads only `durationMs` and the monotonic gap ranges. It never
 * reads chunk IDs, chunk indices, or any capture-side identity.
 */
export function planWindowsV1(input: {
  durationMs: number;
  gaps?: readonly GapEntry[];
}): WindowPlan {
  const { durationMs } = input;
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    throw new InvalidDurationError(durationMs);
  }

  const rawGaps = input.gaps ?? [];
  const validatedGaps = validateGaps(rawGaps);
  const normalizedGaps = normalizeGaps(validatedGaps, durationMs);

  const windows: WindowPlanItem[] = [];
  const backfillRanges: BackfillRange[] = [];
  let t = 0;
  let index = 0;

  while (t < durationMs) {
    // (1) t falls inside a gap → emit backfill range, advance past the gap.
    // (gapEnd > t is guaranteed: t < g.endMs from `find`, and t < durationMs
    // from the loop, so t < min(g.endMs, durationMs) = gapEnd.)
    const containingGap = normalizedGaps.find((g) => t >= g.startMs && t < g.endMs);
    if (containingGap) {
      const gapEnd = Math.min(containingGap.endMs, durationMs);
      backfillRanges.push({ kind: 'backfill_required', startMs: t, endMs: gapEnd });
      t = gapEnd;
      if (t >= durationMs) break;
      continue;
    }

    // (2) A gap starts within the prospective window → shrink the window to
    //     the gap's start so the window never spans the gap.
    // (gapEnd > end is guaranteed: nextGap is non-zero-width from normalize,
    // and nextGap.startMs < durationMs from `find`, so both nextGap.endMs and
    // durationMs are strictly greater than end = nextGap.startMs.)
    let end = Math.min(t + WINDOW_MS, durationMs);
    const nextGap = normalizedGaps.find((g) => g.startMs > t && g.startMs < end);
    if (nextGap) {
      end = nextGap.startMs;
      windows.push({ index, startMs: t, endMs: end, overlapMs: 0 });
      const gapEnd = Math.min(nextGap.endMs, durationMs);
      backfillRanges.push({ kind: 'backfill_required', startMs: end, endMs: gapEnd });
      t = gapEnd;
      index += 1;
      continue;
    }

    // (3) Full window with no gap interference. Overlap applies only when this
    //     is a full WINDOW, more audio remains, AND the next iteration will
    //     actually start a window at `end` (i.e. `end` does not fall inside or
    //     at the start of a gap). If a gap begins at `end`, the next segment is
    //     a backfill range — not an overlapping window — so overlap is 0.
    const entersGapAtEnd = normalizedGaps.some((g) => end >= g.startMs && end < g.endMs);
    const overlap = end - t === WINDOW_MS && end < durationMs && !entersGapAtEnd ? OVERLAP_MS : 0;
    windows.push({ index, startMs: t, endMs: end, overlapMs: overlap });
    t = end;
    index += 1;
  }

  const planHash = computePlanHash({
    version: STT_WINDOW_V1,
    durationMs,
    gaps: normalizedGaps,
    windows,
    backfillRanges,
  });

  return WindowPlanSchema.parse({
    version: STT_WINDOW_V1,
    durationMs,
    windows,
    backfillRanges,
    planHash,
  });
}
