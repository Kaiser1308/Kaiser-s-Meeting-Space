import { describe, expect, it } from 'vitest';
import type { MeetingId } from '@kms/domain';
import type { DeepgramLiveAdapter } from './live-adapter.js';
import { createDeepgramSessionClient } from './session-client.js';

const meetingId = '11111111-1111-4111-8111-111111111111' as MeetingId;

function fakeAdapter() {
  const calls: unknown[] = [];
  const adapter: DeepgramLiveAdapter = {
    connect: async (config) => {
      calls.push(config);
    },
    sendAudio: () => undefined,
    onEvent: () => () => undefined,
    close: async () => undefined,
  };
  return { adapter, calls };
}

describe('createDeepgramSessionClient', () => {
  it('requests an owner-scoped session and connects the brokered token', async () => {
    const { adapter, calls } = fakeAdapter();
    let request: Request | undefined;
    const client = createDeepgramSessionClient({
      apiBaseUrl: 'https://api.example.test',
      ownerId: 'owner-1',
      meetingId,
      sourceId: 'source-1',
      runId: 'run-1',
      partId: 'part-1',
      language: 'vi',
      diarization: true,
      fetchImpl: async (input, init) => {
        request = new Request(input, init);
        return new Response(
          JSON.stringify({
            token: 'temporary-token',
            meetingId,
            provider: 'deepgram',
            expiresAt: '2026-07-28T01:00:00.000Z',
            config: { language: 'vi', diarization: true, model: 'nova-3' },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      },
      adapterFactory: () => adapter,
    });

    const result = await client.connect();

    expect(request?.url).toBe('https://api.example.test/v1/meetings/11111111-1111-4111-8111-111111111111/speech-sessions');
    expect(request?.method).toBe('POST');
    expect(await request?.json()).toEqual({ language: 'vi', sourceId: 'source-1', diarization: true });
    expect(calls[0]).toMatchObject({
      ownerId: 'owner-1',
      meetingId,
      runId: 'run-1',
      partId: 'part-1',
      language: 'vi',
      brokeredToken: 'temporary-token',
      model: 'nova-3',
    });
    expect(result.expiresAt).toBe('2026-07-28T01:00:00.000Z');
  });

  it('maps provider response failures without leaking token or body', async () => {
    const { adapter } = fakeAdapter();
    const client = createDeepgramSessionClient({
      apiBaseUrl: 'https://api.example.test/',
      ownerId: 'owner-1',
      meetingId,
      sourceId: 'source-1',
      runId: 'run-1',
      partId: 'part-1',
      language: 'en',
      diarization: false,
      fetchImpl: async () => new Response('temporary-token provider body', { status: 503 }),
      adapterFactory: () => adapter,
    });

    await expect(client.connect()).rejects.toThrow('Deepgram session unavailable');
    await expect(client.connect()).rejects.not.toThrow('temporary-token');
  });
});
