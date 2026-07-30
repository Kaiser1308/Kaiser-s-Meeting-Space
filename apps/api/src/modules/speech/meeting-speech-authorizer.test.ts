import { describe, expect, it } from 'vitest';
import { buildSpeechSessionAuthorization } from './meeting-speech-authorizer.js';

describe('buildSpeechSessionAuthorization', () => {
  it('does not turn the legacy API mode into live cloud consent', () => {
    const result = buildSpeechSessionAuthorization({
      language: 'vi',
      speechMode: 'api',
      sourceIds: ['mic'],
    });

    expect(result).toEqual({
      language: 'vi',
      sourceIds: ['mic'],
      liveCloudConsented: false,
    });
  });

  it('preserves the owner-scoped source allowlist', () => {
    const result = buildSpeechSessionAuthorization({
      language: 'en',
      speechMode: 'local',
      sourceIds: ['mic', 'system'],
    });

    expect(result.sourceIds).toEqual(['mic', 'system']);
    expect(result.liveCloudConsented).toBe(false);
  });

  it('honors only an explicitly persisted granted policy', () => {
    const result = buildSpeechSessionAuthorization({
      language: 'vi',
      speechMode: 'local',
      sourceIds: ['mic'],
      policy: {
        version: 1,
        language: 'vi',
        live: 'cloud',
        final: 'local',
        cloudCheckScope: 'off',
        cloudConsent: 'granted',
      },
    });

    expect(result.liveCloudConsented).toBe(true);
  });
});
