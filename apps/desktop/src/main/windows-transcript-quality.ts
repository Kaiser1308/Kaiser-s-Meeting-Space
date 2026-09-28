export interface QualityTranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

export interface TranscriptQualityPolicy {
  maxWer: number;
  minPhraseCoverage: number;
}

export interface TranscriptComparison {
  wer: number;
  cer: number;
  phraseCoverage: number;
  timestampCoverage: number;
  emptySegmentCount: number;
  pass: boolean;
  failureCodes: string[];
}

const MIN_PHRASE_TOKEN_COVERAGE = 0.8;

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function words(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(/\s+/u) : [];
}

function editDistance(left: readonly string[], right: readonly string[]): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]!;
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + 1,
        diagonal + cost,
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

function flattenSegments(segments: readonly QualityTranscriptSegment[]): string {
  return segments.map((segment) => segment.text).join(' ');
}

function indexTokenPositions(actualWords: readonly string[]): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  for (let index = 0; index < actualWords.length; index += 1) {
    const word = actualWords[index]!;
    const wordPositions = positions.get(word);
    if (wordPositions) wordPositions.push(index);
    else positions.set(word, [index]);
  }
  return positions;
}

function findTokenAtOrAfter(positions: readonly number[] | undefined, startIndex: number): number | undefined {
  if (!positions) return undefined;
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (positions[middle]! < startIndex) low = middle + 1;
    else high = middle;
  }
  return positions[low];
}

function orderedTokenCoverage(
  phrase: string,
  actualTokenPositions: ReadonlyMap<string, readonly number[]>,
  startIndex: number,
): { coverage: number; nextIndex: number } {
  const phraseWords = words(phrase);
  if (phraseWords.length === 0) return { coverage: 1, nextIndex: startIndex };

  let matched = 0;
  let nextActualIndex = startIndex;
  for (const word of phraseWords) {
    const matchIndex = findTokenAtOrAfter(actualTokenPositions.get(word), nextActualIndex);
    if (matchIndex === undefined) continue;
    matched += 1;
    nextActualIndex = matchIndex + 1;
  }
  return { coverage: matched / phraseWords.length, nextIndex: nextActualIndex };
}

function isValidTimestamp(segment: QualityTranscriptSegment, durationMs: number): boolean {
  return Number.isFinite(segment.startMs)
    && Number.isFinite(segment.endMs)
    && segment.startMs >= 0
    && segment.endMs > segment.startMs
    && segment.endMs <= durationMs;
}

export function compareTranscript(
  actual: readonly QualityTranscriptSegment[],
  expected: readonly QualityTranscriptSegment[],
  policy: TranscriptQualityPolicy = { maxWer: 0.25, minPhraseCoverage: 1 },
): TranscriptComparison {
  const referenceWords = words(flattenSegments(expected));
  const actualWords = words(flattenSegments(actual));
  const referenceText = normalizeText(flattenSegments(expected));
  const actualText = normalizeText(flattenSegments(actual));
  const wer = referenceWords.length === 0
    ? (actualWords.length === 0 ? 0 : 1)
    : editDistance(referenceWords, actualWords) / referenceWords.length;
  const cer = referenceText.length === 0
    ? (actualText.length === 0 ? 0 : 1)
    : editDistance([...referenceText], [...actualText]) / referenceText.length;

  const phrases = expected
    .flatMap((segment) => segment.text.split(/(?<=[.!?])\s+/u).map(normalizeText))
    .filter((phrase) => phrase.length > 0);
  const actualTokenPositions = indexTokenPositions(actualWords);
  let phraseCursor = 0;
  let phraseMatches = 0;
  for (const phrase of phrases) {
    const coverage = orderedTokenCoverage(phrase, actualTokenPositions, phraseCursor);
    if (coverage.coverage >= MIN_PHRASE_TOKEN_COVERAGE) {
      phraseMatches += 1;
      phraseCursor = coverage.nextIndex;
    }
  }
  const phraseCoverage = phrases.length === 0 ? (actualText.length === 0 ? 1 : 0) : phraseMatches / phrases.length;
  const durationMs = expected.reduce((maximum, segment) => Math.max(maximum, segment.endMs), 0);
  const timestampCoverage = actual.length === 0
    ? (expected.length === 0 ? 1 : 0)
    : actual.filter((segment) => isValidTimestamp(segment, durationMs)).length / actual.length;
  const emptySegmentCount = actual.filter((segment) => normalizeText(segment.text).length === 0).length;
  const failureCodes: string[] = [];
  if (wer > policy.maxWer) failureCodes.push('wer_threshold_failed');
  if (phraseCoverage < policy.minPhraseCoverage) failureCodes.push('phrase_coverage_failed');
  if (actual.length > 0 && timestampCoverage < 1) failureCodes.push('timestamp_coverage_failed');
  if (emptySegmentCount > 0) failureCodes.push('empty_segment');
  if (actual.length === 0) failureCodes.push('empty_transcript');
  return {
    wer,
    cer,
    phraseCoverage,
    timestampCoverage,
    emptySegmentCount,
    pass: failureCodes.length === 0,
    failureCodes,
  };
}
