import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncTransport } from './sync-transport.js';
import { UploadTransportError } from '@kms/local-recovery';
import type { ClientAuth, SessionInfo } from '../../../auth/auth-client.js';

// ── Test helpers ──

function createFakeAuth(): ClientAuth {
  let accessToken = 'test-access-token';
  let session: SessionInfo = { expiresAt: Date.now() + 3600_000 };
  let refreshCallCount = 0;

  return {
    getSession: () => session,
    withAccessToken: async <T>(op: (token: string) => Promise<T>): Promise<T> => {
      return op(accessToken);
    },
    refresh: async () => {
      refreshCallCount++;
      accessToken = `refreshed-token-${refreshCallCount}`;
      session = { expiresAt: Date.now() + 3600_000 };
      return session;
    },
    beginLogin: async () => ({ url: 'https://example.com/auth', state: 'test-state' }),
    completeLogin: async () => session,
    logout: async () => {
      accessToken = '';
      session = { expiresAt: 0 };
    },
    // Internal access for test inspection
    get _refreshCount() {
      return refreshCallCount;
    },
    set _forceExpire(v: boolean) {
      if (v) {
        accessToken = 'expired-token';
        session = { expiresAt: Date.now() - 1000 };
      }
    },
  } as unknown as ClientAuth & { _refreshCount: number; _forceExpire: boolean };
}

// ── Tests ──

