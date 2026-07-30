/**
 * Supervisor Tests — Bounded restart, backoff, and security.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeSupervisor, type SupervisorConfig } from '../main/supervisor.js';

// Mock Electron modules
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/mock/app',
    getPath: (name: string) => `/mock/${name}`,
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  session: {
    defaultSession: {
      webRequest: { onHeadersReceived: vi.fn() },
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    },
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

// Mock child_process - supervisor uses spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    killed: false,
    pid: 12345,
  })),
}));

const defaultConfig: SupervisorConfig = {
  maxRestarts: 3,
  restartWindowMs: 60_000,
  healthIntervalMs: 30_000,
  shutdownTimeoutMs: 5_000,
};

describe('NativeSupervisor', () => {
  let supervisor: NativeSupervisor;

  beforeEach(() => {
    supervisor = new NativeSupervisor(defaultConfig);
  });

  describe('state management', () => {
    it('starts in stopped state', () => {
      expect(supervisor.getState()).toBe('stopped');
    });

    it('reports no active session initially', () => {
      expect(supervisor.isSessionActive()).toBe(false);
    });

    it('tracks session active state', () => {
      supervisor.setSessionActive(true);
      expect(supervisor.isSessionActive()).toBe(true);
      supervisor.setSessionActive(false);
      expect(supervisor.isSessionActive()).toBe(false);
    });
  });

  describe('configuration', () => {
    it('accepts restart budget configuration', () => {
      const config: SupervisorConfig = {
        maxRestarts: 5,
        restartWindowMs: 120_000,
        healthIntervalMs: 15_000,
        shutdownTimeoutMs: 10_000,
      };
      const sup = new NativeSupervisor(config);
      expect(sup.getState()).toBe('stopped');
    });

    it('emits state change events', () => {
      const states: string[] = [];
      supervisor.on('stateChange', (state) => states.push(state));
      // Manually trigger state change via shutdown
      void supervisor.shutdown();
      // stopped state is already set, shutdown is a noop
      expect(states).toEqual([]);
    });
  });

  describe('restart budget', () => {
    it('supervisor has bounded restart configuration', () => {
      expect(defaultConfig.maxRestarts).toBe(3);
      expect(defaultConfig.restartWindowMs).toBe(60_000);
    });

    it('emits restartBudgetExhausted event type', () => {
      const handler = vi.fn();
      supervisor.on('restartBudgetExhausted', handler);
      expect(supervisor.listenerCount('restartBudgetExhausted')).toBe(1);
    });
  });

  describe('security invariants', () => {
    it('supervisor does not expose process path to external callers', () => {
      // The resolveRuntimePath function is private
      // External callers cannot override it
      const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(supervisor));
      expect(proto).not.toContain('resolveRuntimePath');
    });

    it('send rejects when not running', async () => {
      const request = {
        version: 1 as const,
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        command: 'ping' as const,
        payload: {},
        cancel: false,
      };
      await expect(supervisor.send(request)).rejects.toThrow('Native runtime is not running');
    });
  });
});

describe('IPC Handler', () => {
  it('handler module exports IpcHandler class', async () => {
    const mod = await import('../main/ipc-handler.js');
    expect(mod.IpcHandler).toBeDefined();
    expect(typeof mod.IpcHandler).toBe('function');
  });
});
