import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { translationVersions, translationVersionsCurrent } from './translation.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, '../../drizzle/0010_translation_versions.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('translation schema module', () => {
  it('exports the two tables', () => {
    expect(translationVersions).toBeTruthy();
    expect(translationVersionsCurrent).toBeTruthy();
  });
  it('exposes provenance columns', () => {
    expect(translationVersions.sourceTextHash).toBeTruthy();
    expect(translationVersions.provider).toBeTruthy();
    expect(translationVersions.model).toBeTruthy();
    expect(translationVersions.config).toBeTruthy();
    expect(translationVersionsCurrent.currentVersionId).toBeTruthy();
  });
});

describe('0010_translation_versions.sql migration', () => {
  it('creates the two tables', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "translation_versions"/);
    expect(migrationSql).toMatch(/CREATE TABLE "translation_versions_current"/);
  });
  it('enforces immutability on translation_versions only', () => {
    expect(migrationSql).toMatch(/BEFORE UPDATE OR DELETE ON "translation_versions"/);
    expect(migrationSql).not.toMatch(/BEFORE UPDATE OR DELETE ON "translation_versions_current"/);
  });
  it('declares idempotency unique index', () => {
    expect(migrationSql).toMatch(/CREATE UNIQUE INDEX "translation_versions_idempotency_unique"/);
  });
  it('checks source_text_hash is 64-hex', () => {
    expect(migrationSql).toMatch(/^[0-9a-fA-F]{64}/);
  });
  it('is additive (no DROP TABLE)', () => {
    expect(migrationSql).not.toMatch(/DROP TABLE/i);
  });
});
