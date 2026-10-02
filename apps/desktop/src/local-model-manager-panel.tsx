import type { LocalModelSnapshot } from './main/local-model-manager.js';
import type { LocalModelId, SpeechLanguage } from './local-speech-models.js';
import { getLocalModelAction } from './local-model-manager-view-model.js';

function sizeLabel(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MiB`;
}

export function LocalModelManagerPanel({
  models,
  language,
  error,
  onDownload,
  onSelect,
}: {
  models: readonly LocalModelSnapshot[];
  language: SpeechLanguage;
  error: string | null;
  onDownload(modelId: LocalModelId): void;
  onSelect(language: SpeechLanguage, modelId: LocalModelId): void;
}) {
  return (
    <section data-testid="local-model-manager" aria-label="Local speech models" style={{ marginTop: '16px' }}>
      <p className="eyebrow" style={{ margin: 0 }}>LOCAL SPEECH MODELS</p>
      <p style={{ fontSize: '12px', margin: '4px 0 10px' }}>
        Downloads happen only after you choose Download. Recording remains available while a model is absent.
      </p>
      {error && <div role="alert">{error}</div>}
      <div style={{ display: 'grid', gap: '8px' }}>
        {models.map((model) => {
          const action = getLocalModelAction(model, language);
          const progress = model.byteLength === 0 ? 0 : Math.round((model.downloadedBytes / model.byteLength) * 100);
          return (
            <div key={model.modelId} style={{ border: '1px solid #2a473a', borderRadius: '8px', padding: '10px' }}>
              <strong>{model.displayName}</strong> <span>({sizeLabel(model.byteLength)})</span>
              <div style={{ fontSize: '12px' }}>
                {model.languages.join(', ').toUpperCase()} · {model.state}
                {(model.state === 'downloading' || model.state === 'verifying') && ` · ${progress}%`}
              </div>
              {action.kind === 'download' && <button onClick={() => onDownload(model.modelId)}>{action.label}</button>}
              {action.kind === 'select' && <button onClick={() => onSelect(language, model.modelId)}>{action.label}</button>}
              {(action.kind === 'waiting' || action.kind === 'selected' || action.kind === 'unavailable') && (
                <span role="status">{action.label}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
