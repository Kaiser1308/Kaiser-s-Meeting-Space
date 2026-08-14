import type { ProvisionalTranslation, FinalTranslation } from '@kms/translation';

export interface TranslationViewState {
  readonly final: readonly FinalTranslation[];
  readonly provisional: readonly ProvisionalTranslation[];
  readonly sourceAccessible: boolean;
}

/**
 * Projects translation state for the UI. Realtime (provisional) translations
 * stay visually distinct from authoritative final versions, and the source is
 * always marked accessible so it can never be replaced by a derived version.
 */
export function mapTranslationProjections(
  sourceText: string | null,
  final: readonly FinalTranslation[],
  provisional: readonly ProvisionalTranslation[],
): TranslationViewState {
  return {
    final,
    provisional,
    sourceAccessible: sourceText !== null && sourceText.length > 0,
  };
}

/** Realtime translations are provisional and never authoritative. */
export function isProvisionalAuthoritative(): boolean {
  return false;
}
