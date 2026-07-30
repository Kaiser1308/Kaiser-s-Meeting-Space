-- P13-T01: speech run / part / raw-event lineage (provider-neutral).
-- Additive only: three CREATE TABLE + enums + indexes + immutability triggers.
-- No DROP / ALTER on existing tables. Style follows 0001/0006.

CREATE TYPE "public"."run_kind" AS ENUM('live', 'final', 'cloud_check');--> statement-breakpoint
CREATE TYPE "public"."run_locality" AS ENUM('local', 'cloud');--> statement-breakpoint
CREATE TYPE "public"."run_provider" AS ENUM('deepgram', 'local-whisper');--> statement-breakpoint
CREATE TYPE "public"."run_lifecycle_state" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."speech_event_kind" AS ENUM('interim', 'final_segment', 'speaker_update', 'usage', 'session_state', 'safe_error');--> statement-breakpoint

CREATE TABLE "transcript_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "run_kind" NOT NULL,
	"locality" "run_locality" NOT NULL,
	"provider" "run_provider" NOT NULL,
	"language" "meeting_language" NOT NULL,
	"source_id" text NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"plan_hash" text,
	"lifecycle_state" "run_lifecycle_state" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"safe_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_runs_completed_after_started" CHECK ("transcript_runs"."completed_at" IS NULL OR "transcript_runs"."completed_at" >= "transcript_runs"."started_at"),
	CONSTRAINT "transcript_runs_plan_hash_hex64" CHECK ("transcript_runs"."plan_hash" IS NULL OR ("transcript_runs"."plan_hash" ~ '^[0-9a-fA-F]{64}$'))
);--> statement-breakpoint

CREATE TABLE "transcript_run_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"index" integer NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"overlap_ms" bigint DEFAULT 0 NOT NULL,
	"locality" "run_locality" NOT NULL,
	"provider" "run_provider" NOT NULL,
	"model_id" text,
	"raw_result_hash" char(64) NOT NULL,
	"lifecycle_state" "run_lifecycle_state" NOT NULL,
	"completed_at" timestamp with time zone,
	"safe_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_run_parts_end_gt_start" CHECK ("transcript_run_parts"."end_ms" > "transcript_run_parts"."start_ms"),
	CONSTRAINT "transcript_run_parts_index_non_negative" CHECK ("transcript_run_parts"."index" >= 0),
	CONSTRAINT "transcript_run_parts_raw_result_hash_hex64" CHECK ("transcript_run_parts"."raw_result_hash" ~ '^[0-9a-fA-F]{64}$')
);--> statement-breakpoint

CREATE TABLE "transcript_raw_events" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"part_id" text,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text,
	"event_type" "speech_event_kind" NOT NULL,
	"sequence_in_part" integer,
	"content_hash" char(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_raw_events_content_hash_hex64" CHECK ("transcript_raw_events"."content_hash" ~ '^[0-9a-fA-F]{64}$')
);--> statement-breakpoint

ALTER TABLE "transcript_runs" ADD CONSTRAINT "transcript_runs_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_run_parts" ADD CONSTRAINT "transcript_run_parts_run_id_transcript_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."transcript_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_run_parts" ADD CONSTRAINT "transcript_run_parts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_raw_events" ADD CONSTRAINT "transcript_raw_events_run_id_transcript_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."transcript_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_raw_events" ADD CONSTRAINT "transcript_raw_events_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "transcript_runs_owner_meeting_idx" ON "transcript_runs" USING btree ("owner_id","meeting_id");--> statement-breakpoint
CREATE INDEX "transcript_runs_lifecycle_idx" ON "transcript_runs" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_run_parts_run_index_unique" ON "transcript_run_parts" USING btree ("run_id","index");--> statement-breakpoint
CREATE INDEX "transcript_run_parts_owner_meeting_idx" ON "transcript_run_parts" USING btree ("owner_id","meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_raw_events_idempotency_unique" ON "transcript_raw_events" USING btree ("run_id","part_id","provider","provider_event_id","event_type","sequence_in_part") WHERE "transcript_raw_events"."part_id" IS NOT NULL AND "transcript_raw_events"."provider_event_id" IS NOT NULL AND "transcript_raw_events"."sequence_in_part" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transcript_raw_events_owner_idx" ON "transcript_raw_events" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "transcript_raw_events_meeting_idx" ON "transcript_raw_events" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "transcript_raw_events_run_occurred_idx" ON "transcript_raw_events" USING btree ("run_id","occurred_at");--> statement-breakpoint

-- ── Integrity / immutability triggers ──────────────────────────────────
-- Custom SQLSTATE 'P0311' = immutable_violation. Runs and parts are immutable
-- after insert; raw events are append-only (INSERT-only). Defense-in-depth
-- at the DB layer; repositories also enforce immutability at the application
-- boundary. Owner-scoping is enforced by the application role layer (P04).

CREATE OR REPLACE FUNCTION "fn_transcript_runs_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'transcript_run_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_transcript_runs_immutable" BEFORE UPDATE OR DELETE ON "transcript_runs"
	FOR EACH ROW EXECUTE FUNCTION "fn_transcript_runs_immutable"();--> statement-breakpoint

CREATE OR REPLACE FUNCTION "fn_transcript_run_parts_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'transcript_run_part_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_transcript_run_parts_immutable" BEFORE UPDATE OR DELETE ON "transcript_run_parts"
	FOR EACH ROW EXECUTE FUNCTION "fn_transcript_run_parts_immutable"();--> statement-breakpoint

CREATE OR REPLACE FUNCTION "fn_transcript_raw_events_appendonly"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'transcript_raw_event_appendonly' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_transcript_raw_events_no_update" BEFORE UPDATE ON "transcript_raw_events"
	FOR EACH ROW EXECUTE FUNCTION "fn_transcript_raw_events_appendonly"();--> statement-breakpoint
CREATE TRIGGER "trg_transcript_raw_events_no_delete" BEFORE DELETE ON "transcript_raw_events"
	FOR EACH ROW EXECUTE FUNCTION "fn_transcript_raw_events_appendonly"();
