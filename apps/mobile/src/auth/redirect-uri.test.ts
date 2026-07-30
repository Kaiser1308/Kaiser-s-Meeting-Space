import { describe, expect, it } from 'vitest';
import { createAuthRedirectUri } from './redirect-uri';

describe('auth redirect URI', () => {
  it('uses the two-slash custom-scheme callback form', () => {
    expect(createAuthRedirectUri((path) => `kms://${path}`)).toBe('kms://oauth/callback');
  });
});
