import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  finalizationManifests,
  finalizationStates,
  finalizationRanges,
  finalizationRunParts,
  finalizationStateEnum,
  finalizationPrimaryActionEnum,
  finalizationRangeClassificationEnum,
  finalizationPartStateEnum,
  finalizationLocalityEnum,
  finalizationSourceEnum,
} from './finalization.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, '../../drizzle/0009_finalization.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('finalization schema module', () => {
  it('imports without throwing and exports the four tables', () => {
    expect(finalizationManifests).toBeTruthy();
    expect(finalizationStates).toBeTruthy();
    expect(finalizationRanges).toBeTruthy();
    expect(finalizationRunParts).toBeTruthy();
  });

  it('exposes columns used by repositories (sanity shape)', () => {
    expect(finalizationManifests.meetingId).toBeTruthy();
    expect(finalizationManifests.ownerId).toBeTruthy();
    expect(finalizationManifests.manifest).toBeTruthy();
    expect(finalizationManifests.localManifestHash).toBeTruthy();
    expect(finalizationStates.state).toBeTruthy();
    expect(finalizationStates.primaryAction).toBeTruthy();
    expect(finalizationStates.version).toBeTruthy();
    expect(finalizationRanges.classification).toBeTruthy();
    expect(finalizationRunParts.runId).toBeTruthy();
    expect(finalizationRunParts.rawResultHash).toBeTruthy();
  });
});

describe('finalization pgEnums have expected values', () => {
  it('finalization_state', () => {
    expect(finalizationStateEnum.enumName).toBe('finalization_state');
    expect([...finalizationStateEnum.enumValues]).toEqual([
      'finalizing', 'processing', 'partial_ready', 'ready', 'recovery_required',
    ]);
  });
  it('finalization_primary_action', () => {
    expect([...finalizationPrimaryActionEnum.enumValues]).toEqual([
      'none', 'local', 'cloud', 'waiting_for_desktop', 'waiting_for_model', 'review_required',
    ]);
  });
  it('finalization_range_classification', () => {
    expect([...finalizationRangeClassificationEnum.enumValues]).toEqual([
      'verified', 'missing', 'corrupt', 'overlapping', 'pending', 'paused', 'gap', 'waived',
    ]);
  });
  it('finalization_part_state', () => {
    expect([...finalizationPartStateEnum.enumValues]).toEqual([
      'pending', 'running', 'completed', 'failed', 'cancelled',
    ]);
  });
  it('finalization_locality', () => {
    expect([...finalizationLocalityEnum.enumValues]).toEqual(['local', 'cloud']);
  });
  it('finalization_source', () => {
    expect([...finalizationSourceEnum.enumValues]).toEqual(['mic', 'system']);
  });
});

describe('0009_finalization.sql migration', () => {
  it('creates the four finalization tables', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "finalization_manifests"/);
    expect(migrationSql).toMatch(/CREATE TABLE "finalization_states"/);
    expect(migrationSql).toMatch(/CREATE TABLE "finalization_ranges"/);
    expect(migrationSql).toMatch(/CREATE TABLE "finalization_run_parts"/);
  });

  it('enforces immutability on manifest/ranges/run-parts (block UPDATE and DELETE)', () => {
    expect(migrationSql).toMatch(/BEFORE UPDATE OR DELETE ON "finalization_manifests"/);
    expect(migrationSql).toMatch(/BEFORE UPDATE OR DELETE ON "finalization_ranges"/);
    expect(migrationSql).toMatch(/BEFORE UPDATE OR DELETE ON "finalization_run_parts"/);
    expect(migrationSql).toMatch(/RAISE EXCEPTION/);
  });

  it('does not make finalization_states immutable (optimistic state)', () => {
    expect(migrationSql).not.toMatch(/BEFORE UPDATE OR DELETE ON "finalization_states"/);
  });

  it('check end_ms > start_ms on ranges and run parts', () => {
    expect(migrationSql).toMatch(/"finalization_ranges"."end_ms" > "finalization_ranges"."start_ms"/);
    expect(migrationSql).toMatch(/"finalization_run_parts"."end_ms" > "finalization_run_parts"."start_ms"/);
  });

  it('declares the unique(run_id, index) index on run parts', () => {
    expect(migrationSql).toMatch(/CREATE UNIQUE INDEX "finalization_run_parts_run_index_unique"/);
  });

  it('is additive (no DROP TABLE)', () => {
    expect(migrationSql).not.toMatch(/DROP TABLE/i);
  });
});
