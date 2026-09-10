import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
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
      getItem: vi.fn((key: string) => memoryStore[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        memoryStore[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete memoryStore[key];
      }),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves and retrieves transcript segments for a meeting ID', () => {
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

  it('supports injected custom StorageLike interface', () => {
    const customStore: Record<string, string> = {};
    const customStorage: StorageLike = {
      getItem: vi.fn((k: string) => customStore[k] ?? null),
      setItem: vi.fn((k: string, v: string) => {
        customStore[k] = v;
      }),
      removeItem: vi.fn((k: string) => {
        delete customStore[k];
      }),
    };

    saveTranscript(meetingId, mockSegments, customStorage);
    expect(customStorage.setItem).toHaveBeenCalledWith(
      `kms_transcript_${meetingId}`,
      JSON.stringify(mockSegments),
    );

    const retrieved = getTranscript(meetingId, customStorage);
    expect(customStorage.getItem).toHaveBeenCalledWith(`kms_transcript_${meetingId}`);
    expect(retrieved).toEqual(mockSegments);

    clearTranscript(meetingId, customStorage);
    expect(customStorage.removeItem).toHaveBeenCalledWith(`kms_transcript_${meetingId}`);
  });

  it('safely falls back to window.localStorage when customStorage is not provided', () => {
    const windowStore: Record<string, string> = {};
    const mockLocalStorage: StorageLike = {
      getItem: vi.fn((key: string) => windowStore[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        windowStore[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete windowStore[key];
      }),
    };

    vi.stubGlobal('window', { localStorage: mockLocalStorage });

    saveTranscript(meetingId, mockSegments);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      `kms_transcript_${meetingId}`,
      JSON.stringify(mockSegments),
    );

    const retrieved = getTranscript(meetingId);
    expect(mockLocalStorage.getItem).toHaveBeenCalledWith(`kms_transcript_${meetingId}`);
    expect(retrieved).toEqual(mockSegments);

    clearTranscript(meetingId);
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(`kms_transcript_${meetingId}`);
    expect(getTranscript(meetingId)).toBeNull();
  });
});
