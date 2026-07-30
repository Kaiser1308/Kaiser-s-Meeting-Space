import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  transcriptRuns,
  transcriptRunParts,
  transcriptRawEvents,
  runKindEnum,
  runLocalityEnum,
  runProviderEnum,
  runLifecycleStateEnum,
  speechEventKindEnum,
} from './speech-runs.js';
import {
  RunKindSchema,
  RunLocalitySchema,
  RunProviderSchema,
  RunLifecycleStateSchema,
  SpeechEventKindSchema,
} from '@kms/domain';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, '../../drizzle/0007_speech_runs.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('speech-runs schema module', () => {
  it('imports without throwing and exports the three tables', () => {
    expect(transcriptRuns).toBeTruthy();
    expect(transcriptRunParts).toBeTruthy();
    expect(transcriptRawEvents).toBeTruthy();
  });

  it('exposes columns used by repositories (sanity shape)', () => {
    expect(transcriptRuns.id).toBeTruthy();
    expect(transcriptRuns.meetingId).toBeTruthy();
    expect(transcriptRuns.ownerId).toBeTruthy();
    expect(transcriptRuns.policySnapshot).toBeTruthy();
    expect(transcriptRunParts.runId).toBeTruthy();
    expect(transcriptRunParts.rawResultHash).toBeTruthy();
    expect(transcriptRawEvents.payload).toBeTruthy();
    expect(transcriptRawEvents.contentHash).toBeTruthy();
  });
});

describe('speech-runs pgEnums match @kms/domain allowlists', () => {
  it('runKindEnum matches RunKindSchema.options', () => {
    expect(runKindEnum.enumName).toBe('run_kind');
    expect([...runKindEnum.enumValues]).toEqual([...RunKindSchema.options]);
  });

  it('runLocalityEnum matches RunLocalitySchema.options', () => {
    expect(runLocalityEnum.enumName).toBe('run_locality');
    expect([...runLocalityEnum.enumValues]).toEqual([...RunLocalitySchema.options]);
  });

  it('runProviderEnum matches RunProviderSchema.options', () => {
    expect(runProviderEnum.enumName).toBe('run_provider');
    expect([...runProviderEnum.enumValues]).toEqual([...RunProviderSchema.options]);
  });

  it('runLifecycleStateEnum matches RunLifecycleStateSchema.options', () => {
    expect(runLifecycleStateEnum.enumName).toBe('run_lifecycle_state');
    expect([...runLifecycleStateEnum.enumValues]).toEqual([...RunLifecycleStateSchema.options]);
  });

  it('speechEventKindEnum matches SpeechEventKindSchema.options', () => {
    expect(speechEventKindEnum.enumName).toBe('speech_event_kind');
    expect([...speechEventKindEnum.enumValues]).toEqual([...SpeechEventKindSchema.options]);
  });
});

describe('0007_speech_runs.sql migration', () => {
  it('creates the transcript_runs table', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "transcript_runs"/);
  });

  it('creates the transcript_run_parts table', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "transcript_run_parts"/);
  });

  it('creates the transcript_raw_events table', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "transcript_raw_events"/);
  });

  it('declares the run/provider/locality/lifecycle/event enums', () => {
    expect(migrationSql).toMatch(/CREATE TYPE "public"."run_kind"/);
    expect(migrationSql).toMatch(/CREATE TYPE "public"."run_locality"/);
    expect(migrationSql).toMatch(/CREATE TYPE "public"."run_provider"/);
    expect(migrationSql).toMatch(/CREATE TYPE "public"."run_lifecycle_state"/);
    expect(migrationSql).toMatch(/CREATE TYPE "public"."speech_event_kind"/);
  });

  it('enforces immutability on transcript_runs (block UPDATE and DELETE)', () => {
    expect(migrationSql).toMatch(/BEFORE UPDATE OR DELETE ON "transcript_runs"/);
    expect(migrationSql).toMatch(/RAISE EXCEPTION/);
  });

  it('enforces immutability on transcript_run_parts (block UPDATE and DELETE)', () => {
    expect(migrationSql).toMatch(/BEFORE UPDATE OR DELETE ON "transcript_run_parts"/);
  });

  it('makes transcript_raw_events append-only (block UPDATE; block DELETE)', () => {
    expect(migrationSql).toMatch(/BEFORE UPDATE ON "transcript_raw_events"/);
    expect(migrationSql).toMatch(/BEFORE DELETE ON "transcript_raw_events"/);
  });

  it('declares the idempotency unique index on transcript_raw_events (partial)', () => {
    expect(migrationSql).toMatch(/CREATE UNIQUE INDEX "transcript_raw_events_idempotency_unique"/);
    expect(migrationSql).toMatch(/ON "transcript_raw_events"/);
    // partial WHERE clause referencing the nullable dedupe columns (drizzle
    // quotes identifiers in WHERE, matching the 0001 convention).
    expect(migrationSql).toMatch(/part_id" IS NOT NULL/);
    expect(migrationSql).toMatch(/provider_event_id" IS NOT NULL/);
    expect(migrationSql).toMatch(/sequence_in_part" IS NOT NULL/);
  });

  it('declares the unique(run_id, index) constraint on parts', () => {
    expect(migrationSql).toMatch(/CREATE UNIQUE INDEX "transcript_run_parts_run_index_unique"/);
  });

  it('check end_ms > start_ms on parts', () => {
    expect(migrationSql).toMatch(
      /"transcript_run_parts"."end_ms" > "transcript_run_parts"."start_ms"/,
    );
  });

  it('check raw_result_hash is 64-hex on parts', () => {
    expect(migrationSql).toMatch(/\^\[0-9a-fA-F\]\{64\}/);
  });

  it('I-1 regression: transcript_raw_events.event_type uses speech_event_kind enum (not text)', () => {
    expect(migrationSql).toMatch(/"event_type" "speech_event_kind" NOT NULL/);
    expect(migrationSql).not.toMatch(/"event_type" text NOT NULL/);
  });

  it('is additive (no DROP / ALTER on existing tables)', () => {
    expect(migrationSql).not.toMatch(/DROP TABLE/i);
    expect(migrationSql).not.toMatch(/ALTER TABLE "meetings"/i);
    expect(migrationSql).not.toMatch(/ALTER TABLE "transcript_segments"/i);
  });
});
