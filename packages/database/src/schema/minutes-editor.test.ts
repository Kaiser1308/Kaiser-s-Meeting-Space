import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { minutesEditorVersions, minutesEditorCurrent } from './minutes-editor.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(resolve(here, '../../drizzle/0013_minutes_editor.sql'), 'utf8');

describe('minutes-editor schema module', () => {
  it('exports the two tables and key columns', () => {
    expect(minutesEditorVersions).toBeTruthy();
    expect(minutesEditorCurrent).toBeTruthy();
    expect(minutesEditorVersions.contentHash).toBeTruthy();
    expect(minutesEditorVersions.document).toBeTruthy();
    expect(minutesEditorCurrent.currentVersionId).toBeTruthy();
  });
});

describe('0013_minutes_editor.sql migration', () => {
  it('creates both tables and enforces immutability on versions only', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "minutes_editor_versions"/);
    expect(migrationSql).toMatch(/CREATE TABLE "minutes_editor_current"/);
    expect(migrationSql).toMatch(/BEFORE UPDATE OR DELETE ON "minutes_editor_versions"/);
    expect(migrationSql).not.toMatch(/BEFORE UPDATE OR DELETE ON "minutes_editor_current"/);
  });
  it('checks content_hash is 64-hex and is additive', () => {
    expect(migrationSql).toMatch(/\^\[0-9a-fA-F\]\{64\}/);
    expect(migrationSql).not.toMatch(/DROP TABLE/i);
  });
});
