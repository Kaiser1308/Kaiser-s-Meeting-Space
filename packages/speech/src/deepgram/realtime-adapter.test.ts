import { describe, it, expect, beforeEach } from 'vitest';
import { createMockDeepgramAdapter, type DeepgramRealtimeAdapter } from './realtime-adapter.js';

const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000';
const OWNER_ID = 'owner-test';

function makeToken(ownerId: string, meetingId: string): string {
  return `brokered-${ownerId}-${meetingId}-${Date.now()}`;
}

describe('createMockDeepgramAdapter', () => {
  let adapter: DeepgramRealtimeAdapter;

  beforeEach(() => {
    adapter = createMockDeepgramAdapter();
  });

  describe('connect', () => {
    it('resolves immediately', async () => {
      await expect(
        adapter.connect({
          language: 'vi',
          diarization: false,
          brokeredToken: makeToken(OWNER_ID, MEETING_ID),
        }),
      ).resolves.toBeUndefined();
    });

    it('resets closed state on reconnect', async () => {
      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });
      await adapter.close();
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));
      adapter.sendAudio(new Uint8Array([1]));
      expect(events).toHaveLength(0);

      await adapter.connect({
        language: 'en',
        diarization: true,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });
      adapter.sendAudio(new Uint8Array([2]));
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('sendAudio', () => {
    it('triggers interim then final_segment via callback', async () => {
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));

      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      adapter.sendAudio(new Uint8Array([1, 2, 3]));

      const interim = events.find((e: any) => e.kind === 'interim');
      const final = events.find((e: any) => e.kind === 'final_segment');
      const speaker = events.find((e: any) => e.kind === 'speaker_update');

      expect(interim).toBeDefined();
      expect(final).toBeDefined();
      expect(speaker).toBeDefined();
    });

    it('includes the language in mock text', async () => {
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));

      await adapter.connect({
        language: 'en',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      adapter.sendAudio(new Uint8Array([1]));

      const interim = events.find((e: any) => e.kind === 'interim') as any;
      const final = events.find((e: any) => e.kind === 'final_segment') as any;

      expect(interim.payload.text).toContain('[mock interim en]');
      expect(final.payload.text).toContain('[mock final en]');
    });

    it('increments sequenceInPart across multiple sendAudio calls', async () => {
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));

      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      adapter.sendAudio(new Uint8Array([1]));
      adapter.sendAudio(new Uint8Array([2]));

      const firstFinal = events.find(
        (e: any) => e.kind === 'final_segment' && e.sequenceInPart === 0,
      );
      const secondFinal = events.find(
        (e: any) => e.kind === 'final_segment' && e.sequenceInPart === 1,
      );

      expect(firstFinal).toBeDefined();
      expect(secondFinal).toBeDefined();
    });
  });

  describe('speaker_update events', () => {
    it('emits speaker_update with speaker-0 and Speaker 1 label', async () => {
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));

      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      adapter.sendAudio(new Uint8Array([1]));

      const speaker = events.find((e: any) => e.kind === 'speaker_update') as any;
      expect(speaker).toBeDefined();
      expect(speaker.payload.speakerId).toBe('speaker-0');
      expect(speaker.payload.label).toBe('Speaker 1');
    });
  });

  describe('close', () => {
    it('prevents further events after close', async () => {
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));

      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      adapter.sendAudio(new Uint8Array([1]));
      const countAfterFirst = events.length;
      expect(countAfterFirst).toBeGreaterThan(0);

      await adapter.close();

      adapter.sendAudio(new Uint8Array([1]));
      expect(events.length).toBe(countAfterFirst);
    });

    it('resolve close even if not connected', async () => {
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('sendAudio before connect', () => {
    it('does not emit events when not connected', () => {
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));

      adapter.sendAudio(new Uint8Array([1]));
      expect(events).toHaveLength(0);
    });
  });

  describe('provider', () => {
    it('every event has provider deepgram', async () => {
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));

      await adapter.connect({
        language: 'en',
        diarization: true,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      adapter.sendAudio(new Uint8Array([1]));

      expect(events.length).toBeGreaterThan(0);
      for (const event of events as any[]) {
        expect(event.provider).toBe('deepgram');
      }
    });

    it('every event has isSimulated true', async () => {
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));

      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      adapter.sendAudio(new Uint8Array([1]));

      expect(events.length).toBeGreaterThan(0);
      for (const event of events as any[]) {
        expect(event.isSimulated).toBe(true);
      }
    });
  });

  describe('owner isolation', () => {
    it('events from adapter A carry ownerId A, not B', async () => {
      const eventsA: unknown[] = [];
      const eventsB: unknown[] = [];

      const adapterA = createMockDeepgramAdapter();
      const adapterB = createMockDeepgramAdapter();

      const ownerA = 'owner-alpha';
      const ownerB = 'owner-beta';

      adapterA.onEvent((e) => eventsA.push(e));
      adapterB.onEvent((e) => eventsB.push(e));

      await adapterA.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(ownerA, MEETING_ID),
      });

      await adapterB.connect({
        language: 'en',
        diarization: false,
        brokeredToken: makeToken(ownerB, MEETING_ID),
      });

      adapterA.sendAudio(new Uint8Array([1]));
      adapterB.sendAudio(new Uint8Array([1]));

      expect(eventsA.length).toBeGreaterThan(0);
      expect(eventsB.length).toBeGreaterThan(0);

      for (const event of eventsA as any[]) {
        expect(event.ownerId).toBe(ownerA);
      }
      for (const event of eventsB as any[]) {
        expect(event.ownerId).toBe(ownerB);
      }
    });

    it('events from adapter A carry meetingId A', async () => {
      const eventsA: unknown[] = [];
      const meetingA = '550e8400-e29b-41d4-a716-446655440001';
      const meetingB = '550e8400-e29b-41d4-a716-446655440002';

      const adapterA = createMockDeepgramAdapter();

      adapterA.onEvent((e) => eventsA.push(e));

      await adapterA.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, meetingA),
      });

      adapterA.sendAudio(new Uint8Array([1]));

      for (const event of eventsA as any[]) {
        expect(event.meetingId).toBe(meetingA);
      }

      await adapterA.close();
      await adapterA.connect({
        language: 'en',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, meetingB),
      });

      const eventsAfterReconnect: unknown[] = [];
      adapterA.onEvent((e) => eventsAfterReconnect.push(e));
      adapterA.sendAudio(new Uint8Array([2]));

      for (const event of eventsAfterReconnect as any[]) {
        expect(event.meetingId).toBe(meetingB);
      }
    });
  });

  describe('onEvent', () => {
    it('returns an unsubscribe function', async () => {
      const events: unknown[] = [];
      const unsub = adapter.onEvent((e) => events.push(e));

      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      unsub();

      adapter.sendAudio(new Uint8Array([1]));
      expect(events).toHaveLength(0);
    });

    it('supports multiple listeners', async () => {
      const events1: unknown[] = [];
      const events2: unknown[] = [];

      adapter.onEvent((e) => events1.push(e));
      adapter.onEvent((e) => events2.push(e));

      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      adapter.sendAudio(new Uint8Array([1]));

      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBeGreaterThan(0);
      expect(events1).toEqual(events2);
    });

    it('unsubscribing one listener does not affect others', async () => {
      const events1: unknown[] = [];
      const events2: unknown[] = [];

      const unsub1 = adapter.onEvent((e) => events1.push(e));
      adapter.onEvent((e) => events2.push(e));

      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      unsub1();

      adapter.sendAudio(new Uint8Array([1]));

      expect(events1).toHaveLength(0);
      expect(events2.length).toBeGreaterThan(0);
    });

    it('no-op when adding same callback twice and unsubscribing once', async () => {
      const events: unknown[] = [];
      const cb = (e: unknown) => events.push(e);

      adapter.onEvent(cb);
      adapter.onEvent(cb);
      const unsub = adapter.onEvent(cb);

      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      unsub();

      adapter.sendAudio(new Uint8Array([1]));

      // The same callback function is deduplicated by Set, so removing it once
      // removes it entirely
      expect(events).toHaveLength(0);
    });
  });

  describe('payload shapes', () => {
    it('interim payload has text, startMs, endMs', async () => {
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));

      await adapter.connect({
        language: 'vi',
        diarization: false,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      adapter.sendAudio(new Uint8Array([1]));

      const interim = events.find((e: any) => e.kind === 'interim') as any;
      expect(interim.payload.text).toBeDefined();
      expect(interim.payload.startMs).toBeGreaterThanOrEqual(0);
      expect(interim.payload.endMs).toBeGreaterThan(interim.payload.startMs);
    });

    it('final_segment payload has speakerId, sequenceInPart', async () => {
      const events: unknown[] = [];
      adapter.onEvent((e) => events.push(e));

      await adapter.connect({
        language: 'en',
        diarization: true,
        brokeredToken: makeToken(OWNER_ID, MEETING_ID),
      });

      adapter.sendAudio(new Uint8Array([1]));

      const final = events.find((e: any) => e.kind === 'final_segment') as any;
      expect(final.payload.speakerId).toBe('speaker-0');
      expect(final.payload.sequenceInPart).toBeGreaterThanOrEqual(0);
    });
  });
});
