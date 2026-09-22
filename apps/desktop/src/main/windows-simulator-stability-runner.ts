import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, '../..');
const CAPTURE_DURATION_MS = 300_000;
const ITERATION_MS = 5_000;
const ITERATIONS = CAPTURE_DURATION_MS / ITERATION_MS;
const PROCESS_SAMPLE_MS = 10_000;

type NativeResponse = {
  success: boolean;
  payload?: Record<string, unknown>;
  error?: { code?: string };
};

interface CdpSession {
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

export interface SimulatorRunSummary {
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  iterations: number;
  virtualTimeMs: number;
  chunkCount: number;
  stateTransitions: string[];
  finalState: string;
  healthFailures: string[];
  rendererErrors: string[];
  expectedEventErrors: string[];
  memorySamples: ProcessSample[];
  artifactDir: string;
  phase: string;
  errorCode: string | null;
  childExitCode: number | null;
  childSignal: string | null;
  stderrClassifications: string[];
  healthSamples: OperationalHealthSample[];
  missedHealthIntervals: number[];
}

export interface SimulatorRunOptions {
  exePath?: string;
  diagnosticOnly?: boolean;
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

type PendingCdpRequest = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

export interface ChildProcessFailureSource {
  once(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown;
}

const wait = (ms: number) => new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
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
  intervalMs = PROCESS_SAMPLE_MS,
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
  intervalMs = PROCESS_SAMPLE_MS,
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

export function createIsolatedRunDirectories(): IsolatedRunDirectories {
  const artifactDir = mkdtempSync(join(tmpdir(), 'kms-windows-sim-5m-'));
  const userDataDir = mkdtempSync(join(tmpdir(), 'kms-windows-sim-5m-user-data-'));
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
    const sample = sampleProcessTree(child, 0, Math.min(500, remainingMs));
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
  await waitForProcessTreeTermination(child, 3_000);
}

async function gracefulClose(child: ChildProcess, cdp: CdpSession | null): Promise<void> {
  cdp?.expectProcessExit();
  try {
    if (cdp) {
      try {
        await cdp.evaluate('window.close()');
      } catch {
        // Closing the renderer may race its process shutdown.
      }
    }
    await waitForChildExit(child, 4_000);
    await forceTerminateAndVerify(child);
  } finally {
    try {
      cdp?.close();
    } catch {
      // Closing the CDP socket must not prevent process-tree cleanup.
    }
  }
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
    ws.onerror = () => signalTransportFailure('cdp_websocket_error');
    ws.onclose = () => {
      if (!expectedClose) signalTransportFailure('cdp_websocket_closed');
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
          ws!.send(JSON.stringify({ id, method, params }));
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

export function selectSimulatorExpression(): string {
  return `(() => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Simulated (P11)',
    );
    if (!button) return false;
    button.click();
    return true;
  })()`;
}

export function fillSyntheticTitleExpression(): string {
  return `(() => {
    const input = document.querySelector('#meeting-title');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!input || !setter) return false;
    setter.call(input, 'Windows simulator stability run');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
}

async function invokeLifecycle(
  cdp: CdpSession,
  command: string,
  payload: Record<string, unknown>,
  commandErrors: string[],
  recordFailure = true,
): Promise<NativeResponse> {
  const response = (await cdp.evaluate(makeInvokeExpression(command, payload))) as NativeResponse | undefined;
  if (!response?.success) {
    const errorCode = toSafeErrorCode(response?.error?.code, 'native_command_failed');
    if (recordFailure) commandErrors.push(errorCode);
    throw new Error(errorCode);
  }
  return response;
}

export function assertHealthyLifecycleResponse(response: NativeResponse): void {
  if (response.payload?.status !== 'healthy') throw new Error('lifecycle_health_not_healthy');
}

export function toOperationalHealthSample(response: NativeResponse): OperationalHealthSample {
  assertHealthyLifecycleResponse(response);
  const payload = response.payload ?? {};
  if (payload.storageReady !== true) throw new Error('lifecycle_storage_not_ready');
  if (payload.simulatorActive !== true) throw new Error('lifecycle_simulator_not_active');
  if (payload.eventOverruns !== 0) throw new Error('lifecycle_event_overruns_detected');
  return {
    status: 'healthy',
    storageReady: true,
    simulatorActive: true,
    eventOverruns: 0,
  };
}

async function invokeNative(
  cdp: CdpSession,
  command: string,
  payload: Record<string, unknown>,
  commandErrors: string[],
  recordFailure = true,
): Promise<NativeResponse> {
  const response = await invokeLifecycle(cdp, command, payload, commandErrors, recordFailure);
  if (response.payload?.isSimulated !== true) throw new Error('simulator_response_not_marked_simulated');
  return response;
}

export function toSanitizedFailureMetadata(
  phase: string,
  error: unknown,
): SanitizedFailureMetadata {
  const candidate = error instanceof Error ? error.message : '';
  return {
    phase,
    errorCode: toSafeErrorCode(candidate, 'unknown_harness_failure'),
  };
}

export function matchesSimulatorState(actual: unknown, expected: string): boolean {
  return typeof actual === 'string' && actual.toLowerCase() === expected;
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

function normalizeSimulatorState(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : 'unknown';
}

export function assertResetState(payload: Record<string, unknown>): void {
  if (!matchesSimulatorState(payload.state, 'idle')) throw new Error('simulator_reset_not_idle');
  if (payload.sessionId !== null) throw new Error('simulator_reset_session_still_active');
}

function toSafeErrorCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(value) ? value : fallback;
}

async function pollForState(
  cdp: CdpSession,
  state: string,
  commandErrors: string[],
  waitForConfiguration = false,
): Promise<Record<string, unknown>> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 15_000) {
    try {
      const response = await invokeNative(cdp, 'simulator_get_state', {}, commandErrors, false);
      if (matchesSimulatorState(response.payload?.state, state)) return response.payload ?? {};
    } catch (error) {
      const errorCode = toSanitizedFailureMetadata('simulator_state', error).errorCode;
      if (!waitForConfiguration || errorCode !== 'SIMULATOR_NOT_CONFIGURED') {
        commandErrors.push(errorCode);
        throw error;
      }
    }
    await wait(250);
  }
  throw new Error('simulator_state_transition_timeout');
}

function sampleProcessTree(child: ChildProcess, elapsedMs: number, queryTimeoutMs = 5_000): ProcessSample {
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

function writeArtifacts(artifactDir: string, summary: SimulatorRunSummary, events: Record<string, unknown>[]): void {
  writeFileSync(join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(artifactDir, 'summary.md'), [
    '# Windows simulator five-minute stability summary', '',
    `- elapsedMs: ${summary.elapsedMs}`, `- iterations: ${summary.iterations}`,
    `- virtualTimeMs: ${summary.virtualTimeMs}`, `- chunkCount: ${summary.chunkCount}`,
      `- finalState: ${summary.finalState}`, `- rendererErrors: ${summary.rendererErrors.length}`,
      `- healthFailures: ${summary.healthFailures.length}`,
      `- healthSamples: ${summary.healthSamples.length}`,
      `- missedHealthIntervals: ${summary.missedHealthIntervals.length}`,
  ].join('\n'));
  writeFileSync(join(artifactDir, 'metrics.ndjson'), summary.memorySamples.map((sample) => JSON.stringify(sample)).join('\n') + (summary.memorySamples.length ? '\n' : ''));
  writeFileSync(join(artifactDir, 'events.ndjson'), events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : ''));
}

async function writeFailureMetadata(
  artifactDir: string,
  cdp: CdpSession | null,
  failure: SanitizedFailureMetadata,
  processDiagnostics: Pick<
    SimulatorRunSummary,
    'childExitCode' | 'childSignal' | 'stderrClassifications'
  >,
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

export async function runWindowsSimulatorStability(options: SimulatorRunOptions = {}): Promise<SimulatorRunSummary> {
  const exePath = options.exePath ?? process.env.KMS_PACKAGED_EXE ?? resolve(desktopRoot, "dist-packaged/win-unpacked/Kaiser's Meeting Space.exe");
  const sidecarPath = resolvePackagedSidecarPath(exePath);
  if (!existsSync(exePath)) throw new Error('packaged_executable_unavailable');
  if (!existsSync(sidecarPath)) throw new Error('packaged_sidecar_unavailable');

  const runDirectories = createIsolatedRunDirectories();
  const { artifactDir, userDataDir } = runDirectories;
  const rendererErrors: string[] = [];
  const healthFailures: string[] = [];
  const expectedEventErrors: string[] = [];
  const stderrClassifications: string[] = [];
  const healthSamples: OperationalHealthSample[] = [];
  const missedHealthIntervals: number[] = [];
  const memorySamples: ProcessSample[] = [];
  const stateTransitions: string[] = [];
  const events: Record<string, unknown>[] = [];
  const startedAt = new Date().toISOString();
  let captureStartedAt = 0;
  let virtualTimeMs = 0;
  let chunkCount = 0;
  let iterations = 0;
  let finalState = 'unknown';
  let phase = 'launch';
  let errorCode: string | null = null;
  let child: ChildProcess | null = null;
  let cdp: CdpSession | null = null;
  const summary = (): SimulatorRunSummary => ({
    startedAt, endedAt: new Date().toISOString(),
    elapsedMs: captureStartedAt ? Math.round(performance.now() - captureStartedAt) : 0,
    iterations, virtualTimeMs, chunkCount, stateTransitions, finalState,
    healthFailures, rendererErrors, expectedEventErrors, memorySamples, artifactDir,
    phase, errorCode,
    childExitCode: child?.exitCode ?? null,
    childSignal: child?.signalCode ?? null,
    stderrClassifications,
    healthSamples,
    missedHealthIntervals,
  });

  try {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) if (!key.startsWith('VITEST') && value !== undefined) env[key] = value;
    child = spawn(exePath, ['--enable-logging', `--user-data-dir=${userDataDir}`, '--remote-debugging-port=0'], {
      stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true,
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      for (const classification of classifyOperationalStderr([String(chunk)])) {
        if (stderrClassifications.length < 20 && !stderrClassifications.includes(classification)) {
          stderrClassifications.push(classification);
        }
      }
    });
    phase = 'cdp_connect';
    const connection = await connectToCdp(userDataDir, child, rendererErrors);
    cdp = connection.cdp;
    if (!connection.loadedTargetUrl.endsWith('dist/index.html')) throw new Error('cdp_loaded_non_packaged_renderer');

    phase = 'runtime_health';
    let healthy = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = (await cdp.evaluate(`({ apiStatus: document.querySelector('[data-testid="api-status"]')?.textContent?.trim(), recordButton: document.querySelector('button.record')?.textContent?.trim() })`)) as { apiStatus?: string; recordButton?: string } | undefined;
      if (status?.apiStatus === 'HEALTHY' && status.recordButton === 'Start meeting') {
        const health = await invokeLifecycle(cdp, 'health_check', {}, expectedEventErrors);
        healthSamples.push(toOperationalHealthSample(health));
        healthy = true;
        break;
      }
      await wait(500);
    }
    if (!healthy) throw new Error('local_runtime_health_timeout');
    phase = 'ui_select_simulator';
    const selected = await cdp.evaluate(selectSimulatorExpression());
    if (selected !== true) throw new Error('simulator_selector_unavailable');
    phase = 'simulator_configure';
    await invokeNative(cdp, 'simulator_configure', { seed: 42, deviceCount: 2 }, expectedEventErrors);
    phase = 'ui_fill_synthetic_title';
    const titleFilled = await cdp.evaluate(fillSyntheticTitleExpression());
    if (titleFilled !== true) throw new Error('synthetic_title_input_unavailable');
    phase = 'simulator_idle_state';
    stateTransitions.push(normalizeSimulatorState((await pollForState(cdp, 'idle', expectedEventErrors)).state));
    phase = 'ui_start_capture';
    await cdp.evaluate(`document.querySelector('button.record')?.click()`);
    stateTransitions.push(normalizeSimulatorState((await pollForState(cdp, 'capturing', expectedEventErrors)).state));
    if (options.diagnosticOnly) {
      phase = 'startup_complete';
      const completed = summary();
      writeArtifacts(artifactDir, completed, events);
      return completed;
    }
    phase = 'capture_loop';
    captureStartedAt = performance.now();
    let lastSampleAt = 0;
    let nextHealthSampleAt = PROCESS_SAMPLE_MS;
    const healthSampleBoundaries: number[] = [];

    for (let index = 0; index < ITERATIONS; index += 1) {
      const waitMs = captureStartedAt + (index + 1) * ITERATION_MS - performance.now();
      if (waitMs > 0) await wait(waitMs);
      if (child.exitCode !== null) throw new Error('packaged_process_exited_during_capture');
      const injected = await invokeNative(cdp, 'simulator_inject_event', { eventKind: 'chunk_ready', advanceMs: ITERATION_MS }, expectedEventErrors);
      virtualTimeMs = Number(injected.payload?.virtualTimeMs ?? 0);
      const state = await invokeNative(cdp, 'simulator_get_state', {}, expectedEventErrors);
      chunkCount = Number(state.payload?.chunkCount ?? 0);
      iterations += 1;
      if (virtualTimeMs !== (index + 1) * ITERATION_MS || Number(state.payload?.virtualTimeMs ?? 0) !== virtualTimeMs) throw new Error('non_monotonic_simulator_virtual_time');
      if (chunkCount !== index + 1) throw new Error('unexpected_simulator_chunk_count');
      events.push({ iteration: index + 1, eventKind: 'chunk_ready', virtualTimeMs, chunkCount });
      const elapsedMs = Math.round(performance.now() - captureStartedAt);
      const healthDeadline = getHealthSampleDeadline(nextHealthSampleAt, elapsedMs);
      if (healthDeadline.scheduledElapsedMs !== null) {
        if (healthDeadline.missed) {
          missedHealthIntervals.push(healthDeadline.scheduledElapsedMs);
          healthFailures.push('health_sample_interval_missed');
          throw new Error('health_sample_interval_missed');
        }
        const health = await invokeLifecycle(cdp, 'health_check', {}, expectedEventErrors);
        healthSamples.push({
          ...toOperationalHealthSample(health),
          elapsedMs,
          scheduledElapsedMs: healthDeadline.scheduledElapsedMs,
        });
        healthSampleBoundaries.push(healthDeadline.scheduledElapsedMs);
        nextHealthSampleAt += PROCESS_SAMPLE_MS;
      }
      if (elapsedMs - lastSampleAt >= PROCESS_SAMPLE_MS) {
        const sample = sampleProcessTree(child, elapsedMs);
        memorySamples.push(sample);
        lastSampleAt = elapsedMs;
        if (!sample.alive) healthFailures.push('process_tree_not_alive');
      }
      if (rendererErrors.length) throw new Error('unexpected_renderer_error');
    }

    assertHealthSampleCoverage(healthSampleBoundaries, CAPTURE_DURATION_MS);
    if (Math.round(performance.now() - captureStartedAt) < CAPTURE_DURATION_MS || virtualTimeMs !== CAPTURE_DURATION_MS || chunkCount !== ITERATIONS || healthFailures.length) throw new Error('simulator_baseline_assertion_failed');
    phase = 'ui_stop_capture';
    await cdp.evaluate(`document.querySelector('button.record')?.click()`);
    finalState = normalizeSimulatorState((await pollForState(cdp, 'idle', expectedEventErrors)).state);
    stateTransitions.push(finalState);
    phase = 'simulator_reset';
    await invokeNative(cdp, 'simulator_reset', {}, expectedEventErrors);
    const resetState = await pollForState(cdp, 'idle', expectedEventErrors);
    assertResetState(resetState);
    finalState = normalizeSimulatorState(resetState.state);
    if (stateTransitions.join(' -> ') !== 'idle -> capturing -> idle' || rendererErrors.length || expectedEventErrors.length) throw new Error('simulator_cleanup_assertion_failed');
    phase = 'complete';
    const completed = summary();
    writeArtifacts(artifactDir, completed, events);
    return completed;
  } catch (error) {
    const failure = toSanitizedFailureMetadata(phase, error);
    phase = failure.phase;
    errorCode = failure.errorCode;
    writeArtifacts(artifactDir, summary(), events);
    await writeFailureMetadata(artifactDir, cdp, failure, summary());
    throw new Error(`${failure.errorCode}; artifact_dir=${artifactDir}`);
  } finally {
    let cleanupError: unknown;
    try {
      try {
        if (cdp) {
          try {
            await withTimeout(
              invokeNative(cdp, 'simulator_stop_capture', {}, expectedEventErrors),
              5_000,
              'cleanup_stop_timeout',
            );
          } catch { /* cleanup continues */ }
          try {
            await withTimeout(
              invokeNative(cdp, 'simulator_reset', {}, expectedEventErrors),
              5_000,
              'cleanup_reset_timeout',
            );
          } catch { /* cleanup continues */ }
        }
        if (child) await gracefulClose(child, cdp);
      } catch (error) {
        cleanupError = error;
      } finally {
        try {
          if (child) await forceTerminateAndVerify(child);
        } catch (error) {
          cleanupError ??= error;
        }
      }
    } finally {
      try {
        runDirectories.cleanup();
        if (existsSync(userDataDir)) throw new Error('user_data_cleanup_failed');
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (cleanupError) {
      const failure = toSanitizedFailureMetadata('cleanup', cleanupError);
      phase = failure.phase;
      errorCode = failure.errorCode;
      writeArtifacts(artifactDir, summary(), events);
      await writeFailureMetadata(artifactDir, cdp, failure, summary());
      throw new Error(`${failure.errorCode}; artifact_dir=${artifactDir}`);
    }
  }
}
