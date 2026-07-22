import type { MeetingSettings, TranscriptSegment, MeetingLanguage, MeetingMode } from '@kms/domain';

// ── Deterministic IDs ────────────────────────────────────────────────

/**
 * Generate a deterministic UUID-like ID from a prefix and index.
 * Uses a simple hash to produce consistent, unique IDs for test fixtures.
 */
export function deterministicId(prefix: string, index: number): string {
  const hash = simpleHash(`${prefix}-${index}`);
  // Format as UUID v4-like: xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx
  const hex = hash.toString(16).padStart(32, '0').slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    'a' + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

function simpleHash(input: string): number {
  // djb2 hash producing a 32-bit uint
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function deterministicIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => deterministicId(prefix, i));
}

// ── Deterministic Clock ─────────────────────────────────────────────

const FIXED_EPOCH_MS = new Date('2026-07-21T12:00:00.000Z').getTime();

export function deterministicNow(): Date {
  return new Date(FIXED_EPOCH_MS);
}

export interface FakeClock {
  advance(ms: number): void;
  restore(): void;
}

/**
 * Create a fake clock fixture using Vitest's fake timers.
 * The clock starts at the deterministic FIXED_EPOCH_MS.
 */
export function fakeClockFixture(): FakeClock {
  // Use Vitest's vi object (available when globals: true)
  const vi = (globalThis as Record<string, unknown>).vi as
    | {
        useFakeTimers: (opts?: { now?: number }) => void;
        advanceTimersByTime: (ms: number) => void;
        useRealTimers: () => void;
      }
    | undefined;

  if (vi) {
    vi.useFakeTimers({ now: FIXED_EPOCH_MS });
    return {
      advance(ms: number) {
        vi.advanceTimersByTime(ms);
      },
      restore() {
        vi.useRealTimers();
      },
    };
  }

  // Fallback without Vitest globals: minimal manual fake clock
  let currentOffset = 0;
  const originalNow = Date.now;
  Date.now = () => FIXED_EPOCH_MS + currentOffset;
  return {
    advance(ms: number) {
      currentOffset += ms;
    },
    restore() {
      Date.now = originalNow;
    },
  };
}

// ── Synthetic Fixtures ──────────────────────────────────────────────

let meetingCounter = 0;

export interface MeetingOverrides {
  title?: string;
  mode?: MeetingMode;
  primaryLanguage?: MeetingLanguage;
}

export function createMeetingFixture(overrides: MeetingOverrides = {}): MeetingSettings {
  meetingCounter++;
  return {
    id: deterministicId('meeting', meetingCounter) as import('@kms/domain').MeetingId,
    ownerId: 'test-owner',
    title: overrides.title ?? 'Cuộc họp kiểm thử',
    language: overrides.primaryLanguage ?? 'vi',
    mode: overrides.mode ?? ('meeting_only' as MeetingMode),
    captureSources: ['mic'],
    speechMode: 'api',
    timezone: 'Asia/Ho_Chi_Minh',
    version: 1,
    createdAt: deterministicNow().toISOString(),
  };
}

const SYNTHETIC_SPEAKERS = ['Người nói A', 'Người nói B', 'Người nói C'];
const SYNTHETIC_TEXTS = [
  'Xin chào mọi người, hôm nay chúng ta sẽ thảo luận về tiến độ dự án.',
  'Tôi đã hoàn thành phần backend và đang chờ review từ team.',
  'Frontend còn một số lỗi nhỏ, dự kiến sẽ fix xong trong tuần này.',
  'Về phần kiểm thử, chúng ta cần thêm test case cho authentication flow.',
  'Tôi đồng ý với đề xuất này. Chúng ta nên ưu tiên tính năng recording trước.',
  'Cảm ơn mọi người, buổi họp kết thúc tại đây.',
];

let segmentCounter = 0;

export function createTranscriptFixture(meetingId: string, count: number): TranscriptSegment[] {
  return Array.from({ length: count }, (_, i) => {
    segmentCounter++;
    const speakerIdx = i % SYNTHETIC_SPEAKERS.length;
    const textIdx = i % SYNTHETIC_TEXTS.length;
    const startMs = i * 10000;

    return {
      id: deterministicId('segment', segmentCounter),
      meetingId: meetingId as import('@kms/domain').MeetingId,
      sequence: i + 1,
      speakerId: deterministicId('speaker', speakerIdx + 1),
      language: 'vi' as const,
      text: SYNTHETIC_TEXTS[textIdx]!,
      startMs,
      endMs: startMs + 8000,
      source: 'api' as const,
      isGap: false,
      createdAt: deterministicNow().toISOString(),
    };
  });
}

// ── Windows-Safe Paths ──────────────────────────────────────────────

export function normalizePath(input: string): string {
  return input.replace(/\\/g, '/');
}

// ── Unique Namespaces ────────────────────────────────────────────────

let namespaceCounter = 0;

export function uniqueNamespace(prefix: string): string {
  namespaceCounter++;
  const sanitized = prefix.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${sanitized}-${namespaceCounter}-${Date.now()}`;
}

// ── Reset (for test isolation) ──────────────────────────────────────

export function resetCounters(): void {
  meetingCounter = 0;
  segmentCounter = 0;
  namespaceCounter = 0;
}
