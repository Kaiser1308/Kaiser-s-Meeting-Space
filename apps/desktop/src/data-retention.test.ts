import { describe, expect, it } from 'vitest';
import { saveTranscript, getTranscript, type StorageLike } from './transcript-storage.js';
import type { TranscriptSegment } from './transcription-workflow.js';

describe('data retention across application restarts', () => {
  const createDiskStorage = (persistentDisk: Record<string, string>): StorageLike => ({
    getItem: (k: string) => persistentDisk[k] ?? null,
    setItem: (k: string, v: string) => {
      persistentDisk[k] = v;
    },
    removeItem: (k: string) => {
      delete persistentDisk[k];
    },
  });

  it('preserves meeting transcripts across simulated session restarts', () => {
    // Simulated persistent disk storage
    const persistentDisk: Record<string, string> = {};

    const session1Storage = createDiskStorage(persistentDisk);
    const meeting1Id = '11111111-1111-4111-8111-111111111111';
    const meeting2Id = '22222222-2222-4222-8222-222222222222';

    const segments1: TranscriptSegment[] = [
      { startMs: 0, endMs: 2000, text: 'Session 1 transcript segment.', speaker: 'Speaker 1' },
    ];
    const segments2: TranscriptSegment[] = [
      { startMs: 0, endMs: 3000, text: 'Session 2 transcript segment.', speaker: 'Speaker A' },
      { startMs: 3500, endMs: 6000, text: 'Second speaker comment.', speaker: 'Speaker B' },
    ];

    // Session 1 writes data
    saveTranscript(meeting1Id, segments1, session1Storage);
    saveTranscript(meeting2Id, segments2, session1Storage);

    // Simulate complete application exit and restart: new session storage instance
    const session2Storage = createDiskStorage(persistentDisk);

    // Session 2 reads data
    const reloadedMeeting1 = getTranscript(meeting1Id, session2Storage);
    const reloadedMeeting2 = getTranscript(meeting2Id, session2Storage);

    expect(reloadedMeeting1).toEqual(segments1);
    expect(reloadedMeeting2).toEqual(segments2);
  });

  it('isolates multiple meetings without cross-corruption', () => {
    const persistentDisk: Record<string, string> = {};
    const storage = createDiskStorage(persistentDisk);

    const meetingAlphaId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const meetingBetaId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    const alphaInitial: TranscriptSegment[] = [
      { startMs: 0, endMs: 1500, text: 'Alpha initial segment' },
    ];
    const betaInitial: TranscriptSegment[] = [
      { startMs: 0, endMs: 2500, text: 'Beta initial segment' },
    ];

    saveTranscript(meetingAlphaId, alphaInitial, storage);
    saveTranscript(meetingBetaId, betaInitial, storage);

    // Updating meeting Alpha with additional segments
    const alphaUpdated: TranscriptSegment[] = [
      ...alphaInitial,
      { startMs: 2000, endMs: 4000, text: 'Alpha second segment' },
    ];
    saveTranscript(meetingAlphaId, alphaUpdated, storage);

    // Meeting Beta must remain untouched
    const retrievedBeta = getTranscript(meetingBetaId, storage);
    expect(retrievedBeta).toEqual(betaInitial);

    // Meeting Alpha has the updated segments
    const retrievedAlpha = getTranscript(meetingAlphaId, storage);
    expect(retrievedAlpha).toEqual(alphaUpdated);
  });

  it('guarantees immutability: mutating retrieved transcript segments does not alter the underlying stored record', () => {
    const persistentDisk: Record<string, string> = {};
    const storage = createDiskStorage(persistentDisk);

    const meetingId = '33333333-3333-4333-8333-333333333333';
    const original: TranscriptSegment[] = [
      { startMs: 0, endMs: 1000, text: 'Immutable original.', speaker: 'Alice' },
    ];

    saveTranscript(meetingId, original, storage);

    // Retrieve and attempt mutation of existing segment properties
    const retrieved = getTranscript(meetingId, storage)!;
    expect(retrieved).toBeDefined();
    expect(retrieved[0]).toBeDefined();
    retrieved[0]!.text = 'Mutated text attempt!';
    retrieved[0]!.startMs = 99999;
    retrieved.push({ startMs: 100000, endMs: 105000, text: 'Injected segment' });

    // Re-fetch should yield original unmutated segments
    const secondFetch = getTranscript(meetingId, storage)!;
    expect(secondFetch).toEqual(original);
    expect(secondFetch[0]!.text).toBe('Immutable original.');
    expect(secondFetch[0]!.startMs).toBe(0);
    expect(secondFetch).toHaveLength(1);
  });

  it('handles corrupted storage entries safely returning null instead of throwing', () => {
    const persistentDisk: Record<string, string> = {};
    const storage = createDiskStorage(persistentDisk);

    const corruptJsonId = '44444444-4444-4444-8444-444444444444';
    const nonArrayJsonId = '55555555-5555-4555-8555-555555555555';
    const emptyStringId = '66666666-6666-4666-8666-666666666666';

    // Store malformed JSON syntax
    persistentDisk[`kms_transcript_${corruptJsonId}`] = '{"text": [unparseable';

    // Store valid JSON that is not an array
    persistentDisk[`kms_transcript_${nonArrayJsonId}`] = JSON.stringify({
      error: 'not an array',
      data: 123,
    });

    // Store empty string
    persistentDisk[`kms_transcript_${emptyStringId}`] = '';

    expect(() => getTranscript(corruptJsonId, storage)).not.toThrow();
    expect(getTranscript(corruptJsonId, storage)).toBeNull();

    expect(() => getTranscript(nonArrayJsonId, storage)).not.toThrow();
    expect(getTranscript(nonArrayJsonId, storage)).toBeNull();

    expect(() => getTranscript(emptyStringId, storage)).not.toThrow();
    expect(getTranscript(emptyStringId, storage)).toBeNull();
  });
});
