import type { LocalModelSnapshot } from './main/local-model-manager.js';
import type { SpeechLanguage } from './local-speech-models.js';

export type LocalModelAction =
  | { kind: 'download'; label: 'Download' }
  | { kind: 'select'; label: string }
  | { kind: 'waiting'; label: 'Downloading…' | 'Verifying…' }
  | { kind: 'selected'; label: 'Selected' }
  | { kind: 'unavailable'; label: 'Unavailable' };

export function getLocalModelAction(
  model: LocalModelSnapshot,
  language: SpeechLanguage,
): LocalModelAction {
  if (!model.languages.includes(language)) return { kind: 'unavailable', label: 'Unavailable' };
  if (model.state === 'absent' || model.state === 'failed') return { kind: 'download', label: 'Download' };
  if (model.state === 'downloading') return { kind: 'waiting', label: 'Downloading…' };
  if (model.state === 'verifying') return { kind: 'waiting', label: 'Verifying…' };
  if (model.state !== 'ready') return { kind: 'unavailable', label: 'Unavailable' };
  if (model.preferredFor.includes(language)) return { kind: 'selected', label: 'Selected' };
  return { kind: 'select', label: `Use for ${language === 'vi' ? 'Vietnamese' : 'English'}` };
}
