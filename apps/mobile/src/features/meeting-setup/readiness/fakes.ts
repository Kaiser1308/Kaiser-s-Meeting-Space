import type {
  ReadinessPort,
  ReadinessInput,
  ReadinessResult,
  BlockingIssue,
  DelayedWarning,
} from './types';

export function FakeMicrophoneReadiness(options: {
  permission: 'granted' | 'denied' | 'restricted';
}) {
  return {
    check: () => {
      if (options.permission !== 'granted') {
        return {
          category: 'microphone_permission' as const,
          remediationKey: 'microphone_permission_denied',
        };
      }
      return null;
    },
  };
}

export function FakeStorageReadiness(options: { freeBytes: number }) {
  return {
    check: () => {
      // e.g. < 50MB
      if (options.freeBytes < 50 * 1024 * 1024) {
        return {
          category: 'storage_insufficient' as const,
          remediationKey: 'storage_insufficient_msg',
        };
      }
      return null;
    },
  };
}

export function FakeSourceReadiness(options: { available: Array<'mic' | 'system'> }) {
  return {
    check: (input: ReadinessInput) => {
      const hasValid = input.captureSources.some((s) => options.available.includes(s));
      if (!hasValid) {
        return {
          category: 'audio_source_invalid' as const,
          remediationKey: 'audio_source_invalid_msg',
        };
      }
      return null;
    },
  };
}

export function FakeApiNetworkReadiness(options: { reachable: boolean }) {
  return {
    check: () => {
      if (!options.reachable) {
        return {
          category: 'api_network_unreachable' as const,
          waitingStateLabel: 'offline' as const,
        };
      }
      return null;
    },
  };
}

export function FakeCloudProviderReadiness(options: { providerAvailable: boolean }) {
  return {
    check: (input: ReadinessInput) => {
      const needsProvider =
        input.policy.live === 'cloud' ||
        input.policy.final === 'cloud' ||
        input.policy.cloudCheckScope !== 'off';
      if (needsProvider && !options.providerAvailable) {
        return {
          category: 'cloud_provider_unavailable' as const,
          waitingStateLabel: 'provider_unavailable' as const,
        };
      }
      return null;
    },
  };
}

export function FakeDesktopReadiness(options: { authorized: boolean }) {
  return {
    check: (input: ReadinessInput) => {
      // mobile-originated local final -> waiting_for_desktop
      if (input.policy.final === 'local' && !options.authorized) {
        return {
          category: 'desktop_absent' as const,
          waitingStateLabel: 'waiting_for_desktop' as const,
        };
      }
      return null;
    },
  };
}

export function FakeLocalModelReadiness(options: { verified: boolean }) {
  return {
    check: (input: ReadinessInput) => {
      if (input.policy.final === 'local' && !options.verified) {
        return {
          category: 'local_model_unavailable' as const,
          waitingStateLabel: 'waiting_for_model' as const,
        };
      }
      return null;
    },
  };
}

export function FakeTranslationReadiness(options: { capable: boolean }) {
  return {
    check: (input: ReadinessInput) => {
      if (input.mode === 'meeting_translate' && !options.capable) {
        return {
          category: 'translation_unavailable' as const,
          waitingStateLabel: 'offline' as const,
        };
      }
      return null;
    },
  };
}

export function createFakeReadinessPort(parts: {
  microphone?: ReturnType<typeof FakeMicrophoneReadiness>;
  storage?: ReturnType<typeof FakeStorageReadiness>;
  source?: ReturnType<typeof FakeSourceReadiness>;
  api?: ReturnType<typeof FakeApiNetworkReadiness>;
  cloudProvider?: ReturnType<typeof FakeCloudProviderReadiness>;
  desktop?: ReturnType<typeof FakeDesktopReadiness>;
  localModel?: ReturnType<typeof FakeLocalModelReadiness>;
  translation?: ReturnType<typeof FakeTranslationReadiness>;
  delayMs?: number;
}): ReadinessPort {
  let sequence = 0;
  return {
    async check(input: ReadinessInput): Promise<ReadinessResult> {
      sequence++;
      const currentSeq = sequence;
      if (parts.delayMs) {
        await new Promise((r) => setTimeout(r, parts.delayMs));
      }

      const blocking: BlockingIssue[] = [];
      const delayed: DelayedWarning[] = [];

      if (parts.microphone) {
        const res = parts.microphone.check();
        if (res) blocking.push(res);
      }
      if (parts.storage) {
        const res = parts.storage.check();
        if (res) blocking.push(res);
      }
      if (parts.source) {
        const res = parts.source.check(input);
        if (res) blocking.push(res);
      }

      if (parts.api) {
        const res = parts.api.check();
        if (res) delayed.push(res);
      }
      if (parts.cloudProvider) {
        const res = parts.cloudProvider.check(input);
        if (res) delayed.push(res);
      }
      if (parts.desktop) {
        const res = parts.desktop.check(input);
        if (res) delayed.push(res);
      }
      if (parts.localModel) {
        const res = parts.localModel.check(input);
        if (res) delayed.push(res);
      }
      if (parts.translation) {
        const res = parts.translation.check(input);
        if (res) delayed.push(res);
      }

      return {
        blocking,
        delayed,
        checkedAt: Date.now(),
        sequence: currentSeq,
      };
    },
    async cancel() {},
  };
}
