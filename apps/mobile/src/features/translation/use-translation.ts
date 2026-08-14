import { useState } from 'react';
import type { ProvisionalTranslation, FinalTranslation } from '@kms/translation';

export interface TranslationViewState {
  provisional: readonly ProvisionalTranslation[];
  final: readonly FinalTranslation[];
}

export function useTranslationState(): {
  state: TranslationViewState;
  setProvisional(items: readonly ProvisionalTranslation[]): void;
  setFinal(items: readonly FinalTranslation[]): void;
} {
  const [state, setState] = useState<TranslationViewState>({ provisional: [], final: [] });
  return {
    state,
    setProvisional: (items) => setState((s) => ({ ...s, provisional: items })),
    setFinal: (items) => setState((s) => ({ ...s, final: items })),
  };
}
