# Windows M5: Personal Library and Markdown Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Enable the desktop owner to browse past local meetings with stable ordering, reopen a completed meeting to inspect its status and transcript, and export the meeting transcript and metadata to a local Markdown (`.md`) file with safe error reporting.

**Architecture:** Extend the desktop `meetingApi` with validated read contracts for `listLocalMeetings` (`GET /v1/meetings`) and `getLocalMeeting` (`GET /v1/meetings/:id`). Introduce a client-side `transcriptStorage` module to persist and reload immutable transcript segments across meeting sessions. Provide a pure `markdownExport` module that formats meeting metadata and transcript segments into clean, portable GitHub-flavored Markdown and triggers download/saving. Integrate a Library tab into the React desktop renderer (`App`) that lists meetings, supports reopening any meeting, displays its transcript/status, and provides an "Export Markdown" action with clear success/failure feedback.

**Tech Stack:** Electron 34, React 19, TypeScript 5.9, Vitest, `@kms/native-contract`, `@kms/domain`, `@kms/export` renderers, Fastify API read contracts (`GET /v1/meetings`).

## Global Constraints

- Scope is strictly Milestone M5 from the approved roadmap (`docs/superpowers/specs/2026-09-09-windows-offline-mvp-roadmap.md`); do not implement real-time streaming speech, cloud sync, AI minutes, or translation services.
- Preserve source transcript and audio immutability: the source transcript output is strictly read-only and must never be altered during viewing or export.
- Never log raw transcript text or meeting titles. Logging must remain strictly content-free (e.g. segment counts, character lengths, status codes).
- Truthful reporting: if export fails or local API is unavailable, surface clear, actionable diagnostic error banners rather than pretending success.
- Before modifying existing symbols, run GitNexus impact analysis. Run `detect_changes()` before every task commit.

---

### Task 1: Extend `meetingApi` with local meeting library list and detail read contracts

**Files:**

- Modify: `apps/desktop/src/meeting-api.ts`
- Modify: `apps/desktop/src/meeting-api.test.ts`

**Interfaces:**

- Consumes: Fastify routes `GET /v1/meetings` and `GET /v1/meetings/:id`.
- Produces:
  - `listLocalMeetings(options?: { limit?: number; cursor?: string; state?: string }): Promise<MeetingListResult>`
  - `getLocalMeeting(meetingId: string): Promise<MeetingDetailResult>`
  - Types:
    ```ts
    export type MeetingSummary = {
      id: string;
      title: string;
      language: 'vi' | 'en';
      mode: 'meeting_only' | 'meeting_translate';
      captureSources: Array<'mic' | 'system'>;
      state: string;
      createdAt: string;
      startedAt: string | null;
      endedAt: string | null;
      timezone: string;
      speechMode: 'api' | 'local';
    };
    export type MeetingListResult = {
      items: MeetingSummary[];
      nextCursor: string | null;
    };
    export type MeetingDetailResult = {
      id: string;
      title: string;
      language: 'vi' | 'en';
      mode: 'meeting_only' | 'meeting_translate';
      captureSources: Array<'mic' | 'system'>;
      state: string;
      createdAt: string;
      startedAt: string | null;
      endedAt: string | null;
      timezone: string;
      speechMode: 'api' | 'local';
      version: number;
    };
    ```

- [x] **Step 1: Write failing unit tests for `listLocalMeetings` and `getLocalMeeting`**

Add tests to `apps/desktop/src/meeting-api.test.ts`:

