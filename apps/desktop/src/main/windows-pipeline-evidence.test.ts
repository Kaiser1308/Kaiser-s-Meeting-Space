import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertEvidenceContract, sanitizePipelineEvidence, writePipelineEvidence } from './windows-pipeline-evidence.js';

describe('Windows pipeline evidence', () => {
  it('redacts paths, raw payloads, device ids, and transcript text while retaining metrics', () => {
    const evidence = sanitizePipelineEvidence({
      profile: 'simulator-full', duration: '5m', status: 'PASS', elapsedMs: 300000,
      fixtureSha256: 'a'.repeat(64), deviceLabels: ['microphone'],
      sourcePath: 'C:\\private\\audio.wav', rawPayload: 'secret', transcriptText: 'private words', chunkCount: 60,
    });
    expect(evidence).toMatchObject({ profile: 'simulator-full', duration: '5m', status: 'PASS', elapsedMs: 300000, chunkCount: 60, fixtureSha256: 'a'.repeat(64) });
    expect(JSON.stringify(evidence)).not.toContain('private');
    expect(JSON.stringify(evidence)).not.toContain('secret');
  });

  it('writes the common evidence files with safe operational fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kms-pipeline-evidence-'));
    try {
      writePipelineEvidence(dir, { profile: 'physical-recording', duration: '5m', status: 'BLOCKED', failureCode: 'missing_mic_device' }, [{ elapsedMs: 0 }], [{ event: 'blocked' }]);
      assertEvidenceContract(dir);
      expect(JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).failureCode).toBe('missing_mic_device');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
