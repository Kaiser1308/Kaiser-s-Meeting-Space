import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import {
  getCompatibleModel,
  getDefaultModelId,
  isLocalModelId,
  isSpeechLanguage,
  type LocalModelCatalogV1,
  type LocalModelId,
  type LocalModelProfileV1,
  type SpeechLanguage,
} from '../local-speech-models.js';

export type LocalModelState = 'absent' | 'downloading' | 'paused' | 'verifying' | 'ready' | 'failed' | 'removing';
export type LocalModelErrorCode =
  | 'CATALOG_INVALID'
  | 'STORAGE'
  | 'MODEL_LANGUAGE_UNSUPPORTED'
  | 'DISK_SPACE'
  | 'INTEGRITY'
  | 'NETWORK'
  | 'MODEL_NOT_FOUND';

export class LocalModelError extends Error {
  constructor(readonly code: LocalModelErrorCode, message: string) {
    super(message);
    this.name = 'LocalModelError';
  }
}

export interface LocalModelSnapshot {
  modelId: LocalModelId;
  displayName: string;
  languages: readonly SpeechLanguage[];
  state: LocalModelState;
  downloadedBytes: number;
  byteLength: number;
  preferredFor: readonly SpeechLanguage[];
  errorCode?: LocalModelErrorCode;
}

export interface LocalModelManagerOptions {
  storageRoot: string;
  catalog: LocalModelCatalogV1;
  verifyCatalogAuthenticity(): Promise<boolean>;
  publish(snapshot: LocalModelSnapshot): void;
  transport?: ArtifactTransport;
  getAvailableBytes?: (path: string) => Promise<number>;
}

export interface ArtifactTransport {
  stream(input: { profile: LocalModelProfileV1; signal: AbortSignal }): Promise<{ body: Readable; status: number }>;
}

export interface NativeModelBinding {
  modelId: LocalModelId;
  language: SpeechLanguage;
  modelPath: LocalModelProfileV1['relativePath'];
  modelSha256: string;
}

interface PersistedStateV1 {
  version: 1;
  preferred: Record<SpeechLanguage, LocalModelId>;
}

const STATE_FILE = 'local-model-state-v1.json';

export async function resolveCatalogPath(storageRoot: string, profile: LocalModelProfileV1): Promise<string> {
  const root = resolve(storageRoot);
  const candidate = resolve(root, profile.relativePath);
  const escaped = relative(root, candidate).startsWith('..');
  if (escaped || candidate === root) throw new LocalModelError('STORAGE', 'Invalid model storage path');
  return candidate;
}

export class LocalModelManager {
  private readonly listeners = new Set<(snapshot: LocalModelSnapshot) => void>();
  private state: PersistedStateV1 | undefined;
  private readonly modelState = new Map<LocalModelId, LocalModelState>();
  private readonly downloadedBytes = new Map<LocalModelId, number>();

  constructor(private readonly options: LocalModelManagerOptions) {}

  async initialize(): Promise<void> {
    if (this.state) return;
    if (!(await this.options.verifyCatalogAuthenticity())) {
      throw new LocalModelError('CATALOG_INVALID', 'Local model catalog is unavailable');
    }
    try {
      await mkdir(resolve(this.options.storageRoot, 'models'), { recursive: true });
      this.state = await this.readState();
      await this.writeState();
    } catch (error) {
      if (error instanceof LocalModelError) throw error;
      throw new LocalModelError('STORAGE', 'Local model state could not be initialized');
    }
  }

  async listModels(): Promise<readonly LocalModelSnapshot[]> {
    await this.initialize();
    return Object.values(this.options.catalog.models).map((model) => this.snapshot(model));
  }

  async getPreferredModel(language: SpeechLanguage): Promise<LocalModelId> {
    await this.initialize();
    return this.requireState().preferred[language];
  }

  async setPreferredModel(language: SpeechLanguage, modelId: LocalModelId): Promise<void> {
    await this.initialize();
    try {
      getCompatibleModel(modelId, language);
    } catch {
      throw new LocalModelError('MODEL_LANGUAGE_UNSUPPORTED', 'Selected model does not support this language');
    }
    this.requireState().preferred[language] = modelId;
    await this.writeState();
    this.publish(this.options.catalog.models[modelId]);
  }