```ts
describe('listLocalMeetings', () => {
  it('fetches meetings list with query parameters and parses items correctly', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            title: 'Weekly Sync',
            language: 'vi',
            mode: 'meeting_only',
            captureSources: ['mic'],
            state: 'finalized',
            createdAt: '2026-09-10T10:00:00.000Z',
            startedAt: '2026-09-10T10:01:00.000Z',
            endedAt: '2026-09-10T10:30:00.000Z',
            timezone: 'Asia/Ho_Chi_Minh',
            speechMode: 'local',
          },
        ],
        nextCursor: 'cursor-123',
      }),
    });
    const api = createMeetingApi({ fetch: fetchMock });
    const result = await api.listLocalMeetings({ limit: 10 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4310/v1/meetings?limit=10',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Weekly Sync');
    expect(result.nextCursor).toBe('cursor-123');
  });

  it('maps network failure to MeetingApiError(API_UNAVAILABLE)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network offline'));
    const api = createMeetingApi({ fetch: fetchMock });
    await expect(api.listLocalMeetings()).rejects.toEqual(
      new MeetingApiError('API_UNAVAILABLE'),
    );
  });
});

describe('getLocalMeeting', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000';

  it('fetches meeting detail and parses response correctly', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: validId,
        title: 'Board Meeting',
        language: 'en',
        mode: 'meeting_only',
        captureSources: ['mic', 'system'],
        state: 'finalized',
        createdAt: '2026-09-10T10:00:00.000Z',
        startedAt: '2026-09-10T10:01:00.000Z',
        endedAt: '2026-09-10T10:45:00.000Z',
        timezone: 'UTC',
        speechMode: 'local',
        version: 3,
      }),
    });
    const api = createMeetingApi({ fetch: fetchMock });
    const result = await api.getLocalMeeting(validId);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://127.0.0.1:4310/v1/meetings/${validId}`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.id).toBe(validId);
    expect(result.version).toBe(3);
  });

  it('rejects with INVALID_RESPONSE when meetingId is not a valid UUID', async () => {
    const api = createMeetingApi();
    await expect(api.getLocalMeeting('invalid-uuid')).rejects.toEqual(
      new MeetingApiError('INVALID_RESPONSE'),
    );
  });
});
```

- [x] **Step 2: Run test to verify failure**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/meeting-api.test.ts
```
Expected: FAIL (methods `listLocalMeetings` and `getLocalMeeting` do not exist).

- [x] **Step 3: Implement `listLocalMeetings` and `getLocalMeeting` in `meeting-api.ts`**

In `apps/desktop/src/meeting-api.ts`:
1. Define `MeetingSummary`, `MeetingListResult`, `MeetingDetailResult`.
2. Add parsers `parseMeetingList` and `parseMeetingDetail`.
3. Add `listLocalMeetings(options?: { limit?: number; cursor?: string; state?: string })` to `createMeetingApi`:
   - Builds query string `?limit=${limit}&cursor=${cursor}&state=${state}`.
   - Calls `request('/v1/meetings' + query, { method: 'GET' }, parseMeetingList, 200)`.
4. Add `getLocalMeeting(meetingId: string)`:
   - Validates `meetingId` with `MeetingIdSchema.safeParse`.
   - Calls `request(`/v1/meetings/${encodeURIComponent(meetingId)}`, { method: 'GET' }, parseMeetingDetail, 200)`.

- [x] **Step 4: Run unit tests and typecheck**

Run:
```powershell
pnpm prettier --write apps/desktop/src/meeting-api.ts apps/desktop/src/meeting-api.test.ts
pnpm --filter @kms/desktop exec vitest run src/meeting-api.test.ts
pnpm --filter @kms/desktop typecheck
```
Expected: PASS.

- [x] **Step 5: Stage and commit Task 1**

```powershell
git add apps/desktop/src/meeting-api.ts apps/desktop/src/meeting-api.test.ts
git commit -m "feat(desktop): add listLocalMeetings and getLocalMeeting read contracts to meetingApi"
```

---

### Task 2: Implement client-side transcript persistence manager

**Files:**

- Create: `apps/desktop/src/transcript-storage.ts`
- Create: `apps/desktop/src/transcript-storage.test.ts`

**Interfaces:**

- Consumes: `TranscriptSegment` from `./transcription-workflow.js`.
- Produces:
  - `saveTranscript(meetingId: string, segments: TranscriptSegment[], storage?: StorageLike): void`
  - `getTranscript(meetingId: string, storage?: StorageLike): TranscriptSegment[] | null`
  - `clearTranscript(meetingId: string, storage?: StorageLike): void`
  - Interface `StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }`.

