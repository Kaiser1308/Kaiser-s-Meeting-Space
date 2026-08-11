export interface ContextSegment {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly isGap?: boolean;
}
export interface ContextPlan {
  readonly mode: 'full' | 'chunked';
  readonly chunks: readonly { id: string; segmentIds: readonly string[]; text: string }[];
  readonly coverage: readonly { segmentId: string; included: boolean; reason?: string }[];
}
export function assembleMinutesContext(
  segments: readonly ContextSegment[],
  limits: { maxChars: number; overlapSegments: number },
): ContextPlan {
  const eligible = segments.filter((segment) => !segment.isGap);
  const text = eligible.map((segment) => segment.text).join('\n');
  if (text.length <= limits.maxChars)
    return {
      mode: 'full',
      chunks: [{ id: 'full-0', segmentIds: eligible.map((segment) => segment.id), text }],
      coverage: segments.map((segment) => ({
        segmentId: segment.id,
        included: !segment.isGap,
        reason: segment.isGap ? 'gap' : undefined,
      })),
    };
  const chunks: { id: string; segmentIds: string[]; text: string }[] = [];
  let current: { ids: string[]; texts: string[]; length: number } = {
    ids: [],
    texts: [],
    length: 0,
  };
  for (const segment of eligible) {
    if (current.ids.length && current.length + segment.text.length + 1 > limits.maxChars) {
      chunks.push({
        id: `chunk-${chunks.length}`,
        segmentIds: [...current.ids],
        text: current.texts.join('\n'),
      });
      const overlap = current.ids.slice(-limits.overlapSegments);
      current = {
        ids: overlap,
        texts: overlap.map((id) => eligible.find((candidate) => candidate.id === id)!.text),
        length: overlap.reduce(
          (sum, id) => sum + eligible.find((candidate) => candidate.id === id)!.text.length,
          0,
        ),
      };
    }
    current.ids.push(segment.id);
    current.texts.push(segment.text);
    current.length += segment.text.length + 1;
  }
  if (current.ids.length)
    chunks.push({
      id: `chunk-${chunks.length}`,
      segmentIds: current.ids,
      text: current.texts.join('\n'),
    });
  const covered = new Set(chunks.flatMap((chunk) => chunk.segmentIds));
  return {
    mode: 'chunked',
    chunks,
    coverage: segments.map((segment) => ({
      segmentId: segment.id,
      included: covered.has(segment.id),
      reason: segment.isGap ? 'gap' : covered.has(segment.id) ? undefined : 'omitted',
    })),
  };
}
