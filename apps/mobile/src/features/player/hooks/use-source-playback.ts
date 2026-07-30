import { useState, useCallback } from 'react';

export type PlaybackSource = 'local' | 'cloud' | 'unavailable';

export interface PlaybackState {
  source: PlaybackSource;
  url: string | null;
  urlExpiresAt: string | null;
  localValid: boolean;
  localPath: string | null;
  localHashMatch: boolean;
  loading: boolean;
  error: string | null;
}

export function useSourcePlayback(deps: {
  localFilePath: string | null;
  expectedSha256: string | null;
  verifyLocalFile: (path: string, hash: string) => Promise<boolean>;
  fetchPlaybackUrl: () => Promise<{ url: string; expiresAt: string }>;
  isOnline: boolean;
}) {
  const [state, setState] = useState<PlaybackState>({
    source: 'unavailable',
    url: null,
    urlExpiresAt: null,
    localValid: false,
    localPath: deps.localFilePath,
    localHashMatch: false,
    loading: true,
    error: null,
  });

  const resolveSource = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      // Prefer local file when available and valid
      if (deps.localFilePath && deps.expectedSha256) {
        try {
          const valid = await deps.verifyLocalFile(deps.localFilePath, deps.expectedSha256);
          if (valid) {
            setState((s) => ({
              ...s,
              source: 'local',
              localValid: true,
              localHashMatch: true,
              loading: false,
            }));
            return;
          }
        } catch {
          // Local verification failed — fall through to cloud
        }
      }

      // Fall back to cloud URL when online
      if (deps.isOnline) {
        try {
          const result = await deps.fetchPlaybackUrl();
          setState((s) => ({
            ...s,
            source: 'cloud',
            url: result.url,
            urlExpiresAt: result.expiresAt,
            loading: false,
          }));
          return;
        } catch (err) {
          setState((s) => ({
            ...s,
            source: 'unavailable',
            loading: false,
            error: `Cloud playback unavailable: ${String(err)}`,
          }));
          return;
        }
      }

      // Neither local nor cloud available
      setState((s) => ({
        ...s,
        source: 'unavailable',
        loading: false,
        error: 'No playback source available',
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        source: 'unavailable',
        loading: false,
        error: String(err),
      }));
    }
  }, [
    deps.localFilePath,
    deps.expectedSha256,
    deps.verifyLocalFile,
    deps.fetchPlaybackUrl,
    deps.isOnline,
  ]);

  const refreshUrl = useCallback(async () => {
    if (!deps.isOnline) return;
    try {
      const result = await deps.fetchPlaybackUrl();
      setState((s) => ({
        ...s,
        url: result.url,
        urlExpiresAt: result.expiresAt,
      }));
    } catch (err) {
      setState((s) => ({ ...s, error: `URL refresh failed: ${String(err)}` }));
    }
  }, [deps.fetchPlaybackUrl, deps.isOnline]);

  return { ...state, resolveSource, refreshUrl };
}
