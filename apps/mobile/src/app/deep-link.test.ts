import { describe, it, expect } from 'vitest';
import { parseDeepLink } from './deep-link';

describe('deep-link parser', () => {
  it('should parse oauth_callback deep link', () => {
    const result = parseDeepLink('kms://oauth/callback?code=abc123&state=xyz&nonce=456');
    expect(result).toEqual({
      kind: 'oauth_callback',
      code: 'abc123',
      state: 'xyz',
      nonce: '456',
    });
  });

  it('should parse oauth_callback without nonce', () => {
    const result = parseDeepLink('kms://oauth/callback?code=abc123&state=xyz');
    expect(result).toEqual({
      kind: 'oauth_callback',
      code: 'abc123',
      state: 'xyz',
    });
  });

  it('should parse open meeting_setup deep link', () => {
    const result = parseDeepLink('kms://open?surface=meeting_setup');
    expect(result).toEqual({
      kind: 'open',
      surface: 'meeting_setup',
    });
  });

  it('should parse open library deep link', () => {
    const result = parseDeepLink('kms://open?surface=library');
    expect(result).toEqual({
      kind: 'open',
      surface: 'library',
    });
  });

  it('should return unknown for unknown scheme', () => {
    const result = parseDeepLink('http://example.com');
    expect(result).toEqual({ kind: 'unknown' });
  });

  it('should return unknown for malformed url', () => {
    const result = parseDeepLink('not a url');
    expect(result).toEqual({ kind: 'unknown' });
  });

  it('should reject deep links that bypass start-flow steps', () => {
    const result = parseDeepLink('kms://start?step=language');
    expect(result).toEqual({ kind: 'rejected' });
  });

  it('should reject deep links that set arbitrary steps', () => {
    const result = parseDeepLink('kms://flow?step=title');
    expect(result).toEqual({ kind: 'rejected' });
  });

  it('should reject deep links with invalid oauth path', () => {
    const result = parseDeepLink('kms://oauth/invalid');
    expect(result).toEqual({ kind: 'rejected' });
  });

  it('should handle oauth_callback with missing required params', () => {
    const result = parseDeepLink('kms://oauth/callback?code=abc');
    expect(result).toEqual({ kind: 'unknown' });
  });
});
