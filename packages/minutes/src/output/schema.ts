export interface Citation {
  readonly segmentId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly quoteHash?: string;
}
export interface MinutesClaim {
  readonly id: string;
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly needsConfirmation: boolean;
  readonly owner?: string;
  readonly dueDate?: string;
}
export interface DetailedMinutesDraftV1 {
  readonly version: 1;
  readonly id: string;
  readonly meetingId: string;
  readonly ownerId: string;
  readonly projectionVersion: number;
  readonly completenessVersion: number;
  readonly templateId: string;
  readonly outputLanguage: 'vi' | 'en';
  readonly context: string;
  readonly discussion: readonly MinutesClaim[];
  readonly decisions: readonly MinutesClaim[];
  readonly actions: readonly MinutesClaim[];
  readonly risks: readonly MinutesClaim[];
  readonly followUps: readonly MinutesClaim[];
}
export function validateDetailedMinutesDraft(
  value: unknown,
): { ok: true; value: DetailedMinutesDraftV1 } | { ok: false; reason: string } {
  const draft = value as Partial<DetailedMinutesDraftV1>;
  if (
    draft.version !== 1 ||
    typeof draft.id !== 'string' ||
    typeof draft.meetingId !== 'string' ||
    typeof draft.ownerId !== 'string' ||
    typeof draft.context !== 'string'
  )
    return { ok: false, reason: 'missing provenance' };
  for (const section of ['discussion', 'decisions', 'actions', 'risks', 'followUps'] as const) {
    const items = draft[section];
    if (!Array.isArray(items)) return { ok: false, reason: 'missing section' };
    for (const item of items) {
      if (
        !item ||
        typeof item.text !== 'string' ||
        !Array.isArray(item.citations) ||
        item.citations.some(
          (citation: Citation) =>
            citation.startMs > citation.endMs || typeof citation.segmentId !== 'string',
        )
      )
        return { ok: false, reason: 'invalid claim/citation' };
    }
  }
  return { ok: true, value: draft as DetailedMinutesDraftV1 };
}
