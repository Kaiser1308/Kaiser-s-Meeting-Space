import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

export const WINDOWS_TEST_ITERATION_MS = 5_000;
export const WINDOWS_TEST_PROCESS_SAMPLE_MS = 10_000;

export const WINDOWS_TEST_DURATIONS = {
  '5m': 300_000,
  '1h': 3_600_000,
  '3h': 10_800_000,
  '4h': 14_400_000,
} as const;

export type WindowsTestProfile = 'physical-recording' | 'simulator-full' | 'physical-full';
export type WindowsTestDuration = keyof typeof WINDOWS_TEST_DURATIONS;

export interface WindowsTestDurationResult {
  label: WindowsTestDuration;
  durationMs: number;
}

export function parseWindowsTestDuration(value: unknown): WindowsTestDurationResult {
  if (typeof value !== 'string' || !(value in WINDOWS_TEST_DURATIONS)) {
    throw new Error('unsupported_windows_test_duration');
  }
  const label = value as WindowsTestDuration;
  return { label, durationMs: WINDOWS_TEST_DURATIONS[label] };
}

export function parseWindowsTestProfile(value: unknown): WindowsTestProfile {
  if (value === 'physical-recording' || value === 'simulator-full' || value === 'physical-full') {
    return value;
  }
  throw new Error('unsupported_windows_test_profile');
}

export interface WindowsPipelineRunOptions {
  profile: WindowsTestProfile;
  durationMs: number;
  exePath: string;
  artifactDir: string;
  userDataDir: string;
  fixture?: string;
  fixtureName?: string;
  device?: string;
  deviceId?: string;
  microphoneDeviceId?: string;
  systemAudioDeviceId?: string;
  allowRealAudio: boolean;
}

export function validateWindowsPipelineRunOptions(options: WindowsPipelineRunOptions): void {
  const profile = parseWindowsTestProfile(options.profile);
  if (!Number.isSafeInteger(options.durationMs) || options.durationMs < WINDOWS_TEST_ITERATION_MS || options.durationMs % WINDOWS_TEST_ITERATION_MS !== 0) {
    throw new Error('invalid_windows_test_duration');
  }
  if (!options.exePath || !options.artifactDir || !options.userDataDir) {
    throw new Error('windows_test_paths_required');
  }
  if (typeof options.allowRealAudio !== 'boolean') {
    throw new Error('windows_test_real_audio_opt_in_required');
  }
  if (profile !== 'simulator-full' && !options.allowRealAudio) {
    throw new Error('real_audio_opt_in_required');
  }
}

export const assertWindowsPipelineRunOptions = validateWindowsPipelineRunOptions;

export type NativeResponse = {
  success: boolean;
  payload?: Record<string, unknown>;
  error?: { code?: string };
};

