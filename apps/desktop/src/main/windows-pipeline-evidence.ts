import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WindowsTestDuration, WindowsTestProfile } from './windows-test-kit.js';

export type PipelineStatus = 'PASS' | 'FAIL' | 'BLOCKED';

export interface WindowsPipelineEvidence {
  profile: WindowsTestProfile;
  duration: WindowsTestDuration;
  status: PipelineStatus;
  fixtureId?: string;
  fixtureSha256?: string;
  route?: string;
  deviceLabels?: string[];
  elapsedMs?: number;
  chunkCount?: number;
  healthSamples?: number;
  storage?: Record<string, unknown>;
  transcript?: Record<string, unknown>;
  cleanup?: Record<string, unknown>;
  failureCode?: string;
  [key: string]: unknown;
}

const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,120}$/;

function safeValue(value: unknown): unknown {
  if (typeof value === 'string') return SAFE_CODE.test(value) ? value : '[redacted]';
  if (Array.isArray(value)) return value.slice(0, 100).map(safeValue);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/transcriptText|rawTranscript|audio|payload|path|device.?id|serial|secret|token/i.test(key)) {
        if (/hash|sha/i.test(key) && typeof nested === 'string') result[key] = nested;
        continue;
      }
      result[key] = safeValue(nested);
    }
    return result;
  }
  return value;
}

export function sanitizePipelineEvidence(value: WindowsPipelineEvidence): WindowsPipelineEvidence {
  const sanitized = safeValue(value) as WindowsPipelineEvidence;
  sanitized.profile = value.profile;
  sanitized.duration = value.duration;
  sanitized.status = value.status;
  return sanitized;
}

export function writePipelineEvidence(
  artifactDir: string,
  evidence: WindowsPipelineEvidence,
  metrics: readonly Record<string, unknown>[] = [],
  events: readonly Record<string, unknown>[] = [],
): void {
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, 'summary.json'), `${JSON.stringify(sanitizePipelineEvidence(evidence), null, 2)}\n`);
  writeFileSync(join(artifactDir, 'metrics.ndjson'), metrics.map((item) => JSON.stringify(safeValue(item))).join('\n') + (metrics.length ? '\n' : ''));
  writeFileSync(join(artifactDir, 'events.ndjson'), events.map((item) => JSON.stringify(safeValue(item))).join('\n') + (events.length ? '\n' : ''));
}

export function assertEvidenceContract(artifactDir: string): void {
  for (const name of ['summary.json', 'metrics.ndjson', 'events.ndjson']) {
    if (!existsSync(join(artifactDir, name))) throw new Error('pipeline_evidence_missing');
  }
}