- [x] **Step 1: Write failing unit tests for `transcript-storage`**

Create `apps/desktop/src/transcript-storage.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import {
  saveTranscript,
  getTranscript,
  clearTranscript,
  type StorageLike,
} from './transcript-storage.js';
import type { TranscriptSegment } from './transcription-workflow.js';

describe('transcriptStorage', () => {
  const meetingId = '550e8400-e29b-41d4-a716-446655440000';
  const mockSegments: TranscriptSegment[] = [
    { startMs: 0, endMs: 2500, text: 'Chào mọi người.', speaker: 'Alice' },
    { startMs: 2600, endMs: 5000, text: 'Hôm nay chúng ta họp tổng kết.', speaker: 'Bob' },
  ];

  let memoryStore: Record<string, string>;
  let mockStorage: StorageLike;

  beforeEach(() => {
    memoryStore = {};
    mockStorage = {
      getItem: (key: string) => memoryStore[key] ?? null,
      setItem: (key: string, val: string) => {
        memoryStore[key] = val;
      },
      removeItem: (key: string) => {
        delete memoryStore[key];
      },
    };
  });

  it('saves and retrieves transcript segments for a meeting', () => {
    saveTranscript(meetingId, mockSegments, mockStorage);
    const retrieved = getTranscript(meetingId, mockStorage);
    expect(retrieved).toEqual(mockSegments);
  });

  it('returns null when no transcript exists for the meeting ID', () => {
    expect(getTranscript('non-existent-id', mockStorage)).toBeNull();
  });

  it('returns null and handles corrupted JSON safely without throwing', () => {
    mockStorage.setItem(`kms_transcript_${meetingId}`, '{corrupted-json}');
    expect(getTranscript(meetingId, mockStorage)).toBeNull();
  });

  it('clears stored transcript for a meeting', () => {
    saveTranscript(meetingId, mockSegments, mockStorage);
    clearTranscript(meetingId, mockStorage);
    expect(getTranscript(meetingId, mockStorage)).toBeNull();
  });
});
```

- [x] **Step 2: Run test to confirm failure**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/transcript-storage.test.ts
```
Expected: FAIL due to missing module `transcript-storage.ts`.

- [x] **Step 3: Implement `apps/desktop/src/transcript-storage.ts`**

```ts
import type { TranscriptSegment } from './transcription-workflow.js';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveStorage(customStorage?: StorageLike): StorageLike | undefined {
  if (customStorage) return customStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return undefined;
}

const STORAGE_PREFIX = 'kms_transcript_';

export function saveTranscript(
  meetingId: string,
  segments: TranscriptSegment[],
  customStorage?: StorageLike,
): void {
  const storage = resolveStorage(customStorage);
  if (!storage || !meetingId || !Array.isArray(segments)) return;
  try {
    const key = `${STORAGE_PREFIX}${meetingId}`;
    storage.setItem(key, JSON.stringify(segments));
  } catch {
    // Gracefully handle storage quota or privacy mode errors
  }
}

export function getTranscript(
  meetingId: string,
  customStorage?: StorageLike,
): TranscriptSegment[] | null {
  const storage = resolveStorage(customStorage);
  if (!storage || !meetingId) return null;
  try {
    const key = `${STORAGE_PREFIX}${meetingId}`;
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as TranscriptSegment[];
  } catch {
    return null;
  }
}