export interface CdpSession {
  evaluate(expression: string): Promise<unknown>;
  command(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  expectProcessExit(): void;
  close(): void;
}

export interface ProcessSample {
  elapsedMs: number;
  alive: boolean;
  privateWorkingSetBytes: number | null;
  cpuSeconds: number | null;
  childPids: number[];
  exitCode: number | null;
  treeQuerySucceeded: boolean;
}

export interface OperationalHealthSample {
  elapsedMs?: number;
  scheduledElapsedMs?: number;
  status: 'healthy';
  storageReady: true;
  simulatorActive: true;
  eventOverruns: 0;
}

export interface IsolatedRunDirectories {
  artifactDir: string;
  userDataDir: string;
  cleanup(): void;
}

export interface SanitizedFailureMetadata {
  phase: string;
  errorCode: string;
}

export interface ChildProcessFailureSource {
  once(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown;
}

type PendingCdpRequest = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

const wait = (ms: number) => new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorCode)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function getHealthSampleDeadline(
  nextHealthSampleAt: number,
  elapsedMs: number,
  intervalMs = WINDOWS_TEST_PROCESS_SAMPLE_MS,
): { scheduledElapsedMs: number | null; missed: boolean } {
  if (elapsedMs < nextHealthSampleAt) return { scheduledElapsedMs: null, missed: false };
  return {
    scheduledElapsedMs: nextHealthSampleAt,
    missed: elapsedMs >= nextHealthSampleAt + intervalMs,
  };
}

export function assertHealthSampleCoverage(
  sampledBoundaries: readonly number[],
  captureDurationMs: number,
  intervalMs = WINDOWS_TEST_PROCESS_SAMPLE_MS,
): void {
  const expectedCount = captureDurationMs / intervalMs;
  if (!Number.isInteger(expectedCount) || sampledBoundaries.length !== expectedCount) {
    throw new Error('health_sample_coverage_incomplete');
  }
  for (let index = 0; index < sampledBoundaries.length; index += 1) {
    if (sampledBoundaries[index] !== (index + 1) * intervalMs) {
      throw new Error('health_sample_coverage_incomplete');
    }
  }
}

export function resolvePackagedSidecarPath(exePath: string): string {
  return join(dirname(exePath), 'resources', 'native', 'kms-native.exe');
}

export function createIsolatedRunDirectories(prefix = 'kms-windows-test'): IsolatedRunDirectories {
  const artifactDir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const userDataDir = mkdtempSync(join(tmpdir(), `${prefix}-user-data-`));
  return {
    artifactDir,
    userDataDir,
    cleanup: () => rmSync(userDataDir, { recursive: true, force: true }),
  };
}

export function discoverCdpPort(userDataDir: string): number | null {
  try {
    const firstLine = readFileSync(join(userDataDir, 'DevToolsActivePort'), 'utf8').split(/\r?\n/, 1)[0];
    const port = Number(firstLine);
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
  } catch {
    return null;
  }
}

export function rejectPendingCdpRequests(
  pending: Map<number, PendingCdpRequest>,
  errorCode: string,
): void {
  for (const request of pending.values()) {
    if (request.timer) clearTimeout(request.timer);
    request.reject(new Error(errorCode));
  }
  pending.clear();
}

export function bindChildProcessFailureHandlers(
  child: ChildProcessFailureSource,
  signalFailure: (errorCode: string) => void,
  isExpectedExit: () => boolean = () => false,
): () => void {
  const onError = () => signalFailure('packaged_process_error');
  const onExit = () => {
    if (!isExpectedExit()) signalFailure('packaged_process_exited');
  };
  child.once('error', onError);
  child.once('exit', onExit);
  return () => {
    child.removeListener?.('error', onError);
    child.removeListener?.('exit', onExit);
  };
}

export function persistFailureScreenshot(artifactDir: string, response: Record<string, unknown>): boolean {
  const result = response.result as { data?: unknown } | undefined;
  if (typeof result?.data !== 'string' || result.data.length === 0) return false;
  const screenshot = Buffer.from(result.data, 'base64');
  if (screenshot.length === 0) return false;
  writeFileSync(join(artifactDir, 'failure-screenshot.png'), screenshot);
  return true;
}

function terminateProcessTree(child: ChildProcess): void {
  if (child.pid && process.platform === 'win32') {
    try {
      execFileSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // The packaged process may already be closed.
    }
    return;
  }
  child.kill('SIGKILL');
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolvePromise) => {
    const onExit = () => {
      clearTimeout(timer);
      resolvePromise(true);
    };
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolvePromise(false);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

export function isProcessTreeTerminated(sample: ProcessSample): boolean {
  return sample.treeQuerySucceeded && !sample.alive && sample.childPids.length === 0;
}

async function waitForProcessTreeTermination(child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  do {
    const remainingMs = Math.max(1, Math.ceil(deadline - performance.now()));
    const sample = sampleProcessTree(child, 0, Math.min(2_000, remainingMs));
    if (isProcessTreeTerminated(sample)) return;
    if (performance.now() >= deadline) break;
    await wait(Math.min(200, Math.max(1, deadline - performance.now())));
  } while (performance.now() < deadline);
  throw new Error('child_process_tree_cleanup_failed');
}

async function forceTerminateAndVerify(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    terminateProcessTree(child);
    await waitForChildExit(child, 1_000);
  }
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error('child_process_cleanup_failed');
  }
  if (child.pid) await waitForProcessTreeTermination(child, 3_000);
}

