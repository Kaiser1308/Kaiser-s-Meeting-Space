import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPackagedElectronSession,
  parseWindowsTestDuration,
  parseWindowsTestProfile,
  validateWindowsPipelineRunOptions,
  type PackagedElectronSession,
  type WindowsPipelineRunOptions,
} from './windows-test-kit.js';

describe('Windows test kit contracts', () => {
  it.each([
    ['5m', 300_000],
    ['1h', 3_600_000],
    ['3h', 10_800_000],
    ['4h', 14_400_000],
  ] as const)('parses the supported %s duration exactly', (label, durationMs) => {
    expect(parseWindowsTestDuration(label)).toEqual({ label, durationMs });
  });

  it('rejects unsupported durations and profiles', () => {
    expect(() => parseWindowsTestDuration('30m')).toThrow('unsupported_windows_test_duration');
    expect(() => parseWindowsTestProfile('simulator-5m')).toThrow('unsupported_windows_test_profile');
  });

  it('requires explicit real-audio opt-in for physical profiles', () => {
    const options: WindowsPipelineRunOptions = {
      profile: 'physical-recording',
      durationMs: 300_000,
      exePath: 'KMS.exe',
      artifactDir: 'artifacts',
      userDataDir: 'user-data',
      allowRealAudio: false,
    };

    expect(() => validateWindowsPipelineRunOptions(options)).toThrow('real_audio_opt_in_required');
  });

  it('exposes an idempotent session cleanup contract and preserves evidence', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'kms-kit-artifacts-'));
    const userDataDir = mkdtempSync(join(tmpdir(), 'kms-kit-user-data-'));
    const child = new EventEmitter() as unknown as ChildProcess & {
      pid?: number;
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: () => void;
    };
    child.exitCode = 0;
    child.signalCode = null;
    child.kill = () => true;
    let cdpClosed = 0;
    const cdp = {
      evaluate: async () => undefined,
      command: async () => ({}),
      expectProcessExit: () => undefined,
      close: () => {
        cdpClosed += 1;
      },
    };

    try {
      const session: PackagedElectronSession = createPackagedElectronSession({
        artifactDir,
        userDataDir,
        child,
        cdp,
      });

      expect(Object.keys(session)).toEqual(expect.arrayContaining([
        'evaluate',
        'invokeNative',
        'pollRenderer',
        'sampleProcessTree',
        'expectProcessExit',
        'close',
        'writeEvidence',
      ]));
      session.writeEvidence('contract.json', { ok: true });
      await session.close();
      await session.close();
      expect(cdpClosed).toBe(1);
    } finally {
      rmSync(artifactDir, { recursive: true, force: true });
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