export function clearTranscript(meetingId: string, customStorage?: StorageLike): void {
  const storage = resolveStorage(customStorage);
  if (!storage || !meetingId) return;
  try {
    storage.removeItem(`${STORAGE_PREFIX}${meetingId}`);
  } catch {
    // Ignore
  }
}
```

- [x] **Step 4: Run unit tests and typecheck**

Run:
```powershell
pnpm prettier --write apps/desktop/src/transcript-storage.ts apps/desktop/src/transcript-storage.test.ts
pnpm --filter @kms/desktop exec vitest run src/transcript-storage.test.ts
pnpm --filter @kms/desktop typecheck
```
Expected: PASS.

- [x] **Step 5: Stage and commit Task 2**

```powershell
git add apps/desktop/src/transcript-storage.ts apps/desktop/src/transcript-storage.test.ts
git commit -m "feat(desktop): add client-side transcript persistence manager"
```

---

### Task 3: Build pure Markdown export formatter and download handler

**Files:**

- Create: `apps/desktop/src/markdown-export.ts`
- Create: `apps/desktop/src/markdown-export.test.ts`

**Interfaces:**

- Consumes: `TranscriptSegment` from `./transcription-workflow.js`.
- Produces:
  - `formatMeetingMarkdown(meeting: ExportableMeeting, segments: TranscriptSegment[]): string`
  - `exportMeetingMarkdown(meeting: ExportableMeeting, segments: TranscriptSegment[], saveFn?: DownloadHandler): ExportResult`
  - Types:
    ```ts
    export interface ExportableMeeting {
      id: string;
      title: string;
      language: 'vi' | 'en';
      state: string;
      createdAt: string;
      startedAt?: string | null;
      endedAt?: string | null;
      captureSources?: Array<'mic' | 'system'>;
      timezone?: string;
    }
    export type DownloadHandler = (filename: string, content: string) => boolean;
    export interface ExportResult {
      success: boolean;
      filename: string;
      markdown: string;
      error?: string;
    }
    ```

- [x] **Step 1: Write failing unit tests for `markdown-export`**

Create `apps/desktop/src/markdown-export.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  formatMeetingMarkdown,
  exportMeetingMarkdown,
  generateExportFilename,
  type ExportableMeeting,
} from './markdown-export.js';
import type { TranscriptSegment } from './transcription-workflow.js';

describe('markdownExport', () => {
  const mockMeeting: ExportableMeeting = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Q3 Planning Session',
    language: 'vi',
    state: 'finalized',
    createdAt: '2026-09-10T10:00:00.000Z',
    startedAt: '2026-09-10T10:01:00.000Z',
    endedAt: '2026-09-10T10:45:00.000Z',
    captureSources: ['mic', 'system'],
    timezone: 'Asia/Ho_Chi_Minh',
  };

  const mockSegments: TranscriptSegment[] = [
    { startMs: 0, endMs: 2500, text: 'Bắt đầu cuộc họp.', speaker: 'Alice' },
    { startMs: 3000, endMs: 6500, text: 'Mục tiêu quý 3 rất rõ ràng.' },
  ];

  it('formats meeting metadata and transcript segments into clean Markdown', () => {
    const md = formatMeetingMarkdown(mockMeeting, mockSegments);

    expect(md).toContain('# Q3 Planning Session');
    expect(md).toContain('## Meeting Overview');
    expect(md).toContain('- **Meeting ID:** `550e8400-e29b-41d4-a716-446655440000`');
    expect(md).toContain('- **State:** `finalized`');
    expect(md).toContain('- **Language:** VI');
    expect(md).toContain('- **Capture Sources:** mic, system');
    expect(md).toContain('## Source Transcript');
    expect(md).toContain('[00:00 - 00:02] **Alice**: Bắt đầu cuộc họp.');
    expect(md).toContain('[00:03 - 00:06] Mục tiêu quý 3 rất rõ ràng.');
    expect(md).toContain('## Integrity & Durability');
    expect(md).toContain('Source transcript and audio recordings are immutable.');
  });

  it('handles meeting without segments gracefully with placeholder notice', () => {
    const md = formatMeetingMarkdown(mockMeeting, []);
    expect(md).toContain('_No transcript recorded or transcript not yet generated._');
  });

  it('generates sanitized, filesystem-safe filename', () => {
    const filename = generateExportFilename(mockMeeting);
    expect(filename).toBe('q3_planning_session_550e8400.md');
  });

  it('exports markdown successfully using injected download handler', () => {
    const saveMock = vi.fn().mockReturnValue(true);
    const result = exportMeetingMarkdown(mockMeeting, mockSegments, saveMock);

    expect(saveMock).toHaveBeenCalledWith('q3_planning_session_550e8400.md', expect.any(String));
    expect(result.success).toBe(true);
    expect(result.filename).toBe('q3_planning_session_550e8400.md');
    expect(result.error).toBeUndefined();
  });

  it('reports failed export when download handler returns false or throws', () => {
    const saveMock = vi.fn().mockReturnValue(false);
    const result = exportMeetingMarkdown(mockMeeting, mockSegments, saveMock);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to save Markdown file to local disk.');
  });
});
```

- [x] **Step 2: Run test to verify failure**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/markdown-export.test.ts
```
Expected: FAIL due to missing module `markdown-export.ts`.

