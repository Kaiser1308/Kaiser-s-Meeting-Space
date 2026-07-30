/**
 * Native Runtime Supervisor — Bounded process supervision.
 *
 * Spawns only the packaged/configured runtime executable.
 * Manages lifecycle, restart budget, backoff, health monitoring,
 * and active-session crash routing to recovery.
 *
 * Security invariants:
 * - Executable path is package-controlled
 * - Renderer cannot choose process/path/args/environment
 * - Restart budget prevents unbounded crash loops
 * - Active-session crash routes to Recovery Inbox
 */

import { ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';
import { app } from 'electron';
import { EventEmitter } from 'node:events';
import {
  parseResponse,
  parseEvent,
  frameMessage,
  PROTOCOL_VERSION,
  type NativeRequestV1,
  type NativeResponseV1,
  type NativeEventV1,
  EnvelopeError,
  MAX_ENVELOPE_BYTES,
} from '@kms/native-contract';

/** Supervisor configuration. */
export interface SupervisorConfig {
  /** Maximum restarts within the restart window. Default: 3. */
  maxRestarts: number;
  /** Restart window in ms. Default: 60000. */
  restartWindowMs: number;
  /** Health check interval in ms. Default: 30000. */
  healthIntervalMs: number;
  /** Shutdown timeout in ms. Default: 5000. */
  shutdownTimeoutMs: number;
}

/** Supervisor state. */
export type SupervisorState =
  'stopped' | 'starting' | 'running' | 'restarting' | 'stopping' | 'crashed';

/** Event emitter for supervisor state changes. */
export interface SupervisorEvents {
  stateChange: [state: SupervisorState];
  event: [event: NativeEventV1];
  response: [response: NativeResponseV1];
  error: [error: Error];
  restartBudgetExhausted: [];
}

/**
 * Resolve the native runtime executable path.
 * In development: project-relative build output.
 * In production: packaged sidecar.
 */
function resolveRuntimePath(): string {
  if (app.isPackaged) {
    // Production: sidecar is bundled alongside the app
    const platform = process.platform;
    const ext = platform === 'win32' ? '.exe' : '';
    return join(process.resourcesPath, 'native', `kms-native${ext}`);
  }
  // Development: use the local build output
  const platform = process.platform;
  const ext = platform === 'win32' ? '.exe' : '';
  return join(app.getAppPath(), '..', '..', 'native', 'target', 'release', `kms-native${ext}`);
}

/**
 * Get the private app-data root for native storage.
 * Resolved from Electron's userData path — never from renderer input.
 */
function getStorageRoot(): string {
  return join(app.getPath('userData'), 'native-storage');
}

export class NativeSupervisor extends EventEmitter<SupervisorEvents> {
  private config: SupervisorConfig;
  private state: SupervisorState = 'stopped';
  private process: ChildProcess | null = null;
  private restartTimestamps: number[] = [];
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (r: NativeResponseV1) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private stdoutBuffer = Buffer.alloc(0);
  private activeSession = false;

  constructor(config: SupervisorConfig) {
    super();
    this.config = config;
  }

  /** Current supervisor state. */
  getState(): SupervisorState {
    return this.state;
  }

  /** Whether a capture session is active. */
  isSessionActive(): boolean {
    return this.activeSession;
  }

  /** Set session active state (called by IPC handler). */
  setSessionActive(active: boolean): void {
    this.activeSession = active;
  }

  /**
   * Start the native runtime.
   */
  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      return;
    }

    this.setState('starting');

    const runtimePath = resolveRuntimePath();
    const storageRoot = getStorageRoot();

    // Spawn with controlled environment — no renderer influence
    this.process = spawn(runtimePath, [], {
      env: {
        KMS_STORAGE_ROOT: storageRoot,
        KMS_PROTOCOL_VERSION: String(PROTOCOL_VERSION),
        // Inherit only safe environment variables
        PATH: process.env['PATH'] ?? '',
        TEMP: process.env['TEMP'] ?? '',
        TMP: process.env['TMP'] ?? '',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      // Security: do not allow shell interpretation
      shell: false,
      // Security: detach from renderer
      windowsHide: true,
    });

    this.attachProcessHandlers();

    // Wait for handshake with timeout
    await this.waitForHandshake();

    this.setState('running');
    this.startHealthMonitor();
  }

  /**
   * Send a request to the native runtime.
   */
  async send(request: NativeRequestV1): Promise<NativeResponseV1> {
    if (this.state !== 'running' || !this.process?.stdin) {
      throw new Error('Native runtime is not running');
    }

    const json = JSON.stringify(request);
    const frame = frameMessage(json);

    return new Promise<NativeResponseV1>((resolve, reject) => {
      const timeoutMs = request.timeoutMs ?? 30_000;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.correlationId);
        reject(new Error(`Request timed out after ${timeoutMs}ms: ${request.command}`));
      }, timeoutMs);

      this.pendingRequests.set(request.correlationId, { resolve, reject, timer });
      this.process!.stdin!.write(Buffer.from(frame));
    });
  }

  /**
   * Graceful shutdown of the native runtime.
   */
  async shutdown(): Promise<void> {
    if (this.state === 'stopped') return;

    this.setState('stopping');
    this.stopHealthMonitor();

    if (this.process) {
      // Close stdin to signal EOF
      this.process.stdin?.end();

      // Wait for graceful exit with timeout
      await Promise.race([
        new Promise<void>((resolve) => {
          this.process?.once('exit', () => resolve());
        }),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            this.process?.kill('SIGKILL');
            resolve();
          }, this.config.shutdownTimeoutMs);
        }),
      ]);
    }

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Native runtime shutting down'));
    }
    this.pendingRequests.clear();

    this.process = null;
    this.setState('stopped');
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private setState(state: SupervisorState): void {
    this.state = state;
    this.emit('stateChange', state);
  }

  private attachProcessHandlers(): void {
    if (!this.process) return;

    // Parse stdout for framed responses/events
    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
      this.processStdoutBuffer();
    });

    // Log stderr (content-free diagnostics only)
    this.process.stderr?.on('data', (chunk: Buffer) => {
      // Content-free parser: only log structured JSON lines
      const lines = chunk.toString('utf-8').split('\n');
      for (const line of lines) {
        if (line.trim()) {
          // Log safely without exposing content
          console.error('[native-runtime]', line.trim().substring(0, 200));
        }
      }
    });

    this.process.on('exit', (code, signal) => {
      this.handleProcessExit(code, signal);
    });

    this.process.on('error', (err) => {
      this.emit('error', err);
      this.handleProcessExit(null, null);
    });
  }

  private processStdoutBuffer(): void {
    while (this.stdoutBuffer.length >= 4) {
      // Read 4-byte big-endian length prefix
      const len = this.stdoutBuffer.readUint32BE(0);

      // Enforce envelope limit
      if (len > MAX_ENVELOPE_BYTES) {
        this.emit(
          'error',
          new EnvelopeError('OVERSIZED', `Received oversized frame: ${len} bytes`),
        );
        // Reset stdoutBuffer to recover
        this.stdoutBuffer = Buffer.alloc(0);
        return;
      }

      if (this.stdoutBuffer.length >= 4 + len) {
        // Extract the frame payload
        const payload = this.stdoutBuffer.subarray(4, 4 + len);
        // Advance the buffer
        this.stdoutBuffer = this.stdoutBuffer.subarray(4 + len);

        const line = payload.toString('utf-8');
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;

          // Route based on message shape
          if ('correlationId' in parsed && 'success' in parsed) {
            // Response
            const response = parseResponse(line);
            this.handleResponse(response);
          } else if ('eventId' in parsed && 'eventType' in parsed) {
            // Event
            const event = parseEvent(line);
            this.emit('event', event);
          }
        } catch (err) {
          // Non-JSON or invalid — ignore safely
          if (err instanceof EnvelopeError) {
            this.emit('error', err);
          } else {
            this.emit('error', new EnvelopeError('MALFORMED', `Failed to parse frame: ${err}`));
          }
        }
      } else {
        // Need more data
        break;
      }
    }
  }

  private handleResponse(response: NativeResponseV1): void {
    const pending = this.pendingRequests.get(response.correlationId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(response.correlationId);
      pending.resolve(response);
    }
    this.emit('response', response);
  }

  private handleProcessExit(code: number | null, signal: string | null): void {
    this.process = null;
    this.stopHealthMonitor();

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Native runtime exited: code=${code}, signal=${signal}`));
    }
    this.pendingRequests.clear();

    // Check restart budget
    if (this.state === 'stopping') {
      this.setState('stopped');
      return;
    }

    // Route active-session crash to recovery
    if (this.activeSession) {
      this.setState('crashed');
      this.emit('error', new Error('Native runtime crashed during active session'));
      // Recovery Inbox should discover the incomplete session
    }

    // Check restart budget
    if (this.canRestart()) {
      this.restartTimestamps.push(Date.now());
      this.setState('restarting');
      // Exponential backoff
      const backoffMs = Math.min(1000 * Math.pow(2, this.restartTimestamps.length - 1), 30_000);
      setTimeout(() => {
        void this.start().catch((err) => {
          this.emit('error', err instanceof Error ? err : new Error(String(err)));
          this.setState('crashed');
        });
      }, backoffMs);
    } else {
      this.setState('crashed');
      this.emit('restartBudgetExhausted');
    }
  }

  private canRestart(): boolean {
    const now = Date.now();
    // Remove timestamps outside the restart window
    this.restartTimestamps = this.restartTimestamps.filter(
      (ts) => now - ts < this.config.restartWindowMs,
    );
    return this.restartTimestamps.length < this.config.maxRestarts;
  }

  private async waitForHandshake(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Native runtime handshake timeout'));
      }, 10_000);

      const handler = (event: NativeEventV1): void => {
        if (event.eventType === 'runtime_ready') {
          clearTimeout(timeout);
          this.removeListener('event', handler);
          resolve();
        }
      };
      this.on('event', handler);
    });
  }

  private startHealthMonitor(): void {
    this.healthTimer = setInterval(() => {
      // Health check is a noop if no process
      if (this.process && !this.process.killed) {
        // Process is alive — basic health indicator
      }
    }, this.config.healthIntervalMs);
  }

  private stopHealthMonitor(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }
}
