import { useState, useCallback } from 'react';

export interface LibraryMeeting {
  id: string;
  title: string;
  language: 'vi' | 'en';
  mode: 'meeting_only' | 'meeting_translate';
  captureSources: string[];
  state: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  timezone: string;
}

export interface LibraryState {
  items: LibraryMeeting[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

interface LibraryResponse {
  items: LibraryMeeting[];
  nextCursor: string | null;
}

export function useLibrary(fetchPage: (cursor?: string) => Promise<LibraryResponse>) {
  const [state, setState] = useState<LibraryState>({
    items: [],
    loading: true,
    refreshing: false,
    error: null,
    nextCursor: null,
    hasMore: true,
  });

  const loadInitial = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await fetchPage();
      setState({
        items: page.items,
        loading: false,
        refreshing: false,
        error: null,
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: String(err),
      }));
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.refreshing) return;
    setState((s) => ({ ...s, refreshing: true }));
    try {
      const page = await fetchPage(state.nextCursor);
      setState((s) => ({
        items: [...s.items, ...page.items],
        loading: false,
        refreshing: false,
        error: null,
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        refreshing: false,
        error: String(err),
      }));
    }
  }, [fetchPage, state.nextCursor, state.refreshing]);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, refreshing: true, error: null }));
    try {
      const page = await fetchPage();
      setState({
        items: page.items,
        loading: false,
        refreshing: false,
        error: null,
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        refreshing: false,
        error: String(err),
      }));
    }
  }, [fetchPage]);

  return { ...state, loadInitial, loadMore, refresh };
}