  async download(modelId: LocalModelId): Promise<void> {
    await this.initialize();
    const transport = this.options.transport;
    if (!transport) throw new LocalModelError('NETWORK', 'Model download is unavailable');
    const profile = this.options.catalog.models[modelId];
    const target = await resolveCatalogPath(this.options.storageRoot, profile);
    const available = await this.options.getAvailableBytes?.(dirname(target));
    if (available !== undefined && available < profile.byteLength) {
      throw new LocalModelError('DISK_SPACE', 'Insufficient disk space for selected model');
    }
    const partial = `${target}.partial`;
    const controller = new AbortController();
    this.modelState.set(modelId, 'downloading');
    this.downloadedBytes.set(modelId, 0);
    this.publish(profile);
    try {
      await mkdir(dirname(target), { recursive: true });
      const response = await transport.stream({ profile, signal: controller.signal });
      if (response.status !== 200) throw new LocalModelError('NETWORK', 'Model download failed');
      const file = await open(partial, 'w', 0o600);
      const hash = createHash('sha256');
      let total = 0;
      try {
        for await (const value of response.body) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          total += chunk.length;
          if (total > profile.byteLength) throw new LocalModelError('INTEGRITY', 'Model size is invalid');
          hash.update(chunk);
          await file.write(chunk);
          this.downloadedBytes.set(modelId, total);
          this.publish(profile);
        }
      } finally {
        await file.close();
      }
      this.modelState.set(modelId, 'verifying');
      this.publish(profile);
      if (total !== profile.byteLength || hash.digest('hex') !== profile.sha256) {
        throw new LocalModelError('INTEGRITY', 'Model integrity check failed');
      }
      await rename(partial, target);
      this.modelState.set(modelId, 'ready');
      this.downloadedBytes.set(modelId, total);
      this.publish(profile);
    } catch (error) {
      await rm(partial, { force: true }).catch(() => undefined);
      this.modelState.set(modelId, 'failed');
      this.publish(profile);
      if (error instanceof LocalModelError) throw error;
      throw new LocalModelError('NETWORK', 'Model download failed');
    }
  }

  async resolveVerifiedModel(modelId: LocalModelId, language: SpeechLanguage): Promise<NativeModelBinding> {
    await this.initialize();
    const profile = this.options.catalog.models[modelId];
    if (!profile.languages.includes(language)) {
      throw new LocalModelError('MODEL_LANGUAGE_UNSUPPORTED', 'Selected model does not support this language');
    }
    if (this.modelState.get(modelId) !== 'ready') {
      throw new LocalModelError('MODEL_NOT_FOUND', 'Selected local model is unavailable');
    }
    return { modelId, language, modelPath: profile.relativePath, modelSha256: profile.sha256 };
  }

  subscribe(listener: (snapshot: LocalModelSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async readState(): Promise<PersistedStateV1> {
    const defaults: PersistedStateV1 = {
      version: 1,
      preferred: { vi: getDefaultModelId('vi'), en: getDefaultModelId('en') },
    };
    try {
      const value: unknown = JSON.parse(await readFile(resolve(this.options.storageRoot, STATE_FILE), 'utf8'));
      if (!value || typeof value !== 'object') return defaults;
      const preferred = (value as { preferred?: unknown }).preferred;
      if (!preferred || typeof preferred !== 'object') return defaults;
      const candidate = preferred as Record<string, unknown>;
      const next = { ...defaults.preferred };
      for (const language of ['vi', 'en'] as const) {
        const modelId = candidate[language];
        if (isLocalModelId(modelId) && isSpeechLanguage(language)) {
          try { getCompatibleModel(modelId, language); next[language] = modelId; } catch { /* retain default */ }
        }
      }
      return { version: 1, preferred: next };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return defaults;
      return defaults;
    }
  }

  private async writeState(): Promise<void> {
    const root = resolve(this.options.storageRoot);
    const target = resolve(root, STATE_FILE);
    const temp = resolve(root, `${STATE_FILE}.tmp`);
    await writeFile(temp, JSON.stringify(this.requireState()), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, target);
  }

  private snapshot(model: LocalModelProfileV1): LocalModelSnapshot {
    const preferredFor = (['vi', 'en'] as const).filter(
      (language) => this.requireState().preferred[language] === model.modelId,
    );
    return { modelId: model.modelId, displayName: model.displayName, languages: model.languages, state: this.modelState.get(model.modelId) ?? 'absent', downloadedBytes: this.downloadedBytes.get(model.modelId) ?? 0, byteLength: model.byteLength, preferredFor };
  }

  private publish(model: LocalModelProfileV1): void {
    const snapshot = this.snapshot(model);
    this.options.publish(snapshot);
    for (const listener of this.listeners) listener(snapshot);
  }

  private requireState(): PersistedStateV1 {
    if (!this.state) throw new LocalModelError('STORAGE', 'Local model manager is not initialized');
    return this.state;
  }
}