export function sampleProcessTree(child: ChildProcess, elapsedMs: number, queryTimeoutMs = 5_000): ProcessSample {
  const exitCode = child.exitCode;
  if (!child.pid || process.platform !== 'win32') {
    return {
      elapsedMs,
      alive: exitCode === null,
      privateWorkingSetBytes: null,
      cpuSeconds: null,
      childPids: [],
      exitCode,
      treeQuerySucceeded: false,
    };
  }
  const script = [
    `$rootPid = ${Math.trunc(child.pid)}`,
    '$all = @(Get-CimInstance Win32_Process -ErrorAction Stop)',
    '$seen = New-Object System.Collections.Generic.HashSet[int]',
    '$queue = New-Object System.Collections.Generic.Queue[int]',
    '$queue.Enqueue($rootPid)',
    'while ($queue.Count -gt 0) {',
    '  $parent = $queue.Dequeue()',
    '  foreach ($candidate in $all) {',
    '    if ([int]$candidate.ParentProcessId -eq $parent -and $seen.Add([int]$candidate.ProcessId)) { $queue.Enqueue([int]$candidate.ProcessId) }',
    '  }',
    '}',
    '$root = Get-Process -Id $rootPid -ErrorAction SilentlyContinue',
    '[pscustomobject]@{ alive = $null -ne $root; privateWorkingSetBytes = if ($root) { [int64]$root.PrivateMemorySize64 } else { $null }; cpuSeconds = if ($root -and $null -ne $root.CPU) { [double]$root.CPU } else { $null }; childPids = @($seen | Sort-Object); treeQuerySucceeded = $true } | ConvertTo-Json -Compress',
  ].join('\n');
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', timeout: queryTimeoutMs, windowsHide: true,
    });
    const sample = JSON.parse(output) as Partial<ProcessSample>;
    return {
      elapsedMs,
      alive: sample.alive === true,
      privateWorkingSetBytes: sample.privateWorkingSetBytes ?? null,
      cpuSeconds: sample.cpuSeconds ?? null,
      childPids: Array.isArray(sample.childPids)
        ? sample.childPids.filter((pid): pid is number => typeof pid === 'number')
        : typeof sample.childPids === 'number'
          ? [sample.childPids]
          : [],
      exitCode,
      treeQuerySucceeded: sample.treeQuerySucceeded === true,
    };
  } catch {
    return {
      elapsedMs,
      alive: false,
      privateWorkingSetBytes: null,
      cpuSeconds: null,
      childPids: [],
      exitCode,
      treeQuerySucceeded: false,
    };
  }
}

export function toSafeErrorCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(value) ? value : fallback;
}

export function toSanitizedFailureMetadata(
  phase: string,
  error: unknown,
): SanitizedFailureMetadata {
  const candidate = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';
  const typeName = typeof error === 'object' && error !== null && 'constructor' in error
    && typeof error.constructor?.name === 'string'
    ? error.constructor.name.replace(/[^A-Za-z0-9]/g, '')
    : 'Unknown';
  return {
    phase,
    errorCode: toSafeErrorCode(candidate, `unknown_${typeName || 'Unknown'}`),
  };
}

export function classifyOperationalStderr(lines: string[]): string[] {
  const classifications: string[] = [];
  for (const line of lines) {
    if (/native\s+runtime/i.test(line)) classifications.push('native_runtime');
    if (/kms-native/i.test(line)) classifications.push('kms_native');
    if (/\bfatal\b/i.test(line)) classifications.push('fatal');
    if (/\berror\b/i.test(line)) classifications.push('error');
  }
  return classifications;
}

function makeInvokeExpression(command: string, payload: Record<string, unknown>): string {
  return `(async () => window.kmsNative.invoke('kms-native-ipc', ${JSON.stringify({
    version: 1,
    correlationId: randomUUID(),
    command,
    payload,
    timeoutMs: 30_000,
    cancel: false,
  })}))()`;
}

export interface PackagedElectronSessionDiagnostics {
  rendererErrors: string[];
  commandErrors: string[];
  stderrClassifications: string[];
}

export interface PackagedElectronSession {
  evaluate(expression: string): Promise<unknown>;
  invokeNative(command: string, payload?: Record<string, unknown>, recordFailure?: boolean): Promise<NativeResponse>;
  pollRenderer<T>(operation: (() => Promise<T>) | string, predicate: (value: T) => boolean, timeoutMs?: number): Promise<T>;
  sampleProcessTree(elapsedMs: number, queryTimeoutMs?: number): ProcessSample;
  expectProcessExit(): void;
  close(): Promise<void>;
  writeEvidence(name: string, value: unknown): void;
  readonly child: ChildProcess;
  readonly cdp: CdpSession;
  readonly diagnostics: PackagedElectronSessionDiagnostics;
}

export interface CreatePackagedElectronSessionOptions {
  artifactDir: string;
  userDataDir: string;
  child: ChildProcess;
  cdp: CdpSession;
  diagnostics?: Partial<PackagedElectronSessionDiagnostics>;
}

