import { describe, expect, it, vi } from 'vitest';

const { exposeInMainWorld, invoke, on, removeListener } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
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

  it('exposes only fixed local-model actions', async () => {
    await import('./preload.js');
    expect(exposeInMainWorld).toHaveBeenCalledWith(
      'kmsModels',
      expect.objectContaining({ listModels: expect.any(Function), download: expect.any(Function) }),
    );
  });

  it('subscribes to local-model progress only through the fixed progress channel', async () => {
    await import('./preload.js');
    const bridge = exposeInMainWorld.mock.calls.find(([name]) => name === 'kmsModels')?.[1] as {
      onProgress(callback: (snapshot: unknown) => void): () => void;
    };
    const callback = vi.fn();

    const unsubscribe = bridge.onProgress(callback);
    const registered = on.mock.calls.at(-1)?.[1] as (event: unknown, snapshot: unknown) => void;
    registered({}, { modelId: 'whisper-large-v3-turbo-q5_0', state: 'downloading' });
    unsubscribe();

    expect(on.mock.calls.at(-1)?.[0]).toBe('kms-models:progress');
    expect(callback).toHaveBeenCalledWith({ modelId: 'whisper-large-v3-turbo-q5_0', state: 'downloading' });
    expect(removeListener).toHaveBeenCalledWith('kms-models:progress', registered);
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
