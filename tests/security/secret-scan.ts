export type SecretFindingKind =
  'access_token' | 'provider_secret' | 'sql_or_database_content' | 'meeting_content';

export interface SecretFinding {
  readonly artifactIndex: number;
  readonly index: number;
  readonly kind: SecretFindingKind;
}

export interface SecretScanReport {
  readonly findings: readonly SecretFinding[];
}

const DETECTORS: readonly [SecretFindingKind, RegExp][] = [
  ['access_token', /\bBearer\s+ey[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/i],
  ['provider_secret', /\b(?:sk|pk)-[a-z0-9][a-z0-9_-]{8,}/i],
  [
    'sql_or_database_content',
    /\b(?:select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from)\b/i,
  ],
  ['meeting_content', /\b(?:transcriptText|audioData|minutesContent|meetingContent)\s*[:=]/i],
];

export function scanSyntheticArtifacts(artifacts: readonly string[]): SecretScanReport {
  const findings: SecretFinding[] = [];

  for (const [artifactIndex, artifact] of artifacts.entries()) {
    for (const [kind, detector] of DETECTORS) {
      const match = detector.exec(artifact);
      if (match && match.index !== undefined) {
        findings.push({ artifactIndex, index: match.index, kind });
      }
    }
  }

  return { findings };
}
