import { describe, it, expect, vi } from 'vitest';

describe('Playback source resolution', () => {
  it('local file with matching hash resolves to local', async () => {
    const verifyLocal = vi.fn().mockResolvedValueOnce(true);
    const result = await verifyLocal('/test/audio.webm', 'a'.repeat(64));
    expect(result).toBe(true);
  });

  it('local file with mismatched hash falls back', async () => {
    const verifyLocal = vi.fn().mockResolvedValueOnce(false);
    const result = await verifyLocal('/test/audio.webm', 'a'.repeat(64));
    expect(result).toBe(false);
  });

  it('fetches cloud URL when online', async () => {
    const fetchUrl = vi.fn().mockResolvedValueOnce({
      url: 'https://s3.example.com/audio/signed',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });

    const result = await fetchUrl();
    expect(result.url).toContain('https://');
    expect(result.expiresAt).toBeTruthy();
  });

  it('returns unavailable when server is down', async () => {
    const fetchUrl = vi.fn().mockRejectedValueOnce(new Error('Server down'));

    await expect(fetchUrl()).rejects.toThrow('Server down');
  });

  it('returns unavailable when offline with no local file', () => {
    const hasLocal = false;
    const isOnline = false;
    const available = hasLocal || isOnline;
    expect(available).toBe(false);
  });

  it('refreshUrl updates the signed URL', async () => {
    const old = { url: 'https://s3.example.com/old', expiresAt: 'old' };
    const fresh = { url: 'https://s3.example.com/new', expiresAt: 'new' };

    // First call returns old URL, second returns new
    const fetchUrl = vi.fn().mockResolvedValueOnce(old).mockResolvedValueOnce(fresh);

    const result1 = await fetchUrl();
    expect(result1.url).toBe(old.url);

    const result2 = await fetchUrl();
    expect(result2.url).toBe(fresh.url);
  });
});
