import { describe, expect, it } from 'vitest';
import { parseWindowsTestCliArgs } from './windows-test-cli.mjs';

describe('Windows test selector CLI', () => {
  it('parses exactly one profile and duration pair', () => {
    expect(parseWindowsTestCliArgs(['--profile', 'simulator-full', '--duration', '5m'])).toEqual({
      profile: 'simulator-full',
      duration: '5m',
    });
  });

  it('parses the explicit online headset profile', () => {
    expect(parseWindowsTestCliArgs(['--profile', 'online-headset-full', '--duration', '5m']))
      .toEqual({ profile: 'online-headset-full', duration: '5m' });
  });

  it.each([
    [],
    ['--profile'],
    ['--profile', 'simulator-full'],
    ['--profile', 'simulator-full', '--duration'],
    ['--profile', 'simulator-full', '--duration', '5m', 'extra'],
  ])('rejects missing or extra values before launch: %j', (args) => {
    expect(() => parseWindowsTestCliArgs(args)).toThrow();
  });
});
