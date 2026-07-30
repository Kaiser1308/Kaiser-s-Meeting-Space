import { describe, expect, it } from 'vitest';
import { scanSyntheticArtifacts } from './secret-scan.js';

describe('synthetic secret-leak regression scan', () => {
  it('passes safe responses, logs, and bundles without content fields', () => {
    expect(
      scanSyntheticArtifacts([
        '{"status":"ok","requestId":"req-synthetic-1"}',
        '{"event":"job.completed","jobId":"job-synthetic-1","durationMs":12}',
        'export const build = "synthetic-bundle";',
      ]).findings,
    ).toEqual([]);
  });

  it('detects bearer tokens, provider keys, SQL, and meeting content in every artifact type', () => {
    const report = scanSyntheticArtifacts([
      'response: Bearer eyJhbGciOiJub25lIn0.synthetic.signature',
      'log: providerKey=sk-synthetic-provider-key',
      "bundle: SELECT * FROM meetings WHERE title = 'Synthetic Meeting'",
      'response: transcriptText=synthetic transcript content',
    ]);

    expect(report.findings.map((finding) => finding.kind)).toEqual([
      'access_token',
      'provider_secret',
      'sql_or_database_content',
      'meeting_content',
    ]);
    expect(report.findings.every((finding) => finding.index >= 0)).toBe(true);
  });
});
