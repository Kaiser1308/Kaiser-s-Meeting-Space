import { describe, expect, it, vi } from 'vitest';
import { LOCAL_MODEL_CHANNELS } from '../local-model-channels.js';
import { registerLocalModelIpc } from './local-model-ipc.js';

describe('local model IPC', () => {
  it('accepts only the main-window sender and fixed catalog actions', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, payload: unknown) => Promise<unknown>>();
    const mainSender = {};
    const manager = {
      listModels: vi.fn().mockResolvedValue([]),
      getPreferredModel: vi.fn(),
      setPreferredModel: vi.fn(),
      download: vi.fn(),
      remove: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    registerLocalModelIpc(
      { handle: vi.fn((channel, handler) => handlers.set(channel, handler)) } as never,
      manager as never,
      () => ({ webContents: mainSender }) as never,
    );

    await expect(handlers.get(LOCAL_MODEL_CHANNELS.list)!({ sender: {} }, {})).rejects.toThrow(
      'MODEL_IPC_DENIED',
    );
    await expect(handlers.get(LOCAL_MODEL_CHANNELS.download)!({ sender: mainSender }, {
      modelId: 'https://untrusted.example/model.bin',
    })).rejects.toThrow('MODEL_IPC_INVALID_REQUEST');
    await handlers.get(LOCAL_MODEL_CHANNELS.download)!({ sender: mainSender }, {
      modelId: 'whisper-large-v3-turbo-q5_0',
    });
    expect(manager.download).toHaveBeenCalledWith('whisper-large-v3-turbo-q5_0');
    await handlers.get('kms-models:remove')!({ sender: mainSender }, { modelId: 'whisper-large-v3-turbo-q5_0' });
    expect(manager.remove).toHaveBeenCalledWith('whisper-large-v3-turbo-q5_0');
  });
});
