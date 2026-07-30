import { describe, it, expect } from 'vitest';
import {
  createFakeReadinessPort,
  FakeMicrophoneReadiness,
  FakeDesktopReadiness,
  FakeLocalModelReadiness,
} from './fakes.js';
import type { ReadinessInput } from './types.js';

describe('ReadinessPort and Fakes', () => {
  const baseInput: ReadinessInput = {
    policy: {
      version: 1,
      language: 'vi',
      live: 'off',
      final: 'local',
      cloudCheckScope: 'off',
      cloudConsent: 'not_required',
    },
    mode: 'meeting_only',
    captureSources: ['mic'],
  };

  it('Missing desktop/model NEVER changes policy to cloud and NEVER prevents safe local capture', async () => {
    // Spec §4.3 invariant
    const port = createFakeReadinessPort({
      desktop: FakeDesktopReadiness({ authorized: false }),
      localModel: FakeLocalModelReadiness({ verified: false }),
    });

    const result = await port.check(baseInput);

    // Result has no blocking issues (allows safe local capture)
    expect(result.blocking.length).toBe(0);

    // Result has truthful delayed warnings
    expect(result.delayed.length).toBe(2);
    expect(result.delayed.some((w) => w.category === 'desktop_absent')).toBe(true);
    expect(result.delayed.some((w) => w.category === 'local_model_unavailable')).toBe(true);

    // Policy is unchanged
    expect(baseInput.policy.final).toBe('local');
  });

  it('microphone permission denied blocks start', async () => {
    const port = createFakeReadinessPort({
      microphone: FakeMicrophoneReadiness({ permission: 'denied' }),
    });

    const result = await port.check(baseInput);
    expect(result.blocking.length).toBe(1);
    expect(result.blocking[0].category).toBe('microphone_permission');
  });

  it('sequence increments on each check', async () => {
    const port = createFakeReadinessPort({});
    const r1 = await port.check(baseInput);
    const r2 = await port.check(baseInput);
    expect(r2.sequence).toBeGreaterThan(r1.sequence);
  });
});
