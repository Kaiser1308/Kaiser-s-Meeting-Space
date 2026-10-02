import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { LOCAL_MODEL_CATALOG } from '../local-speech-models.js';
import { LocalModelError } from './local-model-manager.js';
import { createPinnedArtifactTransport, type FetchLike } from './local-model-transport.js';

function response(status: number, body = 'synthetic artifact', location?: string) {
  return {
    status,
    headers: { get: (name: string) => name.toLowerCase() === 'location' ? location ?? null : null },
    body: Readable.toWeb(Readable.from([Buffer.from(body)])) as ReadableStream<Uint8Array>,
  };
}

describe('pinned local model artifact transport', () => {
  const profile = LOCAL_MODEL_CATALOG.models['whisper-large-v3-turbo-q5_0'];

  it('follows one reviewed HTTPS redirect without exposing its URL', async () => {
    const fetchImpl: FetchLike = vi
      .fn()
      .mockResolvedValueOnce(response(302, '', 'https://us.aws.cdn.hf.co/pinned-artifact?token=secret'))
      .mockResolvedValueOnce(response(200));

    const result = await createPinnedArtifactTransport(fetchImpl).stream({
      profile,
      signal: new AbortController().signal,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, profile.sourceUrl, {
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://us.aws.cdn.hf.co/pinned-artifact?token=secret', {
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    });
    await expect(result.body.toArray()).resolves.toEqual([Buffer.from('synthetic artifact')]);
  });

  it('rejects a redirect to an origin outside the reviewed allowlist', async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValue(response(302, '', 'https://evil.example/artifact'));

    await expect(createPinnedArtifactTransport(fetchImpl).stream({
      profile,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'NETWORK' } satisfies Partial<LocalModelError>);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a source profile that is not pinned to an approved HTTPS origin', async () => {
    const fetchImpl: FetchLike = vi.fn();
    const unsafeProfile = { ...profile, sourceUrl: 'http://huggingface.co/unsafe.bin' };

    await expect(createPinnedArtifactTransport(fetchImpl).stream({
      profile: unsafeProfile,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'NETWORK' } satisfies Partial<LocalModelError>);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
