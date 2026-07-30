import { describe, it, expect } from 'vitest';
import { ModelManifestEntrySchema, ModelManifestSchema } from './speech-manifest.js';

const VALID_ENTRY = {
  modelId: 'whisper-tiny-vi',
  language: 'vi' as const,
  engineType: 'whisper_cpp_compat' as const,
  path: 'models/whisper-tiny-vi.bin',
  sha256: 'a'.repeat(64),
  maxConcurrentStreams: 2,
  licenseProvenance: {
    license: 'MIT',
    reviewedBy: 'engineering',
    reviewedAt: '2026-07-01T00:00:00.000Z',
  },
};

describe('ModelManifestEntrySchema', () => {
  it('accepts valid vi entry', () => {
    expect(() => ModelManifestEntrySchema.parse(VALID_ENTRY)).not.toThrow();
  });

  it('accepts valid en entry', () => {
    const en = { ...VALID_ENTRY, modelId: 'whisper-small-en', language: 'en' as const };
    expect(() => ModelManifestEntrySchema.parse(en)).not.toThrow();
  });

  it('rejects engineType not whisper_cpp_compat', () => {
    const entry = { ...VALID_ENTRY, engineType: 'other' };
    expect(() => ModelManifestEntrySchema.parse(entry)).toThrow();
  });

  it('rejects language fr', () => {
    const entry = { ...VALID_ENTRY, language: 'fr' };
    expect(() => ModelManifestEntrySchema.parse(entry)).toThrow();
  });

  it('rejects missing licenseProvenance', () => {
    const { licenseProvenance: _, ...entry } = VALID_ENTRY;
    expect(() => ModelManifestEntrySchema.parse(entry)).toThrow();
  });

  it('rejects path with ..', () => {
    expect(() =>
      ModelManifestEntrySchema.parse({ ...VALID_ENTRY, path: '../secret/model.bin' }),
    ).toThrow(/parent-directory traversal/);
  });

  it('rejects absolute path', () => {
    expect(() =>
      ModelManifestEntrySchema.parse({ ...VALID_ENTRY, path: '/etc/models/model.bin' }),
    ).toThrow(/relative/);
  });

  it('rejects path with drive-letter colon', () => {
    expect(() => ModelManifestEntrySchema.parse({ ...VALID_ENTRY, path: 'C:model.bin' })).toThrow(
      /drive-letter/,
    );
  });

  it('rejects path with shell metacharacters', () => {
    expect(() =>
      ModelManifestEntrySchema.parse({ ...VALID_ENTRY, path: 'model;rm -rf /' }),
    ).toThrow();
  });

  it('rejects sha256 not 64-hex', () => {
    expect(() => ModelManifestEntrySchema.parse({ ...VALID_ENTRY, sha256: 'abc123' })).toThrow();
  });

  it('rejects maxConcurrentStreams 0', () => {
    expect(() =>
      ModelManifestEntrySchema.parse({ ...VALID_ENTRY, maxConcurrentStreams: 0 }),
    ).toThrow();
  });

  it('rejects maxConcurrentStreams > 8', () => {
    expect(() =>
      ModelManifestEntrySchema.parse({ ...VALID_ENTRY, maxConcurrentStreams: 9 }),
    ).toThrow();
  });

  it('rejects unknown extra fields', () => {
    expect(() => ModelManifestEntrySchema.parse({ ...VALID_ENTRY, bogusField: true })).toThrow();
  });
});

describe('ModelManifestSchema', () => {
  it('accepts valid manifest with two models', () => {
    const en = { ...VALID_ENTRY, modelId: 'whisper-small-en', language: 'en' as const };
    const manifest = { version: 1 as const, models: [VALID_ENTRY, en] };
    expect(() => ModelManifestSchema.parse(manifest)).not.toThrow();
  });

  it('rejects empty models array', () => {
    expect(() => ModelManifestSchema.parse({ version: 1, models: [] })).toThrow();
  });

  it('rejects version not 1', () => {
    expect(() => ModelManifestSchema.parse({ version: 2, models: [VALID_ENTRY] })).toThrow();
  });
});
