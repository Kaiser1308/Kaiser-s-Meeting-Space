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
    .map((segment) => normalizeText(segment.text))
    .filter((phrase) => phrase.length > 0);
  const phraseMatches = phrases.filter((phrase) => actualText.includes(phrase)).length;
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