- [x] **Step 3: Implement `apps/desktop/src/markdown-export.ts`**

```ts
import type { TranscriptSegment } from './transcription-workflow.js';

export interface ExportableMeeting {
  id: string;
  title: string;
  language: 'vi' | 'en';
  state: string;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  captureSources?: Array<'mic' | 'system'>;
  timezone?: string;
}

export type DownloadHandler = (filename: string, content: string) => boolean;

export interface ExportResult {
  success: boolean;
  filename: string;
  markdown: string;
  error?: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function generateExportFilename(meeting: ExportableMeeting): string {
  const sanitized = (meeting.title || 'meeting')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'meeting';
  const shortId = (meeting.id || 'export').slice(0, 8);
  return `${sanitized}_${shortId}.md`;
}

export function formatMeetingMarkdown(
  meeting: ExportableMeeting,
  segments: TranscriptSegment[],
): string {
  const sections: string[] = [];

  // Title
  sections.push(`# ${meeting.title || 'Meeting'}\n`);

  // Overview
  sections.push(`## Meeting Overview\n
- **Meeting ID:** \`${meeting.id}\`
- **State:** \`${meeting.state}\`
- **Created At:** ${meeting.createdAt}
- **Ended At:** ${meeting.endedAt || 'N/A'}
- **Language:** ${(meeting.language || 'en').toUpperCase()}
- **Timezone:** ${meeting.timezone || 'UTC'}
- **Capture Sources:** ${(meeting.captureSources || []).join(', ') || 'mic'}\n`);

  // Transcript
  sections.push(`## Source Transcript\n`);
  if (!segments || segments.length === 0) {
    sections.push(`_No transcript recorded or transcript not yet generated._\n`);
  } else {
    for (const seg of segments) {
      const timeTag = `[${formatDuration(seg.startMs)} - ${formatDuration(seg.endMs)}]`;
      const speakerTag = seg.speaker ? `**${seg.speaker}**: ` : '';
      sections.push(`${timeTag} ${speakerTag}${seg.text}\n`);
    }
  }

  // Integrity Notice
  sections.push(`## Integrity & Durability\n
Source transcript and audio recordings are immutable. Export generated offline by Kaiser's Meeting Space.\n`);

  return sections.join('\n');
}

