import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertHealthyLifecycleResponse,
  assertHealthSampleCoverage,
  assertResetState,
  bindChildProcessFailureHandlers,
  classifyOperationalStderr,
  createIsolatedRunDirectories,
  discoverCdpPort,
  fillSyntheticTitleExpression,
  getHealthSampleDeadline,
  isProcessTreeTerminated,
  matchesSimulatorState,
  persistFailureScreenshot,
  rejectPendingCdpRequests,
  resolvePackagedSidecarPath,
  DEFAULT_CAPTURE_DURATION_MS,
  runWindowsSimulatorStability,
  selectSimulatorExpression,
  toSanitizedFailureMetadata,
  toOperationalHealthSample,
} from './windows-simulator-stability-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, '../..');
const defaultExePath = resolve(
  desktopRoot,
  "dist-packaged/win-unpacked/Kaiser's Meeting Space.exe",
);

const packagedExePath = process.env.KMS_PACKAGED_EXE ?? defaultExePath;
const packagedSidecarPath = resolvePackagedSidecarPath(packagedExePath);
const skipReason =
  process.platform !== 'win32'
    ? 'Windows-only: packaged Electron/CDP simulator stability harness requires Windows.'
    : !existsSync(packagedExePath)
      ? `Packaged executable unavailable: ${packagedExePath}`
      : !existsSync(packagedSidecarPath)
        ? `Packaged sidecar unavailable: ${packagedSidecarPath}`
      : undefined;
const diagnosticOnly = process.env.KMS_SIMULATOR_STABILITY_DIAGNOSTIC_ONLY === '1';