export function createPackagedElectronSession(options: CreatePackagedElectronSessionOptions): PackagedElectronSession {
  const diagnostics: PackagedElectronSessionDiagnostics = {
    rendererErrors: options.diagnostics?.rendererErrors ?? [],
    commandErrors: options.diagnostics?.commandErrors ?? [],
    stderrClassifications: options.diagnostics?.stderrClassifications ?? [],
  };
  let closed = false;
  let expectedProcessExit = false;

  const session: PackagedElectronSession = {
    child: options.child,
    cdp: options.cdp,
    diagnostics,
    evaluate: (expression) => options.cdp.evaluate(expression),
    async invokeNative(command, payload = {}, recordFailure = true) {
      const response = (await options.cdp.evaluate(makeInvokeExpression(command, payload))) as NativeResponse | undefined;
      if (!response?.success) {
        const errorCode = toSafeErrorCode(response?.error?.code, 'native_command_failed');
        if (recordFailure) diagnostics.commandErrors.push(errorCode);
        throw new Error(errorCode);
      }
      return response;
    },
    async pollRenderer<T>(
      operation: (() => Promise<T>) | string,
      predicate: (value: T) => boolean,
      timeoutMs = 15_000,
    ) {
      const startedAt = performance.now();
      while (performance.now() - startedAt < timeoutMs) {
        const value = typeof operation === 'string' ? await options.cdp.evaluate(operation) as T : await operation();
        if (predicate(value)) return value;
        await wait(250);
      }
      throw new Error('renderer_poll_timeout');
    },
    sampleProcessTree: (elapsedMs, queryTimeoutMs = 5_000) => sampleProcessTree(options.child, elapsedMs, queryTimeoutMs),
    expectProcessExit: () => {
      expectedProcessExit = true;
      options.cdp.expectProcessExit();
    },
    async close() {
      if (closed) return;
      closed = true;
      session.expectProcessExit();
      try {
        try {
          await options.cdp.evaluate('window.close()');
        } catch {
          // Closing the renderer may race its process shutdown.
        }
        await waitForChildExit(options.child, 4_000);
        await forceTerminateAndVerify(options.child);
      } finally {
        try {
          options.cdp.close();
        } finally {
          expectedProcessExit = true;
        }
      }
    },
    writeEvidence(name, value) {
      if (basename(name) !== name || name.includes('..')) throw new Error('invalid_evidence_name');
      const content = typeof value === 'string' || value instanceof Uint8Array
        ? value
        : `${JSON.stringify(value, null, 2)}\n`;
      writeFileSync(join(options.artifactDir, name), content);
    },
  };

  void expectedProcessExit;
  return session;
}

async function connectToCdp(
  userDataDir: string,
  child: ChildProcess,
  rendererErrors: string[],
): Promise<{ loadedTargetUrl: string; cdp: CdpSession }> {
  const startedAt = performance.now();
  const pending = new Map<number, PendingCdpRequest>();
  let wsUrl: string | undefined;
  let loadedTargetUrl: string | undefined;
  let childFailureCode: string | undefined;
  let opened = false;
  let expectedClose = false;
  let expectedProcessExit = false;
  let rejectOpening: ((error: Error) => void) | undefined;
  const signalTransportFailure = (errorCode: string) => {
    childFailureCode ??= errorCode;
    if (!rendererErrors.includes(errorCode)) rendererErrors.push(errorCode);
    rejectPendingCdpRequests(pending, errorCode);
    if (!opened) rejectOpening?.(new Error(errorCode));
  };
  bindChildProcessFailureHandlers(
    child as unknown as ChildProcessFailureSource,
    signalTransportFailure,
    () => expectedProcessExit,
  );
  while (performance.now() - startedAt < 30_000) {
    if (childFailureCode) throw new Error(childFailureCode);
    if (child.exitCode !== null) throw new Error('packaged_process_exited_before_cdp');
    try {
      const port = discoverCdpPort(userDataDir);
      if (!port) {
        await wait(500);
        continue;
      }
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1_500),
      });
      const targets = (await response.json()) as Array<{
        type: string;
        url: string;
        webSocketDebuggerUrl?: string;
      }>;
      const page = targets.find((target) => target.type === 'page' && target.url.includes('dist/index.html'));
      if (page?.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        loadedTargetUrl = page.url;
        break;
      }
    } catch {
      // CDP endpoint has not warmed up yet.
    }
    await wait(500);
  }
  if (!wsUrl || !loadedTargetUrl) throw new Error('cdp_dist_index_target_unavailable');

  let ws: WebSocket | null = null;
  let nextId = 1;
  try {
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data.toString()) as {
        id?: number;
        method?: string;
        params?: { type?: string };
        result?: Record<string, unknown>;
        error?: unknown;
      };
      if (message.id !== undefined && pending.has(message.id)) {
        const request = pending.get(message.id)!;
        pending.delete(message.id);
        if (request.timer) clearTimeout(request.timer);
        if (message.error) request.reject(new Error('cdp_command_failed'));
        else request.resolve(message);
      } else if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        rendererErrors.push('console_error');
      } else if (message.method === 'Runtime.exceptionThrown') {
        rendererErrors.push('runtime_exception');
      }
    };
    ws.onerror = () => {
      if (!expectedClose && !expectedProcessExit) signalTransportFailure('cdp_websocket_error');
    };
    ws.onclose = () => {
      if (!expectedClose && !expectedProcessExit) signalTransportFailure('cdp_websocket_closed');
    };
    await new Promise<void>((resolvePromise, reject) => {
      rejectOpening = reject;
      const timer = setTimeout(() => reject(new Error('cdp_websocket_open_timeout')), 10_000);
      ws!.onopen = () => {
        clearTimeout(timer);
        opened = true;
        resolvePromise();
      };
    });
    const transport = ws;
    const command = async (method: string, params: Record<string, unknown> = {}) => {
      const id = nextId++;
      return new Promise<Record<string, unknown>>((resolvePromise, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('cdp_command_timeout'));
        }, 10_000);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolvePromise(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
          timer,
        });
        try {
          transport!.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error instanceof Error ? error : new Error('cdp_send_failed'));
        }
      });
    };
    await command('Runtime.enable');
    await command('Page.enable');
    const session: CdpSession = {
      command,
      async evaluate(expression: string): Promise<unknown> {
        const response = await command('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        const result = response.result as { result?: { value?: unknown }; exceptionDetails?: unknown } | undefined;
        if (result?.exceptionDetails) throw new Error('renderer_evaluation_failed');
        return result?.result?.value;
      },
      expectProcessExit: () => {
        expectedProcessExit = true;
      },
      close: () => {
        expectedClose = true;
        ws?.close();
      },
    };
    ws = null;
    return { loadedTargetUrl, cdp: session };
  } catch (error) {
    try {
      ws?.close();
    } catch {
      // Best-effort close; the outer process cleanup remains authoritative.
    }
    throw error;
  }
}

