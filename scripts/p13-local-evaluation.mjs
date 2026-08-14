import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(
  root,
  'packages',
  'speech',
  'test',
  'fixtures',
  'corpus',
  'corpus.manifest.json',
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const missing = [];
for (const entry of manifest.entries ?? []) {
  if (typeof entry.audioPath !== 'string' || typeof entry.audioSha256 !== 'string') {
    missing.push({ id: entry.id, code: 'missing_audio_asset' });
    continue;
  }
  const audioPath = resolve(
    root,
    'packages',
    'speech',
    'test',
    'fixtures',
    'corpus',
    entry.audioPath,
  );
  const corpusRoot = resolve(root, 'packages', 'speech', 'test', 'fixtures', 'corpus');
  if (!audioPath.startsWith(corpusRoot + '\\\\') || !existsSync(audioPath)) {
    missing.push({ id: entry.id, code: 'missing_audio_asset' });
  }
}

if (missing.length > 0) {
  console.error(
    JSON.stringify({
      version: 'p13-local-evaluation-v1',
      pass: false,
      blocked: true,
      code: 'missing_audio_asset',
      missingCount: missing.length,
    }),
  );
  process.exitCode = 2;
} else {
  console.error(
    JSON.stringify({
      version: 'p13-local-evaluation-v1',
      pass: false,
      blocked: true,
      code: 'runtime_binding_required',
    }),
  );
  process.exitCode = 2;
}
