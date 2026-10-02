import { Readable } from 'node:stream';
import { LOCAL_MODEL_ALLOWED_HTTPS_ORIGINS, type LocalModelProfileV1 } from '../local-speech-models.js';
import { LocalModelError, type ArtifactTransport } from './local-model-manager.js';

export interface FetchResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}

export type FetchLike = (
  input: string,
  init: { redirect: 'manual'; signal: AbortSignal },
) => Promise<FetchResponseLike>;

function isApprovedArtifactUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && LOCAL_MODEL_ALLOWED_HTTPS_ORIGINS.includes(
      url.origin as (typeof LOCAL_MODEL_ALLOWED_HTTPS_ORIGINS)[number],
    );
  } catch {
    return false;
  }
}

async function fetchArtifact(
  fetchImpl: FetchLike,
  url: string,
  signal: AbortSignal,
): Promise<FetchResponseLike> {
  if (!isApprovedArtifactUrl(url)) {
    throw new LocalModelError('NETWORK', 'Model download is unavailable');
  }
  const response = await fetchImpl(url, { redirect: 'manual', signal });
  if (response.status === 200 && response.body) return response;
  if (response.status < 300 || response.status > 399) {
    throw new LocalModelError('NETWORK', 'Model download is unavailable');
  }
  const location = response.headers.get('location');
  if (!location || !isApprovedArtifactUrl(location)) {
    throw new LocalModelError('NETWORK', 'Model download is unavailable');
  }
  const redirected = await fetchImpl(location, { redirect: 'manual', signal });
  if (redirected.status !== 200 || !redirected.body) {
    throw new LocalModelError('NETWORK', 'Model download is unavailable');
  }
  return redirected;
}

export function createPinnedArtifactTransport(fetchImpl: FetchLike = fetch): ArtifactTransport {
  return {
    async stream({ profile, signal }: { profile: LocalModelProfileV1; signal: AbortSignal }) {
      const response = await fetchArtifact(fetchImpl, profile.sourceUrl, signal);
      return {
        body: Readable.fromWeb(response.body! as unknown as import('node:stream/web').ReadableStream),
        status: response.status,
      };
    },
  };
}
