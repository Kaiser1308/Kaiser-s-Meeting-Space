import { describe, expect, it } from 'vitest';
import { decidePrimaryFinalAction } from './policy.js';

const base = {
  meetingState: 'finalizing' as const,
  policy: {
    version: 1 as const,
    language: 'vi' as const,
    live: 'off' as const,
    final: 'local' as const,
    cloudCheckScope: 'off' as const,
    cloudConsent: 'not_required' as const,
  },
  desktopAvailable: true,
  localModelAvailable: true,
  cloudProviderAvailable: true,
};

describe('decidePrimaryFinalAction', () => {
  it.each([
    [{ ...base, policy: { ...base.policy, final: 'none' as const } }, 'none'],
    [{ ...base }, 'local'],
    [{ ...base, desktopAvailable: false }, 'waiting_for_desktop'],
    [{ ...base, localModelAvailable: false }, 'waiting_for_model'],
    [
      {
        ...base,
        policy: { ...base.policy, final: 'cloud' as const, cloudConsent: 'granted' as const },
      },
      'cloud',
    ],
    [
      {
        ...base,
        policy: { ...base.policy, final: 'cloud' as const, cloudConsent: 'required' as const },
      },
      'review_required',
    ],
  ] as const)('selects exactly one primary action for %o', (input, expected) => {
    expect(decidePrimaryFinalAction(input).kind).toBe(expected);
  });

  it('does not start a final action when End has not reached finalizing', () => {
    expect(() => decidePrimaryFinalAction({ ...base, meetingState: 'recording' })).toThrow(
      'finalizing',
    );
  });
});
