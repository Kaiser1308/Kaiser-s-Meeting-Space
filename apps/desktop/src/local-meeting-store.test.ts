import { describe, it, expect, beforeEach } from 'vitest';
import { LocalMeetingStore, createLocalMeetingStore } from './local-meeting-store.js';
import { MeetingApiError } from './meeting-api.js';
import type { StorageLike } from './transcript-storage.js';

describe('LocalMeetingStore', () => {
  let memoryDisk: Record<string, string>;
  let storage: StorageLike;
  let store: LocalMeetingStore;

  beforeEach(() => {
    memoryDisk = {};
    storage = {
      getItem: (k: string) => memoryDisk[k] ?? null,
      setItem: (k: string, v: string) => {
        memoryDisk[k] = v;
      },
      removeItem: (k: string) => {
        delete memoryDisk[k];
      },
    };
    store = createLocalMeetingStore(storage);
  });

  it('creates and retrieves a local meeting with valid UUID and initial state', async () => {
    const created = await store.createLocalMeeting({
      title: 'Planning Session',
      language: 'vi',
      timezone: 'Asia/Ho_Chi_Minh',
    });

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const detail = await store.getLocalMeeting(created.id);
    expect(detail.id).toBe(created.id);
    expect(detail.title).toBe('Planning Session');
    expect(detail.language).toBe('vi');
    expect(detail.state).toBe('draft');
    expect(detail.startedAt).toBeNull();
    expect(detail.endedAt).toBeNull();
    expect(detail.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(detail.captureSources).toEqual(['mic', 'system']);
  });

  it('starts a meeting, updating state to recording and recording startedAt', async () => {
    const created = await store.createLocalMeeting({
      title: 'Active Sync',
      language: 'en',
      timezone: 'UTC',
    });

    const started = await store.startLocalMeeting(created.id);
    expect(started.meetingId).toBe(created.id);
    expect(started.state).toBe('recording');

    const detail = await store.getLocalMeeting(created.id);
    expect(detail.state).toBe('recording');
    expect(detail.startedAt).not.toBeNull();
    expect(detail.version).toBe(2);
  });

  it('ends a meeting, updating state to finalized and recording endedAt', async () => {
    const created = await store.createLocalMeeting({
      title: 'Finished Call',
      language: 'en',
      timezone: 'UTC',
    });
    await store.startLocalMeeting(created.id);

    const ended = await store.endLocalMeeting(created.id);
    expect(ended.meetingId).toBe(created.id);
    expect(ended.state).toBe('finalized');
    expect(ended.finalizedAt).toBeDefined();

    const detail = await store.getLocalMeeting(created.id);
    expect(detail.state).toBe('finalized');
    expect(detail.endedAt).toBe(ended.finalizedAt);
    expect(detail.version).toBe(3);
  });

  it('cancels a meeting upon start failure, updating state to failed', async () => {
    const created = await store.createLocalMeeting({
      title: 'Failed Capture Session',
      language: 'vi',
      timezone: 'UTC',
    });
    await store.startLocalMeeting(created.id);

    await store.cancelLocalMeeting(created.id);

    const detail = await store.getLocalMeeting(created.id);
    expect(detail.state).toBe('failed');
  });

  it('lists meetings sorted by creation time descending', async () => {
    const m1 = await store.createLocalMeeting({ title: 'First', language: 'en', timezone: 'UTC' });
    const m2 = await store.createLocalMeeting({ title: 'Second', language: 'vi', timezone: 'UTC' });

    const list = await store.listLocalMeetings();
    expect(list.items.length).toBe(2);
    expect(list.items[0]?.id).toBe(m2.id);
    expect(list.items[1]?.id).toBe(m1.id);
  });

  it('filters meetings by state when state filter is provided', async () => {
    const m1 = await store.createLocalMeeting({ title: 'Draft', language: 'en', timezone: 'UTC' });
    const m2 = await store.createLocalMeeting({ title: 'Done', language: 'en', timezone: 'UTC' });
    await store.startLocalMeeting(m2.id);
    await store.endLocalMeeting(m2.id);

    const finalizedList = await store.listLocalMeetings({ state: 'finalized' });
    expect(finalizedList.items.length).toBe(1);
    expect(finalizedList.items[0]?.id).toBe(m2.id);
  });

  it('rejects invalid UUIDs with MeetingApiError', async () => {
    await expect(store.getLocalMeeting('not-a-uuid')).rejects.toThrow(MeetingApiError);
    await expect(store.startLocalMeeting('not-a-uuid')).rejects.toThrow(MeetingApiError);
    await expect(store.endLocalMeeting('not-a-uuid')).rejects.toThrow(MeetingApiError);
  });

  it('persists data across store re-instantiations sharing same storage', async () => {
    const created = await store.createLocalMeeting({
      title: 'Persistent Session',
      language: 'vi',
      timezone: 'UTC',
    });

    // Re-create store with same storage (simulating app restart)
    const restartedStore = createLocalMeetingStore(storage);
    const detail = await restartedStore.getLocalMeeting(created.id);
    expect(detail.title).toBe('Persistent Session');
    expect(detail.language).toBe('vi');

    const list = await restartedStore.listLocalMeetings();
    expect(list.items.length).toBe(1);
    expect(list.items[0]?.id).toBe(created.id);
  });
});
