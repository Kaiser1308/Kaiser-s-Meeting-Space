export interface DeepgramGrant {
  accessToken: string;
  expiresIn: number;
}

export async function createDeepgramGrant(
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<DeepgramGrant> {
  if (!apiKey) {
    throw new Error('Deepgram is not configured');
  }

  const response = await fetchImpl('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error('Deepgram token request failed');
  }

  const payload = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (
    typeof payload.access_token !== 'string' ||
    typeof payload.expires_in !== 'number' ||
    !Number.isFinite(payload.expires_in) ||
    payload.expires_in <= 0
  ) {
    throw new Error('Deepgram token response invalid');
  }

  return { accessToken: payload.access_token, expiresIn: payload.expires_in };
}
