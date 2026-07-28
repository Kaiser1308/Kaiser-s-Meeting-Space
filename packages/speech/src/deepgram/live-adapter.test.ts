import { describe, expect, it } from 'vitest';
import type { MeetingId } from '@kms/domain';
import { createDeepgramLiveAdapter, type DeepgramSocket } from './live-adapter.js';

const meetingId = '11111111-1111-4111-8111-111111111111' as MeetingId;

class FakeSocket implements DeepgramSocket {
  readonly sent: Array<string | Uint8Array> = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  send(data: string | Uint8Array) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }
}

describe('createDeepgramLiveAdapter', () => {
  it('opens a token-authenticated vi listen stream with fixed raw-audio settings', async () => {
    const socket = new FakeSocket();
    let url = '';
    let protocols: string[] | undefined;
    const adapter = createDeepgramLiveAdapter((nextUrl, nextProtocols) => {
      url = nextUrl;
      protocols = nextProtocols;
      return socket;
    });

    const connected = adapter.connect({
      ownerId: 'owner-1',
      meetingId,
      runId: 'run-1',
      partId: 'part-1',
      language: 'vi',
      diarization: true,
      brokeredToken: 'temporary-token',
    });
    socket.onopen?.();
    await connected;

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('wss://api.deepgram.com/v1/listen');
    expect(parsed.searchParams.get('language')).toBe('vi');
    expect(parsed.searchParams.get('model')).toBe('nova-3');
    expect(parsed.searchParams.get('encoding')).toBe('linear16');
    expect(parsed.searchParams.get('sample_rate')).toBe('16000');
    expect(parsed.searchParams.get('channels')).toBe('1');
    expect(parsed.searchParams.get('interim_results')).toBe('true');
    expect(parsed.searchParams.get('diarize')).toBe('true');
    expect(protocols).toEqual(['token', 'temporary-token']);
  });

  it('normalizes a final Deepgram result without exposing raw payloads', async () => {
    const socket = new FakeSocket();
    const adapter = createDeepgramLiveAdapter(() => socket);
    const events: any[] = [];
    adapter.onEvent((event) => events.push(event));
    const connected = adapter.connect({
      ownerId: 'owner-1',
      meetingId,
      runId: 'run-1',
      partId: 'part-1',
      language: 'en',
      diarization: true,
      brokeredToken: 'temporary-token',
    });
    socket.onopen?.();
    await connected;

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'Results',
        request_id: 'provider-request-1',
        is_final: true,
        channel: {
          alternatives: [
            {
              transcript: 'hello team',
              confidence: 0.98,
              words: [{ word: 'hello', start: 1.2, end: 1.8, speaker: 2 }],
            },
          ],
        },
        start: 1.2,
        duration: 0.6,
      }),
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'final_segment',
      meetingId,
      ownerId: 'owner-1',
      runId: 'run-1',
      partId: 'part-1',
      provider: 'deepgram',
      providerEventId: 'provider-request-1',
      isSimulated: false,
      payload: {
        text: 'hello team',
        speakerId: 'speaker-2',
        startMs: 1200,
        endMs: 1800,
        confidence: 0.98,
        sequenceInPart: 0,
      },
    });
    expect(JSON.stringify(events[0])).not.toContain('alternatives');
  });

  it('sends audio and closes with a provider flush message', async () => {
    const socket = new FakeSocket();
    const adapter = createDeepgramLiveAdapter(() => socket);
    const connected = adapter.connect({
      ownerId: 'owner-1',
      meetingId,
      runId: 'run-1',
      partId: 'part-1',
      language: 'en',
      diarization: false,
      brokeredToken: 'temporary-token',
    });
    socket.onopen?.();
    await connected;

    const chunk = new Uint8Array([1, 2, 3]);
    adapter.sendAudio(chunk);
    await adapter.close();

    expect(socket.sent[0]).toBe(chunk);
    expect(socket.sent[1]).toBe(JSON.stringify({ type: 'Finalize' }));
    expect(socket.closed).toBe(true);
  });
});
