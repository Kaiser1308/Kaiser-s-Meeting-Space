import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
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
export type LocalModelErrorCode = 'CATALOG_INVALID' | 'STORAGE' | 'MODEL_LANGUAGE_UNSUPPORTED';

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
    return { modelId: model.modelId, displayName: model.displayName, languages: model.languages, state: 'absent', downloadedBytes: 0, byteLength: model.byteLength, preferredFor };
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
