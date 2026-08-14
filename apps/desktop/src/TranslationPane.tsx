import type { ProvisionalTranslation, FinalTranslation } from '@kms/translation';
import { mapTranslationProjections } from './translation-view-model.js';

export interface TranslationPaneProps {
  sourceText: string;
  provisional: readonly ProvisionalTranslation[];
  final: readonly FinalTranslation[];
}

/**
 * Source + translation display. The source is always shown (never replaced by
 * a derived translation); realtime (provisional) text is visually separate from
 * the authoritative final versions.
 */
export function TranslationPane({ sourceText, provisional, final }: TranslationPaneProps) {
  const view = mapTranslationProjections(sourceText, final, provisional);
  return (
    <div className="translation-pane">
      <section className="translation-pane__source" aria-label="Source transcript">
        {sourceText}
      </section>
      <section className="translation-pane__provisional" aria-label="Realtime translation">
        {view.provisional.map((p) => (
          <p key={p.sourceSegmentId}>{p.text}</p>
        ))}
      </section>
      <section className="translation-pane__final" aria-label="Final translation">
        {view.final.map((f) => (
          <p key={f.versionId}>{f.text}</p>
        ))}
      </section>
    </div>
  );
}
