import { describe, expect, it, vi } from 'vitest';

const { exposeInMainWorld, invoke, on } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener: vi.fn() },
}));

vi.mock('@kms/native-contract', () => ({
  NATIVE_IPC_CHANNEL: 'kms-native-ipc',
  NATIVE_EVENT_CHANNEL: 'kms-native-event',
  NATIVE_COMMANDS: ['ping'],
}));

describe('desktop preload bridge', () => {
  it('exposes the NativeIpcTransport on(channel, callback) contract', async () => {
    await import('./preload.js');

    expect(exposeInMainWorld).toHaveBeenCalledWith(
      'kmsNative',
      expect.objectContaining({ on: expect.any(Function) }),
    );
  });

  it('forwards the IPC channel and request as separate arguments', async () => {
    await import('./preload.js');
    const bridge = exposeInMainWorld.mock.calls[0]?.[1] as {
      invoke(channel: string, request: unknown): Promise<unknown>;
    };
    const request = { correlationId: '550e8400-e29b-41d4-a716-446655440000' };

    await bridge.invoke('kms-native-ipc', request);

    expect(invoke).toHaveBeenCalledWith('kms-native-ipc', request);
  });
});
