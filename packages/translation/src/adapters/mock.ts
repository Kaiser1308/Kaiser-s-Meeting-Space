import type { TranslationResultV1, TranslationInputV1 } from '../core/contracts.js';
import type { TranslationProvider } from './provider.js';

export class DeterministicMockTranslationProvider implements TranslationProvider {
  readonly id = 'mock';

  async translate(input: TranslationInputV1): Promise<TranslationResultV1> {
    const marker = input.targetLanguage === 'vi' ? 'vi' : 'en';
    return {
      translatedText: '[' + marker + ']',
      provider: this.id,
      model: 'mock-v1',
      config: {},
      usage: { costMicrounits: 0 },
    };
  }

  async healthcheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}
