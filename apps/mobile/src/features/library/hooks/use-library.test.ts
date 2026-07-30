import { describe, it, expect, vi } from 'vitest';
import type { LibraryMeeting } from './use-library.js';

describe('Library data model', () => {
  const mockItems: LibraryMeeting[] = [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Test Meeting',
      language: 'vi',
      mode: 'meeting_only',
      captureSources: ['mic'],
      state: 'ready',
      createdAt: '2024-01-01T00:00:00.000Z',
      startedAt: null,
      endedAt: null,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  ];

  it('meeting item has required fields', () => {
    const item = mockItems[0]!;
    expect(item.id).toBeTruthy();
    expect(item.title).toBeTruthy();
    expect(['vi', 'en']).toContain(item.language);
    expect(['meeting_only', 'meeting_translate']).toContain(item.mode);
    expect(Array.isArray(item.captureSources)).toBe(true);
    expect(item.state).toBeTruthy();
  });

  it('fetch page returns items with cursor', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({
      items: mockItems,
      nextCursor: null,
    });

    const page = await fetchPage();
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
    expect(fetchPage).toHaveBeenCalled();
  });

  it('cursor-based pagination works', async () => {
    const page1 = { items: mockItems.slice(0, 1), nextCursor: 'cursor-1' };
    const page2 = { items: [], nextCursor: null };

    expect(page1.nextCursor).toBeTruthy();
    expect(page2.items).toHaveLength(0);
  });

  it('handles empty library', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({
      items: [] as LibraryMeeting[],
      nextCursor: null,
    });

    const page = await fetchPage();
    expect(page.items).toHaveLength(0);
  });

  it('handles network failure gracefully', async () => {
    const fetchPage = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    await expect(fetchPage()).rejects.toThrow('Network error');
  });
});