export function defaultDownloadHandler(filename: string, content: string): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export function exportMeetingMarkdown(
  meeting: ExportableMeeting,
  segments: TranscriptSegment[],
  saveFn?: DownloadHandler,
): ExportResult {
  const filename = generateExportFilename(meeting);
  const markdown = formatMeetingMarkdown(meeting, segments);
  const handler = saveFn ?? defaultDownloadHandler;

  try {
    const saved = handler(filename, markdown);
    if (!saved) {
      return {
        success: false,
        filename,
        markdown,
        error: 'Failed to save Markdown file to local disk.',
      };
    }
    return {
      success: true,
      filename,
      markdown,
    };
  } catch (err) {
    return {
      success: false,
      filename,
      markdown,
      error: `Export failed: ${String(err)}`,
    };
  }
}
```

- [x] **Step 4: Run unit tests and typecheck**

Run:
```powershell
pnpm prettier --write apps/desktop/src/markdown-export.ts apps/desktop/src/markdown-export.test.ts
pnpm --filter @kms/desktop exec vitest run src/markdown-export.test.ts
pnpm --filter @kms/desktop typecheck
```
Expected: PASS.

- [x] **Step 5: Stage and commit Task 3**

```powershell
git add apps/desktop/src/markdown-export.ts apps/desktop/src/markdown-export.test.ts
git commit -m "feat(desktop): add pure Markdown export formatter and download handler"
```

---

### Task 4: Integrate Personal Library view, meeting reopen, and Markdown export into desktop renderer

**Files:**

- Modify: `apps/desktop/src/main.tsx`
- Modify: `apps/desktop/src/main.test.ts`

**Interfaces:**

- Consumes:
  - `meetingApi.listLocalMeetings`, `meetingApi.getLocalMeeting` from `./meeting-api.js`
  - `saveTranscript`, `getTranscript` from `./transcript-storage.js`
  - `exportMeetingMarkdown`, `type ExportableMeeting` from `./markdown-export.js`
- Produces:
  - Tab navigation between "Record" and "Library" (`activeTab: 'record' | 'library'`)
  - Library view listing past meetings with stable ordering, state tags, and date
  - Reopen action loading meeting details and its persisted transcript
  - "Export Markdown" button triggering Markdown generation and saving
  - Safe export error reporting and feedback alert.

- [x] **Step 1: Run GitNexus impact analysis before modifying `main.tsx`**

Run:
```powershell
node .gitnexus/run.cjs impact App -r Kaiser-s-Meeting-Space
```
Confirm blast radius risk.

- [x] **Step 2: Update `main.tsx` with Library navigation, reopen workflow, and Markdown export**

In `apps/desktop/src/main.tsx`:
1. Import:
   ```ts
   import { type MeetingSummary, type MeetingDetailResult } from './meeting-api.js';
   import { saveTranscript, getTranscript } from './transcript-storage.js';
   import { exportMeetingMarkdown } from './markdown-export.js';
   ```
2. Add state variables:
   ```ts
   const [activeTab, setActiveTab] = useState<'record' | 'library'>('record');
   const [libraryMeetings, setLibraryMeetings] = useState<MeetingSummary[]>([]);
   const [libraryLoading, setLibraryLoading] = useState<boolean>(false);
   const [libraryError, setLibraryError] = useState<string | null>(null);
   const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetailResult | null>(null);
   const [exportStatus, setExportStatus] = useState<string | null>(null);
   const [exportError, setExportError] = useState<string | null>(null);
   ```
3. Update `handleTranscribeMeeting`:
   - When transcription completes successfully (`setTranscriptSegments(result.segments)`), also persist to storage:
     `saveTranscript(lastSessionSummary.meetingId, result.segments);`
4. Add library handlers:
   ```ts
   const fetchLibrary = async () => {
     setLibraryLoading(true);
     setLibraryError(null);
     try {
       const res = await meetingApi.listLocalMeetings({ limit: 50 });
       setLibraryMeetings(res.items);
     } catch (err) {
       setLibraryError('Failed to load local meeting library.');
       log(`Failed to load library: ${err}`);
     } finally {
       setLibraryLoading(false);
     }
   };

   const handleOpenMeeting = async (meetingId: string) => {
     try {
       log(`Opening meeting ${meetingId}...`);
       const detail = await meetingApi.getLocalMeeting(meetingId);
       setSelectedMeeting(detail);
       // Load persisted transcript if available
       const cachedSegments = getTranscript(meetingId);
       if (cachedSegments && cachedSegments.length > 0) {
         setTranscriptSegments(cachedSegments);
         setTranscriptState('completed');
       } else {
         setTranscriptSegments([]);
         setTranscriptState('idle');
       }
     } catch (err) {
       log(`Failed to open meeting ${meetingId}: ${err}`);
     }
   };

   const handleExportMarkdown = () => {
     const targetMeeting = selectedMeeting || (lastSessionSummary ? {
       id: lastSessionSummary.meetingId,
       title: meetingTitle,
       language: meetingLanguage,
       state: 'finalized',
       createdAt: new Date().toISOString(),
       endedAt: lastSessionSummary.finalizedAt,
       captureSources: ['mic'],
       timezone: meetingTimezone,
     } : null);

     if (!targetMeeting) return;
     setExportError(null);
     setExportStatus(null);

     const res = exportMeetingMarkdown(targetMeeting, transcriptSegments);
     if (res.success) {
       setExportStatus(`Exported ${res.filename} successfully.`);
       log(`Exported markdown file: ${res.filename}`);
     } else {
       setExportError(res.error || 'Failed to export Markdown.');
       log(`Markdown export failed: ${res.error}`);
     }
   };
   ```
5. In UI JSX:
   - Add tab switcher at top of workspace: `<button onClick={() => setActiveTab('record')}>Record</button>` and `<button onClick={() => { setActiveTab('library'); fetchLibrary(); }}>Library</button>`.
   - On the `source-transcript-card` and on reopened meeting card:
     - Add **"Export Markdown"** button (`data-testid="export-markdown-btn"`).
     - Display export status message / export error banner when present.
   - When `activeTab === 'library'`:
     - Render Library container (`data-testid="meeting-library"`):
       - Refresh button
       - Loading indicator when `libraryLoading`
       - Error alert when `libraryError`
       - List of meetings with Title, State badge, Creation date, and "View / Reopen" button (`data-testid="open-meeting-btn"`).
       - When `selectedMeeting` is opened: render reopened meeting detail card, status, transcript segments, and Export button.

- [x] **Step 3: Update `main.test.ts` to assert Library, meeting reopen, and Markdown export wiring**

In `apps/desktop/src/main.test.ts`, add tests:
- Verifies tab navigation between 'record' and 'library'.
- Verifies `activeTab === 'library'` renders library container.
- Verifies reopening a meeting loads details and displays transcript segments.
- Verifies "Export Markdown" button calls `exportMeetingMarkdown` and displays status/error.

- [x] **Step 4: Run unit tests and typecheck**

Run:
```powershell
pnpm prettier --write apps/desktop/src/main.tsx apps/desktop/src/main.test.ts
pnpm --filter @kms/desktop test:unit
pnpm --filter @kms/desktop typecheck
pnpm --filter @kms/desktop exec vite build
```
Expected: All tests pass, typecheck exits 0, build succeeds.

- [x] **Step 5: Stage and commit Task 4**

```powershell
git add apps/desktop/src/main.tsx apps/desktop/src/main.test.ts
git commit -m "feat(desktop): integrate personal library view, meeting reopen, and Markdown export"
```

---

### Task 5: Qualify end-to-end M5 Library and Markdown Export gates

**Files:**

- Test: `apps/desktop/src/meeting-api.test.ts`, `apps/desktop/src/transcript-storage.test.ts`, `apps/desktop/src/markdown-export.test.ts`, `apps/desktop/src/main.test.ts`.

- [x] **Step 1: Run the complete automated M5 regression gate**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run
pnpm --filter @kms/desktop typecheck
pnpm --filter @kms/desktop exec vite build
```
Expected: All test suites pass; typecheck exits 0; production build succeeds.

- [x] **Step 2: Run GitNexus change scope detection and impact verification**

Run:
```powershell
node .gitnexus/run.cjs detect-changes --scope compare --base-ref HEAD~4 --repo Kaiser-s-Meeting-Space --branch master
git status --short
```
Expected: Clean review, zero unrelated changes, no scope creep.

- [x] **Step 3: Update plan document with verified checklist**

Mark all checklist items `[x]` upon direct verification.

```powershell
git add docs/superpowers/plans/2026-09-10-windows-m5-local-library-and-markdown-export.md
git commit -m "docs(m5): mark Milestone M5 tasks and qualification gates verified"
```

---

## Plan Self-Review

- **Spec coverage:** Satisfies M5 outcome: owner can browse local meetings, reopen a completed meeting, view transcript/status, and export Markdown to a chosen local path with failed export reporting.
- **Immutability:** Source transcript and audio are immutable; Markdown export produces a separate, derived text artifact.
- **Privacy:** Content-free logs only. No cloud services or external network dependencies.
