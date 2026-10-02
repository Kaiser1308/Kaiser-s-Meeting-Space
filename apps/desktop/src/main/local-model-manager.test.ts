import { mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { LOCAL_MODEL_CATALOG } from '../local-speech-models.js';
import { LocalModelManager } from './local-model-manager.js';

async function makeManager(verifyCatalogAuthenticity = async () => true) {
  const storageRoot = await mkdtemp(join(tmpdir(), 'kms-model-manager-'));
  return {
    storageRoot,
    manager: new LocalModelManager({
      storageRoot,
      catalog: LOCAL_MODEL_CATALOG,
      verifyCatalogAuthenticity,
      publish: vi.fn(),
    }),
    cleanup: () => rm(storageRoot, { recursive: true, force: true }),
  };
}

describe('LocalModelManager state and preferences', () => {
  it('defaults both languages to Large without downloading it', async () => {
    const { manager, cleanup } = await makeManager();
    try {
      await manager.initialize();
      expect(await manager.getPreferredModel('vi')).toBe('whisper-large-v3-turbo-q5_0');
      expect(await manager.getPreferredModel('en')).toBe('whisper-large-v3-turbo-q5_0');
      expect((await manager.listModels()).find((model) => model.modelId === 'whisper-large-v3-turbo-q5_0'))
        .toMatchObject({ state: 'absent', downloadedBytes: 0 });
    } finally {
      await cleanup();
    }
  });

  it('downloads only on request and exposes a verified binding after atomic activation', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'kms-model-download-'));
    const bytes = Buffer.from('synthetic model lifecycle fixture');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const modelId = 'whisper-small-q5_1-vi' as const;
    const profile = {
      ...LOCAL_MODEL_CATALOG.models[modelId],
      byteLength: bytes.length,
      sha256: digest,
    };
    const manager = new LocalModelManager({
      storageRoot,
      catalog: { ...LOCAL_MODEL_CATALOG, models: { ...LOCAL_MODEL_CATALOG.models, [modelId]: profile } },
      verifyCatalogAuthenticity: async () => true,
      publish: vi.fn(),
      transport: { stream: vi.fn(async () => ({ body: Readable.from([bytes]), status: 200 })) },
      getAvailableBytes: async () => Number.MAX_SAFE_INTEGER,
    });
    try {
      await manager.initialize();
      expect((await manager.listModels()).find((model) => model.modelId === modelId)?.state).toBe('absent');
      await manager.download(modelId);
      await expect(manager.resolveVerifiedModel(modelId, 'vi')).resolves.toMatchObject({
        modelId,
        modelSha256: digest,
        modelPath: profile.relativePath,
      });

      const reopened = new LocalModelManager({
        storageRoot,
        catalog: { ...LOCAL_MODEL_CATALOG, models: { ...LOCAL_MODEL_CATALOG.models, [modelId]: profile } },
        verifyCatalogAuthenticity: async () => true,
        publish: vi.fn(),
        transport: { stream: vi.fn(async () => { throw new Error('offline'); }) },
      });
      await reopened.initialize();
      await expect(reopened.resolveVerifiedModel(modelId, 'vi')).resolves.toMatchObject({
        modelId,
        modelSha256: digest,
      });
    } finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  it('fails closed if embedded catalog authenticity cannot be established', async () => {
    const { manager, cleanup } = await makeManager(async () => false);
    try {
      await expect(manager.initialize()).rejects.toMatchObject({ code: 'CATALOG_INVALID' });
    } finally {
      await cleanup();
    }
  });

  it('persists an explicit compatible Small preference and rejects an incompatible choice', async () => {
    const { storageRoot, manager, cleanup } = await makeManager();
    try {
      await manager.initialize();
      await manager.setPreferredModel('en', 'whisper-small-en-q5_1');

      const reopened = new LocalModelManager({
        storageRoot,
        catalog: LOCAL_MODEL_CATALOG,
        verifyCatalogAuthenticity: async () => true,
        publish: vi.fn(),
      });
      await reopened.initialize();
      expect(await reopened.getPreferredModel('en')).toBe('whisper-small-en-q5_1');
      await expect(reopened.setPreferredModel('vi', 'whisper-small-en-q5_1')).rejects.toMatchObject({
        code: 'MODEL_LANGUAGE_UNSUPPORTED',
      });
    } finally {
      await cleanup();
    }
  });

  it('removes a verified model from private storage without changing its preference', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'kms-model-remove-'));
    const bytes = Buffer.from('synthetic removable model');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const modelId = 'whisper-small-q5_1-vi' as const;
    const profile = { ...LOCAL_MODEL_CATALOG.models[modelId], byteLength: bytes.length, sha256: digest };
    const manager = new LocalModelManager({
      storageRoot,
      catalog: { ...LOCAL_MODEL_CATALOG, models: { ...LOCAL_MODEL_CATALOG.models, [modelId]: profile } },
      verifyCatalogAuthenticity: async () => true,
      publish: vi.fn(),
      transport: { stream: async () => ({ body: Readable.from([bytes]), status: 200 }) },
    });
    try {
      await manager.download(modelId);
      await manager.setPreferredModel('vi', modelId);
      await manager.remove(modelId);
      expect((await manager.listModels()).find((model) => model.modelId === modelId)).toMatchObject({
        state: 'absent', downloadedBytes: 0, preferredFor: ['vi'],
      });
      await expect(manager.resolveVerifiedModel(modelId, 'vi')).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' });
    } finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });
});
