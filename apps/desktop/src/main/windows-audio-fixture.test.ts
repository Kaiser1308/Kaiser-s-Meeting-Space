import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRepeatedTranscript, loadAudioFixture, validateAudioFixture, type AudioFixtureManifest } from './windows-audio-fixture.js';

function makeFixture(): { root: string; manifest: AudioFixtureManifest } {
  const root = mkdtempSync(join(tmpdir(), 'kms-audio-fixture-'));
  mkdirSync(root, { recursive: true });
  const wav = Buffer.alloc(48);
  wav.write('RIFF', 0, 'ascii'); wav.writeUInt32LE(40, 4); wav.write('WAVE', 8, 'ascii'); wav.write('fmt ', 12, 'ascii'); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36, 'ascii'); wav.writeUInt32LE(4, 40);
  writeFileSync(join(root, 'fixture.wav'), wav);
  const transcript = { fixtureId: 'test-fixture', language: 'en', durationMs: 1000, segments: [{ startMs: 0, endMs: 900, text: 'Alpha approves the action item.' }] };
  writeFileSync(join(root, 'expected-transcript.json'), JSON.stringify(transcript));
  const hash = (name: string) => createHash('sha256').update(readFileSync(join(root, name))).digest('hex');
  const manifest = { fixtureId: 'test-fixture', language: 'en', wavPath: 'fixture.wav', wavSha256: hash('fixture.wav'), durationMs: 1000, expectedTranscriptPath: 'expected-transcript.json', expectedTranscriptSha256: hash('expected-transcript.json'), maxWer: 0, minPhraseCoverage: 1 } as AudioFixtureManifest;
  writeFileSync(join(root, 'fixture.json'), JSON.stringify(manifest));
  return { root, manifest: { ...manifest, wavPath: join(root, 'fixture.wav'), expectedTranscriptPath: join(root, 'expected-transcript.json') } };
}

describe('Windows audio fixture', () => {
  it('loads and validates the immutable manifest and hashes', () => {
    const fixture = makeFixture();
    try { expect(loadAudioFixture(fixture.root)).toMatchObject(fixture.manifest); expect(() => validateAudioFixture(loadAudioFixture(fixture.root))).not.toThrow(); } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

  it('rejects changed source and transcript hashes', () => {
    const fixture = makeFixture();
    try {
      const changed = readFileSync(fixture.manifest.wavPath);
      changed[44] = 1;
      writeFileSync(fixture.manifest.wavPath, changed);
      expect(() => validateAudioFixture(fixture.manifest)).toThrow('fixture_wav_hash_mismatch');
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

  it('builds deterministic repeated transcripts only for exact fixture multiples', () => {
    const fixture = makeFixture();
    try { expect(buildRepeatedTranscript(fixture.manifest, 3000).segments).toHaveLength(3); expect(() => buildRepeatedTranscript(fixture.manifest, 2500)).toThrow('unsupported_fixture_duration'); } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

  it('validates the committed synthetic meeting fixture', () => {
    const root = join(process.cwd(), 'test-fixtures', 'synthetic-meeting');
    const manifest = loadAudioFixture(root);
    expect(() => validateAudioFixture(manifest)).not.toThrow();
  });
});
