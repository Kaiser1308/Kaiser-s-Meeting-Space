import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import type { QualityTranscriptSegment } from './windows-transcript-quality.js';

export interface AudioFixtureManifest {
  fixtureId: string;
  language: 'vi' | 'en';
  wavPath: string;
  wavSha256: string;
  durationMs: number;
  expectedTranscriptPath: string;
  expectedTranscriptSha256: string;
  maxWer: number;
  minPhraseCoverage: number;
}

export interface ExpectedTranscript {
  fixtureId: string;
  language: 'vi' | 'en';
  durationMs: number;
  segments: QualityTranscriptSegment[];
}

const MANIFEST_FILE = 'fixture.json';
const SHA256 = /^[a-f0-9]{64}$/i;

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')) as unknown;
}

function isManifest(value: unknown): value is AudioFixtureManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Record<string, unknown>;
  const durationMs = manifest.durationMs;
  return typeof manifest.fixtureId === 'string'
    && (manifest.language === 'vi' || manifest.language === 'en')
    && typeof manifest.wavPath === 'string'
    && SHA256.test(String(manifest.wavSha256))
    && Number.isSafeInteger(durationMs)
    && (durationMs as number) > 0
    && typeof manifest.expectedTranscriptPath === 'string'
    && SHA256.test(String(manifest.expectedTranscriptSha256))
    && typeof manifest.maxWer === 'number'
    && manifest.maxWer >= 0 && manifest.maxWer <= 1
    && typeof manifest.minPhraseCoverage === 'number'
    && manifest.minPhraseCoverage >= 0 && manifest.minPhraseCoverage <= 1;
}

function resolveManifestPath(root: string, candidate: string): string {
  if (isAbsolute(candidate) || candidate.includes('..')) throw new Error('fixture_path_invalid');
  const path = resolve(root, candidate);
  if (basename(path) !== basename(candidate)) throw new Error('fixture_path_invalid');
  return path;
}

export function loadAudioFixture(root: string): AudioFixtureManifest {
  const rootPath = resolve(root);
  const manifestPath = join(rootPath, MANIFEST_FILE);
  if (!existsSync(manifestPath)) throw new Error('fixture_manifest_missing');
  const parsed = readJson(manifestPath);
  if (!isManifest(parsed)) throw new Error('fixture_manifest_invalid');
  return {
    ...parsed,
    wavPath: resolveManifestPath(rootPath, parsed.wavPath),
    expectedTranscriptPath: resolveManifestPath(rootPath, parsed.expectedTranscriptPath),
  };
}

export function validateAudioFixture(manifest: AudioFixtureManifest): void {
  if (!isManifest(manifest)) throw new Error('fixture_manifest_invalid');
  if (!existsSync(manifest.wavPath)) throw new Error('fixture_wav_missing');
  if (!existsSync(manifest.expectedTranscriptPath)) throw new Error('fixture_transcript_missing');
  const wav = readFileSync(manifest.wavPath);
  if (wav.length < 44 || wav.subarray(0, 4).toString('ascii') !== 'RIFF' || wav.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw new Error('fixture_wav_invalid');
  }
  if (sha256(manifest.wavPath).toLowerCase() !== manifest.wavSha256.toLowerCase()) throw new Error('fixture_wav_hash_mismatch');
  if (sha256(manifest.expectedTranscriptPath).toLowerCase() !== manifest.expectedTranscriptSha256.toLowerCase()) throw new Error('fixture_transcript_hash_mismatch');
  const transcript = readJson(manifest.expectedTranscriptPath) as Partial<ExpectedTranscript>;
  if (transcript.fixtureId !== manifest.fixtureId || transcript.language !== manifest.language || transcript.durationMs !== manifest.durationMs || !Array.isArray(transcript.segments) || transcript.segments.length === 0) {
    throw new Error('fixture_transcript_invalid');
  }
  for (const segment of transcript.segments) {
    if (!segment || typeof segment.text !== 'string' || !Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.startMs < 0 || segment.endMs <= segment.startMs || segment.endMs > manifest.durationMs) {
      throw new Error('fixture_transcript_invalid');
    }
  }
}

export function buildRepeatedTranscript(manifest: AudioFixtureManifest, durationMs: number): ExpectedTranscript {
  validateAudioFixture(manifest);
  if (!Number.isSafeInteger(durationMs) || durationMs < manifest.durationMs || durationMs % manifest.durationMs !== 0) throw new Error('unsupported_fixture_duration');
  const source = readJson(manifest.expectedTranscriptPath) as ExpectedTranscript;
  const segments: QualityTranscriptSegment[] = [];
  for (let offset = 0; offset < durationMs; offset += manifest.durationMs) {
    for (const segment of source.segments) segments.push({ ...segment, startMs: segment.startMs + offset, endMs: segment.endMs + offset });
  }
  return { fixtureId: manifest.fixtureId, language: manifest.language, durationMs, segments };
}
