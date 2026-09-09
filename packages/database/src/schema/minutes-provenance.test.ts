import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { minutesProvenance } from './minutes-provenance.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(resolve(here, '../../drizzle/0012_minutes_provenance.sql'), 'utf8');

describe('minutes-provenance schema module', () => {
  it('exports the table and provenance columns', () => {
    expect(minutesProvenance).toBeTruthy();
    expect(minutesProvenance.provider).toBeTruthy();
    expect(minutesProvenance.model).toBeTruthy();
    expect(minutesProvenance.promptVersion).toBeTruthy();
    expect(minutesProvenance.schemaVersion).toBeTruthy();
    expect(minutesProvenance.inputHash).toBeTruthy();
    expect(minutesProvenance.usage).toBeTruthy();
    expect(minutesProvenance.evaluation).toBeTruthy();
  });
});

describe('0012_minutes_provenance.sql migration', () => {
  it('creates the table and enforces immutability', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "minutes_provenance"/);
    expect(migrationSql).toMatch(/BEFORE UPDATE OR DELETE ON "minutes_provenance"/);
  });
  it('checks input_hash is 64-hex', () => {
    expect(migrationSql).toMatch(/\^\[0-9a-fA-F\]\{64\}/);
  });
  it('is additive (no DROP TABLE)', () => {
    expect(migrationSql).not.toMatch(/DROP TABLE/i);
  });
});
