import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { LOCAL_MODEL_CATALOG } from '../local-speech-models.js';
import { IpcHandler } from './ipc-handler.js';
import { LocalModelManager } from './local-model-manager.js';

describe('verified local-model native initialization', () => {
  it('downloads a synthetic artifact and derives the native binding in main process', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'kms-local-model-integration-'));
    const bytes = Buffer.from('synthetic verified local model');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const modelId = 'whisper-small-q5_1-vi' as const;
    const profile = {
      ...LOCAL_MODEL_CATALOG.models[modelId],
      byteLength: bytes.length,
      sha256: digest,
      relativePath: `models/${modelId}/${digest}.bin` as const,
    };
    const catalog = { ...LOCAL_MODEL_CATALOG, models: { ...LOCAL_MODEL_CATALOG.models, [modelId]: profile } };
    const manager = new LocalModelManager({
      storageRoot,
      catalog,
      verifyCatalogAuthenticity: async () => true,
      publish: vi.fn(),
      transport: { stream: async () => ({ body: Readable.from([bytes]), status: 200 }) },
      getAvailableBytes: async () => Number.MAX_SAFE_INTEGER,
    });
    const supervisor = {
      getState: vi.fn(() => 'running'),
      send: vi.fn(async (request) => ({ version: 1, correlationId: request.correlationId, command: request.command, success: true, payload: { initialized: true } })),
    };
    let invoke: ((event: unknown, request: unknown) => Promise<unknown>) | undefined;
    try {
      await manager.download(modelId);
      new IpcHandler(supervisor as never, manager).register({ handle: vi.fn((_channel, handler) => { invoke = handler; }) } as never);
      const response = await invoke!({}, {
        version: 1, correlationId: '550e8400-e29b-41d4-a716-446655440000', command: 'local_speech_engine_init',
        payload: { modelId, language: 'vi' }, cancel: false,
      });
      expect(response).toMatchObject({ success: true });
      expect(supervisor.send).toHaveBeenCalledWith(expect.objectContaining({ payload: {
        modelId, language: 'vi', modelPath: profile.relativePath, modelSha256: digest,
      } }));
    } finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });
});