export interface LaunchPackagedElectronSessionOptions {
  exePath: string;
  artifactDir: string;
  userDataDir: string;
  diagnostics?: Partial<PackagedElectronSessionDiagnostics>;
}

export async function launchPackagedElectronSession(
  options: LaunchPackagedElectronSessionOptions,
): Promise<PackagedElectronSession & { loadedTargetUrl: string }> {
  if (!existsSync(options.exePath)) throw new Error('packaged_executable_unavailable');
  if (!existsSync(resolvePackagedSidecarPath(options.exePath))) throw new Error('packaged_sidecar_unavailable');
  const diagnostics: PackagedElectronSessionDiagnostics = {
    rendererErrors: options.diagnostics?.rendererErrors ?? [],
    commandErrors: options.diagnostics?.commandErrors ?? [],
    stderrClassifications: options.diagnostics?.stderrClassifications ?? [],
  };
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith('VITEST') && value !== undefined) env[key] = value;
  const child = spawn(options.exePath, ['--enable-logging', `--user-data-dir=${options.userDataDir}`, '--remote-debugging-port=0'], {
    stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true,
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    for (const classification of classifyOperationalStderr([String(chunk)])) {
      if (diagnostics.stderrClassifications.length < 20 && !diagnostics.stderrClassifications.includes(classification)) {
        diagnostics.stderrClassifications.push(classification);
      }
    }
  });
  try {
    const connection = await connectToCdp(options.userDataDir, child, diagnostics.rendererErrors);
    return {
      ...createPackagedElectronSession({
        artifactDir: options.artifactDir,
        userDataDir: options.userDataDir,
        child,
        cdp: connection.cdp,
        diagnostics,
      }),
      loadedTargetUrl: connection.loadedTargetUrl,
    };
  } catch (error) {
    try {
      await forceTerminateAndVerify(child);
    } catch {
      // Preserve the original startup failure.
    }
    throw error;
  }
}

export async function writeFailureMetadata(
  artifactDir: string,
  cdp: Pick<CdpSession, 'command'> | null,
  failure: SanitizedFailureMetadata,
  processDiagnostics: Record<string, unknown>,
): Promise<void> {
  let screenshotCaptured = false;
  try {
    if (cdp) {
      const response = await cdp.command('Page.captureScreenshot', { format: 'png' });
      screenshotCaptured = persistFailureScreenshot(artifactDir, response);
    }
  } catch {
    // Do not persist a screenshot or page content; retain metadata only.
  }
  writeFileSync(
    join(artifactDir, 'error-summary.json'),
    `${JSON.stringify({ ...failure, ...processDiagnostics, screenshotCaptured }, null, 2)}\n`,
  );
}