describe('SyncTransport', () => {
  let transport: SyncTransport;
  let auth: ReturnType<typeof createFakeAuth>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    auth = createFakeAuth();
    transport = new SyncTransport({
      baseUrl: 'https://api.example.com',
      clientAuth: auth,
      timeoutMs: 5000,
    });

    // Mock global fetch
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── T01-TC01: Successful register → upload → complete flow ──

  it('completes full register-upload-complete lifecycle', async () => {
    const meetingId = '550e8400-e29b-41d4-a716-446655440000';

    // Mock register
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chunkId: `${meetingId}/mic/0`,
          created: true,
          upload: {
            method: 'PUT',
            url: 'https://s3.example.com/audio/test/meeting/mic/0.webm',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
            requiredHeaders: { 'Content-Type': 'audio/webm' },
          },
          storageKey: 'audio/test/meeting/mic/0.webm',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    // Mock upload (presigned URL PUT)
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { ETag: 'etag-abc123' } }),
    );

    // Mock complete
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chunkId: `${meetingId}/mic/0`,
          completed: true,
          finalizedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    // 1. Register
    const reg = await transport.registerChunk(meetingId, 'mic', 0, 'a'.repeat(64), 1024);
    expect(reg.storageKey).toBe('audio/test/meeting/mic/0.webm');
    expect(reg.presignedUrl).toContain('s3.example.com');
    expect(reg.requiredHeaders['Content-Type']).toBe('audio/webm');

    // 2. Upload
    const chunkData = new Uint8Array(1024).fill(0xab);
    const uploadResult = await transport.uploadChunk(reg.storageKey, chunkData, 1024);
    expect(uploadResult.etag).toBe('etag-abc123');

    // 3. Complete
    const completeResult = await transport.completeChunk(`${meetingId}/mic/0`, 'a'.repeat(64));
    expect(completeResult.finalized).toBe(true);
  });

  // ── T01-TC02: Token expiry mid-upload → refresh → retry ──

  it('refreshes token and retries on 401', async () => {
    const meetingId = '550e8400-e29b-41d4-a716-446655440000';

    // First register call returns 401
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
    );

    // After refresh, second register call succeeds
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chunkId: `${meetingId}/mic/0`,
          created: true,
          upload: {
            method: 'PUT',
            url: 'https://s3.example.com/key',
            expiresAt: '',
            requiredHeaders: {},
          },
          storageKey: 'key',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const reg = await transport.registerChunk(meetingId, 'mic', 0, 'a'.repeat(64), 1024);
    expect(reg.storageKey).toBe('key');
    // Token should have been refreshed
    expect((auth as unknown as { _refreshCount: number })._refreshCount).toBeGreaterThan(0);
  });

  // ── T01-TC03: Duplicate/out-of-order registration (idempotency) ──

  it('handles duplicate registration idempotently', async () => {
    const meetingId = '550e8400-e29b-41d4-a716-446655440000';

    // Both calls return the same result (server idempotency)
    const response = {
      chunkId: `${meetingId}/mic/0`,
      created: false, // false = already existed
      upload: {
        method: 'PUT',
        url: 'https://s3.example.com/key',
        expiresAt: '',
        requiredHeaders: {},
      },
      storageKey: 'key',
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const reg1 = await transport.registerChunk(meetingId, 'mic', 0, 'a'.repeat(64), 1024);
    const reg2 = await transport.registerChunk(meetingId, 'mic', 0, 'a'.repeat(64), 1024);

    expect(reg1.storageKey).toBe('key');
    expect(reg2.storageKey).toBe('key');
  });

  // ── T01-TC04: Object uploaded but complete call lost (retry idempotent) ──

  it('retries complete after lost response', async () => {
    const meetingId = '550e8400-e29b-41d4-a716-446655440000';

    // First complete call fails with network error
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

    // Second complete call succeeds
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chunkId: `${meetingId}/mic/0`,
          completed: true,
          finalizedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    // First attempt fails
    await expect(transport.completeChunk(`${meetingId}/mic/0`, 'a'.repeat(64))).rejects.toThrow(
      UploadTransportError,
    );

    // Second attempt succeeds
    const result = await transport.completeChunk(`${meetingId}/mic/0`, 'a'.repeat(64));
    expect(result.finalized).toBe(true);
  });

  // ── T01-TC05: Malformed response → UploadTransportError ──

  it('throws UploadTransportError on malformed JSON response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('not json {', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await expect(
      transport.registerChunk(
        '550e8400-e29b-41d4-a716-446655440000',
        'mic',
        0,
        'a'.repeat(64),
        1024,
      ),
    ).rejects.toThrow(UploadTransportError);
  });

  // ── T01-TC06: Wrong owner (403) → UploadTransportError(SERVER_ERROR) ──

  it('throws SERVER_ERROR on 403 Forbidden', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'FORBIDDEN' } }), { status: 403 }),
    );

    try {
      await transport.registerChunk(
        '550e8400-e29b-41d4-a716-446655440000',
        'mic',
        0,
        'a'.repeat(64),
        1024,
      );
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UploadTransportError);
      expect((err as UploadTransportError).category).toBe('SERVER_ERROR');
    }
  });

  // ── T01-TC07: Network timeout → UploadTransportError(NETWORK) ──

  it('throws NETWORK error on timeout', async () => {
    // Simulate AbortError via AbortController
    fetchSpy.mockImplementationOnce(() => {
      const err = new DOMException('The operation was aborted', 'AbortError');
      return Promise.reject(err);
    });

    try {
      await transport.registerChunk(
        '550e8400-e29b-41d4-a716-446655440000',
        'mic',
        0,
        'a'.repeat(64),
        1024,
      );
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UploadTransportError);
      expect((err as UploadTransportError).category).toBe('NETWORK');
      expect((err as UploadTransportError).retryable).toBe(true);
    }
  });

  // ── T01-TC08: Checksum conflict (409) → UploadTransportError(CHECKSUM_CONFLICT) ──

  it('throws CHECKSUM_CONFLICT on 409', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'AUDIO_CHUNK_CONFLICT' } }), { status: 409 }),
    );

    try {
      await transport.completeChunk('550e8400-e29b-41d4-a716-446655440000/mic/0', 'a'.repeat(64));
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UploadTransportError);
      expect((err as UploadTransportError).category).toBe('CHECKSUM_CONFLICT');
      expect((err as UploadTransportError).retryable).toBe(false);
    }
  });

  // ── T01-TC09: Offline → UploadTransportError(NETWORK, retryable=true) ──

  it('throws retryable NETWORK error when offline', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

    try {
      await transport.registerChunk(
        '550e8400-e29b-41d4-a716-446655440000',
        'mic',
        0,
        'a'.repeat(64),
        1024,
      );
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UploadTransportError);
      expect((err as UploadTransportError).category).toBe('NETWORK');
      expect((err as UploadTransportError).retryable).toBe(true);
    }
  });

  // ── T01-TC10: getServerManifest returns correct entries ──

  it('fetches server manifest correctly', async () => {
    const meetingId = '550e8400-e29b-41d4-a716-446655440000';

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          meetingId,
          sources: [{ source: 'mic', completed: 2, total: 2, missingRanges: [] }],
          manifest: [
            {
              chunkIndex: 0,
              source: 'mic',
              sha256: 'a'.repeat(64),
              byteLength: 1024,
              storageKey: 'key0',
              uploadStatus: 'completed',
            },
            {
              chunkIndex: 1,
              source: 'mic',
              sha256: 'b'.repeat(64),
              byteLength: 2048,
              storageKey: 'key1',
              uploadStatus: 'completed',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const manifest = await transport.getServerManifest(meetingId);
    expect(manifest).toHaveLength(2);
    expect(manifest[0]!.chunkIndex).toBe(0);
    expect(manifest[0]!.uploadStatus).toBe('completed');
    expect(manifest[1]!.chunkIndex).toBe(1);
  });

  // ── T01-TC11: endMeeting idempotent ──

  it('calls endMeeting idempotently', async () => {
    const meetingId = '550e8400-e29b-41d4-a716-446655440000';

    const response1 = new Response(
      JSON.stringify({
        meetingId,
        state: 'finalizing',
        finalizedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const response2 = response1.clone();

    fetchSpy.mockResolvedValueOnce(response1);
    fetchSpy.mockResolvedValueOnce(response2);

    const result1 = await transport.endMeeting(meetingId);
    const result2 = await transport.endMeeting(meetingId);

    expect(result1.state).toBe('finalizing');
    expect(result2.state).toBe('finalizing');
    expect(result1.meetingId).toBe(meetingId);
    expect(result2.meetingId).toBe(meetingId);
  });

  // ── T01-TC12: Upload without registration → error ──

  it('fails upload when chunk was not registered', async () => {
    const data = new Uint8Array(1024);

    await expect(transport.uploadChunk('unknown-key', data, 1024)).rejects.toThrow(
      'not registered',
    );
  });

  // ── T01-TC13: Server 500 → retryable SERVER_ERROR ──

  it('throws retryable SERVER_ERROR on 500', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));

    try {
      await transport.registerChunk(
        '550e8400-e29b-41d4-a716-446655440000',
        'mic',
        0,
        'a'.repeat(64),
        1024,
      );
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UploadTransportError);
      expect((err as UploadTransportError).category).toBe('SERVER_ERROR');
      expect((err as UploadTransportError).retryable).toBe(true);
    }
  });
});
