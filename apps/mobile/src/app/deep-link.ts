export type DeepLinkIntent =
  | { kind: 'oauth_callback'; code: string; state: string; nonce?: string }
  | { kind: 'open'; surface: 'meeting_setup' | 'library' }
  | { kind: 'unknown' }
  | { kind: 'rejected' };

export function parseDeepLink(url: string): DeepLinkIntent {
  try {
    const parsed = new URL(url);
    const isNativeCallback = parsed.protocol === 'kms:';
    const isExpoGoCallback = parsed.protocol === 'exp:' && parsed.pathname.endsWith('/--/oauth/callback');
    if (isNativeCallback && parsed.host === 'open' && (parsed.pathname === '' || parsed.pathname === '/')) {
      const surface = parsed.searchParams.get('surface');
      if (surface === 'meeting_setup' || surface === 'library') return { kind: 'open', surface };
      return { kind: 'unknown' };
    }
    if (!isNativeCallback && !isExpoGoCallback) return { kind: 'unknown' };

    const fullPath = isExpoGoCallback ? '/oauth/callback' : `${parsed.pathname || `/${parsed.host}`}`;

    if (
      fullPath === '/callback' ||
      fullPath === '/oauth/callback' ||
      fullPath === '/callback/' ||
      fullPath === '/oauth/callback/'
    ) {
      const code = parsed.searchParams.get('code') || '';
      const state = parsed.searchParams.get('state') || '';
      const nonce = parsed.searchParams.get('nonce') || undefined;

      if (code && state) {
        return {
          kind: 'oauth_callback',
          code,
          state,
          nonce: nonce || undefined,
        };
      }
      return { kind: 'unknown' };
    }

    return { kind: 'rejected' };
  } catch {
    return { kind: 'unknown' };
  }
}
