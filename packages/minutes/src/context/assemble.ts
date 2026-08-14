export interface ContextSegment {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly isGap?: boolean;
  readonly sourceRangeId?: string;
  readonly tokenCount?: number;
}

export interface ContextPlan {
  readonly mode: 'full' | 'chunked';
  readonly chunks: readonly {
    id: string;
    ordinal: number;
    segmentIds: readonly string[];
    overlapSegmentIds: readonly string[];
    text: string;
    tokenCount: number;
  }[];
  readonly coverage: readonly {
    segmentId: string;
    sourceRangeId: string;
    included: boolean;
    occurrenceCount: number;
    reason?: string;
  }[];
  readonly replayKey: string;
}

export interface ContextLimits {
  readonly maxTokens?: number;
  readonly maxChars?: number;
  readonly overlapSegments: number;
  readonly tokenEstimator?: (text: string) => number;
  readonly signal?: AbortSignal;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function assembleMinutesContext(
  segments: readonly ContextSegment[],
  limits: ContextLimits,
): ContextPlan {
  if (limits.signal?.aborted) throw new Error('cancelled');
  const ordered = [...segments].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  const ids = new Set<string>();
  for (const segment of ordered) {
    if (ids.has(segment.id)) throw new Error('duplicate segment id');
    if (segment.startMs < 0 || segment.endMs <= segment.startMs)
      throw new Error('invalid segment range');
    ids.add(segment.id);
  }
  const estimate =
    limits.tokenEstimator ?? ((value: string) => Math.max(1, Math.ceil(value.length / 4)));
  const maxTokens = limits.maxTokens ?? Math.max(1, Math.ceil((limits.maxChars ?? 4000) / 4));
  const eligible = ordered.filter((segment) => !segment.isGap);
  const text = eligible.map((segment) => segment.text).join('\n');
  const replayKey = stableHash(
    JSON.stringify({ segments: ordered, maxTokens, overlap: limits.overlapSegments }),
  );
  const coverage = (occurrences: Map<string, number>) =>
    ordered.map((segment) => ({
      segmentId: segment.id,
      sourceRangeId: segment.sourceRangeId ?? segment.id,
      included: !segment.isGap && (occurrences.get(segment.id) ?? 0) > 0,
      occurrenceCount: occurrences.get(segment.id) ?? 0,
      reason: segment.isGap ? 'gap' : occurrences.has(segment.id) ? undefined : 'omitted',
    }));
  const fullTokens = estimate(text);
  if (
    fullTokens <= maxTokens &&
    (limits.maxChars === undefined || text.length <= limits.maxChars)
  ) {
    const occurrences = new Map(eligible.map((segment) => [segment.id, 1]));
    return {
      mode: 'full',
      chunks: [
        {
          id: 'full-0',
          ordinal: 0,
          segmentIds: eligible.map((segment) => segment.id),
          overlapSegmentIds: [],
          text,
          tokenCount: fullTokens,
        },
      ],
      coverage: coverage(occurrences),
      replayKey,
    };
  }
  const chunks: { id: string; segmentIds: string[]; text: string }[] = [];
  let current: { ids: string[]; texts: string[]; tokens: number } = {
    ids: [],
    texts: [],
    tokens: 0,
  };
  for (const segment of eligible) {
    if (limits.signal?.aborted) throw new Error('cancelled');
    const segmentTokens = segment.tokenCount ?? estimate(segment.text);
    if (segmentTokens > maxTokens) throw new Error('segment_exceeds_context_limit');
    if (current.ids.length && current.tokens + segmentTokens + 1 > maxTokens) {
      chunks.push({
        id: `chunk-${chunks.length}`,
        segmentIds: [...current.ids],
        text: current.texts.join('\n'),
      });
      const overlap = current.ids.slice(-limits.overlapSegments);
      current = {
        ids: overlap,
        texts: overlap.map((id) => eligible.find((candidate) => candidate.id === id)!.text),
        tokens: overlap.reduce(
          (sum, id) => sum + estimate(eligible.find((candidate) => candidate.id === id)!.text),
          0,
        ),
      };
    }
    current.ids.push(segment.id);
    current.texts.push(segment.text);
    current.tokens += segmentTokens + 1;
  }
  if (current.ids.length)
    chunks.push({
      id: `chunk-${chunks.length}`,
      segmentIds: [...current.ids],
      text: current.texts.join('\n'),
    });
  const occurrences = new Map<string, number>();
  for (const chunk of chunks)
    for (const id of chunk.segmentIds) occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
  return {
    mode: 'chunked',
    chunks: chunks.map((chunk, ordinal) => ({
      ...chunk,
      ordinal,
      overlapSegmentIds:
        ordinal === 0
          ? []
          : chunk.segmentIds.filter((id) => chunks[ordinal - 1]!.segmentIds.includes(id)),
      tokenCount: estimate(chunk.text),
    })),
    coverage: coverage(occurrences),
    replayKey,
  };
}

export function reconcileMinutesChunks(plan: ContextPlan, completedChunkIds: readonly string[]) {
  const completed = new Set(completedChunkIds);
  const missing = plan.chunks.filter((chunk) => !completed.has(chunk.id)).map((chunk) => chunk.id);
  return missing.length
    ? { ok: false as const, missingChunkIds: missing, coverage: plan.coverage }
    : { ok: true as const, missingChunkIds: [], coverage: plan.coverage };
}
