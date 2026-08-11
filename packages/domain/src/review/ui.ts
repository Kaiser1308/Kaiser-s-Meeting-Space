export interface ReviewListItem {
  readonly id: string;
  readonly sourceText: string;
  readonly currentText: string;
  readonly revisedText: string | null;
  readonly translationText: string | null;
  readonly isGap: boolean;
  readonly disagreement: boolean;
  readonly bookmarked: boolean;
}

export interface ReviewListRow extends ReviewListItem {
  readonly key: string;
}

export interface ReviewListState {
  readonly rows: readonly ReviewListRow[];
  readonly activeId: string | null;
  readonly followLive: boolean;
  readonly announce: string;
}

export function createReviewListState(items: readonly ReviewListItem[]): ReviewListState {
  return {
    rows: items.map((item) => ({ ...item, key: item.id })),
    activeId: items[0]?.id ?? null,
    followLive: true,
    announce:
      items.length === 0 ? 'No transcript items' : `${items.length} transcript items loaded`,
  };
}

export function setReviewScrollState(state: ReviewListState, atEnd: boolean): ReviewListState {
  return { ...state, followLive: atEnd };
}

export function appendReviewItems(
  state: ReviewListState,
  incoming: readonly ReviewListItem[],
): ReviewListState {
  const known = new Set(state.rows.map((item) => item.id));
  const added = incoming
    .filter((item) => !known.has(item.id))
    .map((item) => ({ ...item, key: item.id }));
  if (added.length === 0) return state;
  return {
    ...state,
    rows: [...state.rows, ...added],
    activeId: state.followLive ? (added.at(-1)?.id ?? state.activeId) : state.activeId,
    announce: state.followLive
      ? `${added.length} new transcript items`
      : `${added.length} new transcript items available`,
  };
}

export function navigateReviewSearch(state: ReviewListState, text: string): ReviewListState {
  const normalized = text.normalize('NFC').toLocaleLowerCase('vi-VN');
  if (!normalized) return state;
  const match = state.rows.find((item) =>
    [item.sourceText, item.currentText, item.revisedText ?? '', item.translationText ?? ''].some(
      (value) => value.normalize('NFC').toLocaleLowerCase('vi-VN').includes(normalized),
    ),
  );
  return match
    ? { ...state, activeId: match.id, announce: `Transcript item ${match.id} selected` }
    : { ...state, announce: 'No transcript match' };
}
