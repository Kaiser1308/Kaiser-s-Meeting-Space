import { describe, expect, it, vi } from 'vitest';
import { createDeepgramGrant } from './deepgram-grant.js';

describe('createDeepgramGrant', () => {
  it('requests a short-lived Deepgram token without exposing the API key', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'temporary-token', expires_in: 30 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await createDeepgramGrant('server-secret', fetchImpl);

    expect(result).toEqual({ accessToken: 'temporary-token', expiresIn: 30 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.deepgram.com/v1/auth/grant',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Token server-secret' },
      }),
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('temporary-token');
  });

  it('fails closed when the server key is missing', async () => {
    await expect(createDeepgramGrant(undefined, vi.fn())).rejects.toThrow(
      'Deepgram is not configured',
    );
  });

  it('maps provider failures to a content-free error', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('provider detail must not escape', { status: 403 }));

    await expect(createDeepgramGrant('server-secret', fetchImpl)).rejects.toThrow(
      'Deepgram token request failed',
    );
  });
});
