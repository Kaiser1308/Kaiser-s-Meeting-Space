import {
  MeetingApiError,
  type CreateLocalMeetingInput,
  type CreatedMeeting,
  type StartedMeeting,
  type EndedMeeting,
  type MeetingSummary,
  type MeetingDetailResult,
  type MeetingListResult,
} from './meeting-api.js';
import type { StorageLike } from './transcript-storage.js';

const MEETINGS_INDEX_KEY = 'kms_meeting_index';
const MEETING_PREFIX = 'kms_meeting_';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveStorage(customStorage?: StorageLike): StorageLike | undefined {
  if (customStorage) return customStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return undefined;
}

export class LocalMeetingStore {
  constructor(private customStorage?: StorageLike) {}

  private get storage(): StorageLike | undefined {
    return resolveStorage(this.customStorage);
  }

  private getIndex(): string[] {
    const raw = this.storage?.getItem(MEETINGS_INDEX_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveIndex(ids: string[]): void {
    try {
      this.storage?.setItem(MEETINGS_INDEX_KEY, JSON.stringify(ids));
    } catch {
      // Ignore quota errors
    }
  }

  async createLocalMeeting(input: CreateLocalMeetingInput): Promise<CreatedMeeting> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const meeting: MeetingDetailResult = {
      id,
      title: input.title.trim() || 'New meeting',
      language: input.language,
      mode: 'meeting_only',
      captureSources: ['mic', 'system'],
      state: 'draft',
      createdAt: now,
      startedAt: null,
      endedAt: null,
      timezone: input.timezone || 'UTC',
      speechMode: 'local',
      version: 1,
    };

    try {
      this.storage?.setItem(`${MEETING_PREFIX}${id}`, JSON.stringify(meeting));
      const index = this.getIndex();
      if (!index.includes(id)) {
        index.unshift(id);
        this.saveIndex(index);
      }
    } catch {
      throw new MeetingApiError('API_UNAVAILABLE');
    }

    return {
      id,
      title: meeting.title,
      language: meeting.language,
      mode: 'meeting_only',
      captureSources: meeting.captureSources,
      state: 'draft',
      version: meeting.version,
      createdAt: meeting.createdAt,
    };
  }

  async startLocalMeeting(meetingId: string): Promise<StartedMeeting> {
    if (!UUID_REGEX.test(meetingId)) {
      throw new MeetingApiError('INVALID_RESPONSE');
    }

    const detail = await this.getLocalMeeting(meetingId);
    detail.state = 'recording';
    detail.startedAt = new Date().toISOString();
    detail.version += 1;

    try {
      this.storage?.setItem(`${MEETING_PREFIX}${meetingId}`, JSON.stringify(detail));
    } catch {
      throw new MeetingApiError('API_UNAVAILABLE');
    }

    return {
      meetingId,
      state: 'recording',
      startedAt: detail.startedAt,
      policyVersion: 1,
    };
  }

  async endLocalMeeting(meetingId: string): Promise<EndedMeeting> {
    if (!UUID_REGEX.test(meetingId)) {
      throw new MeetingApiError('INVALID_RESPONSE');
    }

    const detail = await this.getLocalMeeting(meetingId);
    const finalizedAt = new Date().toISOString();
    detail.state = 'finalized';
    detail.endedAt = finalizedAt;
    detail.version += 1;

    try {
      this.storage?.setItem(`${MEETING_PREFIX}${meetingId}`, JSON.stringify(detail));
    } catch {
      throw new MeetingApiError('API_UNAVAILABLE');
    }

    return { meetingId, state: 'finalized', finalizedAt };
  }

  async cancelLocalMeeting(meetingId: string): Promise<void> {
    if (!UUID_REGEX.test(meetingId)) return;
    try {
      const detail = await this.getLocalMeeting(meetingId);
      detail.state = 'failed';
      detail.version += 1;
      this.storage?.setItem(`${MEETING_PREFIX}${meetingId}`, JSON.stringify(detail));
    } catch {
      // Ignore if meeting does not exist
    }
  }

  async listLocalMeetings(options?: {
    limit?: number;
    cursor?: string;
    state?: string;
  }): Promise<MeetingListResult> {
    const index = this.getIndex();
    const items: MeetingSummary[] = [];

    for (const id of index) {
      const raw = this.storage?.getItem(`${MEETING_PREFIX}${id}`);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as MeetingDetailResult;
        if (options?.state && parsed.state !== options.state) continue;
        items.push({
          id: parsed.id,
          title: parsed.title,
          language: parsed.language,
          mode: parsed.mode,
          captureSources: parsed.captureSources,
          state: parsed.state,
          createdAt: parsed.createdAt,
          startedAt: parsed.startedAt,
          endedAt: parsed.endedAt,
          timezone: parsed.timezone,
          speechMode: parsed.speechMode,
        });
      } catch {
        // Skip corrupted entries
      }
    }

    // Sort newest first
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const limit = options?.limit ?? 50;
    const paginated = items.slice(0, limit);

    return {
      items: paginated,
      nextCursor: null,
    };
  }

  async getLocalMeeting(meetingId: string): Promise<MeetingDetailResult> {
    if (!UUID_REGEX.test(meetingId)) {
      throw new MeetingApiError('INVALID_RESPONSE');
    }

    const raw = this.storage?.getItem(`${MEETING_PREFIX}${meetingId}`);
    if (!raw) {
      throw new MeetingApiError('API_UNAVAILABLE');
    }

    try {
      return JSON.parse(raw) as MeetingDetailResult;
    } catch {
      throw new MeetingApiError('INVALID_RESPONSE');
    }
  }
}

export function createLocalMeetingStore(customStorage?: StorageLike): LocalMeetingStore {
  return new LocalMeetingStore(customStorage);
}