describe('Windows packaged simulator five-minute stability', () => {
  const stabilityDurationMs = Number(process.env.KMS_SIMULATOR_STABILITY_DURATION_MS ?? DEFAULT_CAPTURE_DURATION_MS);
  const stabilityIterations = stabilityDurationMs / 5_000;
  it('accepts a healthy lifecycle response without a simulator marker', () => {
    expect(
      assertHealthyLifecycleResponse({
        success: true,
        payload: {
          status: 'healthy',
          uptimeMs: 1,
          storageReady: true,
          simulatorActive: true,
        },
      }),
    ).toBeUndefined();
  });

  it('retains only a safe phase and code in failure metadata', () => {
    expect(
      toSanitizedFailureMetadata('runtime_health', new Error('simulator_response_not_marked_simulated')),
    ).toEqual({ phase: 'runtime_health', errorCode: 'simulator_response_not_marked_simulated' });
  });

  it('retains an allowlisted native error code without raw response details', () => {
    expect(
      toSanitizedFailureMetadata('simulator_idle_state', new Error('SIMULATOR_NOT_CONFIGURED')),
    ).toEqual({ phase: 'simulator_idle_state', errorCode: 'SIMULATOR_NOT_CONFIGURED' });
  });

  it('generates browser-valid expressions for simulator selection and synthetic title input', () => {
    expect(() => new Function(selectSimulatorExpression())).not.toThrow();
    expect(() => new Function(fillSyntheticTitleExpression())).not.toThrow();
  });

  it('matches native simulator state values without changing their recorded form', () => {
    expect(matchesSimulatorState('Idle', 'idle')).toBe(true);
    expect(matchesSimulatorState('Capturing', 'capturing')).toBe(true);
  });

  it('classifies operational stderr without retaining paths or content', () => {
    expect(
      classifyOperationalStderr([
        'Native runtime Error at C:\\private\\meeting-title.txt',
        'kms-native Fatal failure for content that must not be retained',
      ]),
    ).toEqual(['native_runtime', 'error', 'kms_native', 'fatal']);
  });

  it('derives the sidecar path from the selected packaged executable', () => {
    expect(resolvePackagedSidecarPath('C:\\package\\KMS.exe')).toBe(
      'C:\\package\\resources\\native\\kms-native.exe',
    );
  });

  it('creates user data outside the retained artifact directory', () => {
    const directories = createIsolatedRunDirectories();
    expect(directories.userDataDir.startsWith(directories.artifactDir)).toBe(false);
    expect(existsSync(directories.userDataDir)).toBe(true);
    directories.cleanup();
    expect(existsSync(directories.userDataDir)).toBe(false);
  });

  it('requires a successful empty process-tree query after termination', () => {
    expect(
      isProcessTreeTerminated({
        elapsedMs: 0,
        alive: false,
        privateWorkingSetBytes: null,
        cpuSeconds: null,
        childPids: [],
        exitCode: 0,
        treeQuerySucceeded: true,
      }),
    ).toBe(true);
    expect(
      isProcessTreeTerminated({
        elapsedMs: 0,
        alive: false,
        privateWorkingSetBytes: null,
        cpuSeconds: null,
        childPids: [42],
        exitCode: 0,
        treeQuerySucceeded: true,
      }),
    ).toBe(false);
    expect(
      isProcessTreeTerminated({
        elapsedMs: 0,
        alive: false,
        privateWorkingSetBytes: null,
        cpuSeconds: null,
        childPids: [],
        exitCode: 0,
        treeQuerySucceeded: false,
      }),
    ).toBe(false);
  });

  it('fails health coverage when a ten-second deadline is crossed without a sample', () => {
    expect(getHealthSampleDeadline(10_000, 10_500)).toEqual({
      scheduledElapsedMs: 10_000,
      missed: false,
    });
    expect(getHealthSampleDeadline(10_000, 20_000)).toEqual({
      scheduledElapsedMs: 10_000,
      missed: true,
    });
    expect(() => assertHealthSampleCoverage([10_000, 20_000, 30_000], 30_000)).not.toThrow();
    expect(() => assertHealthSampleCoverage([10_000], 30_000)).toThrow(
      'health_sample_coverage_incomplete',
    );
  });

  it('discovers Chromium’s dynamically assigned CDP port from its endpoint file', () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'kms-cdp-port-'));
    try {
      writeFileSync(join(userDataDir, 'DevToolsActivePort'), '43123\n/devtools/browser/test\n');
      expect(discoverCdpPort(userDataDir)).toBe(43123);
    } finally {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  it('persists a CDP screenshot as a PNG artifact when capture data is returned', () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'kms-screenshot-'));
    try {
      expect(
        persistFailureScreenshot(artifactDir, { result: { data: Buffer.from('png').toString('base64') } }),
      ).toBe(true);
      expect(existsSync(join(artifactDir, 'failure-screenshot.png'))).toBe(true);
    } finally {
      rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('rejects pending CDP commands when the WebSocket closes unexpectedly', async () => {
    const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
    const rejected = new Promise<void>((_resolve, reject) => {
      pending.set(1, { resolve: () => undefined, reject });
    });
    rejectPendingCdpRequests(pending, 'cdp_websocket_closed');
    await expect(rejected).rejects.toThrow('cdp_websocket_closed');
    expect(pending.size).toBe(0);
  });

  it('rejects an in-flight CDP command immediately when the packaged process exits', async () => {
    const child = new EventEmitter();
    const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
    const failures: string[] = [];
    const rejected = new Promise<void>((_resolve, reject) => {
      pending.set(1, { resolve: () => undefined, reject });
    });

    bindChildProcessFailureHandlers(child, (errorCode) => {
      failures.push(errorCode);
      rejectPendingCdpRequests(pending, errorCode);
    });
    child.emit('exit', 7, null);

    await expect(rejected).rejects.toThrow('packaged_process_exited');
    expect(pending.size).toBe(0);
    expect(failures).toEqual(['packaged_process_exited']);
  });

  it('rejects an in-flight CDP command with a safe code when the packaged process errors', async () => {
    const child = new EventEmitter();
    const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
    const rejected = new Promise<void>((_resolve, reject) => {
      pending.set(1, { resolve: () => undefined, reject });
    });

    bindChildProcessFailureHandlers(child, (errorCode) => {
      rejectPendingCdpRequests(pending, errorCode);
    });
    child.emit('error', new Error('C:\\private\\meeting-title.txt'));

    await expect(rejected).rejects.toThrow('packaged_process_error');
    expect(pending.size).toBe(0);
  });

  it('normalizes required operational lifecycle health fields', () => {
    expect(
      toOperationalHealthSample({
        success: true,
        payload: {
          status: 'healthy',
          storageReady: true,
          simulatorActive: true,
          eventOverruns: 0,
        },
      }),
    ).toEqual({ status: 'healthy', storageReady: true, simulatorActive: true, eventOverruns: 0 });
  });

  it('requires reset state to be idle with no active simulator session', () => {
    expect(() => assertResetState({ state: 'Idle', sessionId: null })).not.toThrow();
  });

  it(
    `runs ${stabilityIterations} synthetic five-second chunks through the packaged Electron preload bridge`,
    async (context) => {
      if (skipReason) {
        context.skip(skipReason);
        return;
      }
      if (diagnosticOnly) {
        context.skip('Diagnostic-only startup run requested; the configured stability run is disabled.');
        return;
      }

      const summary = await runWindowsSimulatorStability({ exePath: packagedExePath, durationMs: stabilityDurationMs });

      expect(summary.elapsedMs).toBeGreaterThanOrEqual(stabilityDurationMs);
      expect(summary.iterations).toBe(stabilityIterations);
      expect(summary.virtualTimeMs).toBe(stabilityDurationMs);
      expect(summary.chunkCount).toBe(stabilityIterations);
      expect(summary.finalState).toBe('idle');
      expect(summary.rendererErrors).toEqual([]);
      expect(summary.expectedEventErrors).toEqual([]);
      expect(summary.healthFailures).toEqual([]);
    },
    stabilityDurationMs + 120_000,
  );

  it('diagnoses packaged startup through simulated capture without entering the five-minute loop', async (context) => {
    if (skipReason) {
      context.skip(skipReason);
      return;
    }
    if (!diagnosticOnly) {
      context.skip('Set KMS_SIMULATOR_STABILITY_DIAGNOSTIC_ONLY=1 to run the bounded startup diagnostic.');
      return;
    }

    const summary = await runWindowsSimulatorStability({
      exePath: packagedExePath,
      diagnosticOnly: true,
    });

    expect(summary.phase).toBe('startup_complete');
    expect(summary.errorCode).toBeNull();
    expect(summary.stateTransitions).toEqual(['idle', 'capturing']);
    expect(summary.expectedEventErrors).toEqual([]);
    expect(summary.rendererErrors).toEqual([]);
  }, 90_000);
});
