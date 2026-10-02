import { describe, expect, it, vi } from 'vitest';
import { IpcHandler } from './ipc-handler.js';

describe('IpcHandler', () => {
  it('derives local model binding from the verified manager instead of accepting renderer paths', async () => {
    const supervisor = {
      getState: vi.fn(() => 'running'),
      send: vi.fn(async (request) => ({
        version: 1,
        correlationId: request.correlationId,
        command: request.command,
        success: true,
        payload: { initialized: true },
      })),
    };
    const modelManager = {
      resolveVerifiedModel: vi.fn(async () => ({
        modelId: 'whisper-large-v3-turbo-q5_0',
        language: 'vi',
        modelPath: 'models/whisper-large-v3-turbo-q5_0/ggml-large-v3-turbo-q5_0.bin',
        modelSha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
      })),
    };
    let handler: ((event: unknown, request: unknown) => Promise<unknown>) | undefined;
    const ipcMain = {
      handle: vi.fn((_channel: string, registered: (event: unknown, request: unknown) => Promise<unknown>) => {
        handler = registered;
      }),
    };
    new IpcHandler(supervisor as never, modelManager as never).register(ipcMain as never);

    expect(handler).toBeTypeOf('function');
    await handler!({}, {
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'local_speech_engine_init',
      payload: { modelId: 'whisper-large-v3-turbo-q5_0', language: 'vi' },
      cancel: false,
    });

    expect(modelManager.resolveVerifiedModel).toHaveBeenCalledWith('whisper-large-v3-turbo-q5_0', 'vi');
    expect(supervisor.send).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        modelId: 'whisper-large-v3-turbo-q5_0',
        language: 'vi',
        modelPath: 'models/whisper-large-v3-turbo-q5_0/ggml-large-v3-turbo-q5_0.bin',
        modelSha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
      },
    }));
  });

  it('rejects renderer-supplied local model paths before forwarding the command', async () => {
    const supervisor = { getState: vi.fn(() => 'running'), send: vi.fn() };
    let handler: ((event: unknown, request: unknown) => Promise<any>) | undefined;
    const ipcMain = {
      handle: vi.fn((_channel: string, registered: (event: unknown, request: unknown) => Promise<any>) => {
        handler = registered;
      }),
    };
    new IpcHandler(supervisor as never, { resolveVerifiedModel: vi.fn() } as never).register(ipcMain as never);

    expect(handler).toBeTypeOf('function');
    const response = await handler!({}, {
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'local_speech_engine_init',
      payload: {
        modelId: 'whisper-large-v3-turbo-q5_0',
        language: 'vi',
        modelPath: 'C:/untrusted/model.bin',
      },
      cancel: false,
    });

    expect(response).toMatchObject({ success: false, error: { code: 'INVALID_MODEL_REQUEST' } });
    expect(supervisor.send).not.toHaveBeenCalled();
  });

  it('preserves a valid request correlation ID when the native supervisor rejects', async () => {
    const supervisor = {
      getState: vi.fn(() => 'running'),
      send: vi.fn(async () => {
        throw new Error('native process disconnected');
      }),
    };
    let handler: ((event: unknown, request: unknown) => Promise<unknown>) | undefined;
    const ipcMain = {
      handle: vi.fn((_channel: string, registered: (event: unknown, request: unknown) => Promise<unknown>) => {
        handler = registered;
      }),
    };
    new IpcHandler(supervisor as never).register(ipcMain as never);

    const response = await handler?.({}, {
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      payload: {},
      cancel: false,
    });

    expect(response).toMatchObject({
      success: false,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      error: { code: 'INTERNAL', category: 'internal' },
    });
  });
});
