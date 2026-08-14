export interface LibraryMeeting {
  readonly id: string;
  readonly title: string;
  readonly language: 'vi' | 'en';
  readonly createdAt: string;
}

export interface LibraryQuery {
  readonly title?: string;
  readonly language?: 'vi' | 'en';
  readonly from?: string;
  readonly to?: string;
}

/** Filter and order a meeting list deterministically (newest first). */
export function applyLibraryQuery(
  meetings: readonly LibraryMeeting[],
  query: LibraryQuery,
): readonly LibraryMeeting[] {
  const filtered = meetings.filter((meeting) => {
    if (query.title && !meeting.title.toLowerCase().includes(query.title.toLowerCase())) return false;
    if (query.language && meeting.language !== query.language) return false;
    if (query.from && meeting.createdAt < query.from) return false;
    if (query.to && meeting.createdAt > query.to) return false;
    return true;
  });
  return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Merge cursor pages by meeting id, replacing stale duplicates, preserving first-seen order. */
export function mergeLibraryPages<T extends { id: string }>(
  pages: readonly (readonly T[])[],
): readonly T[] {
  const byId = new Map<string, T>();
  const order: string[] = [];
  for (const page of pages) {
    for (const item of page) {
      if (!byId.has(item.id)) order.push(item.id);
      byId.set(item.id, item);
    }
  }
  return order.map((id) => byId.get(id)!);
}
