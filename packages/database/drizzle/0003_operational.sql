CREATE TYPE "public"."job_state" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled', 'retrying');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('speech_transcription', 'translation', 'minutes_generation', 'export', 'deletion', 'finalization', 'backfill');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('meeting', 'audio_chunk', 'transcript_segment', 'transcript_revision', 'translation_segment', 'speaker', 'minutes_document', 'minutes_version', 'export_job', 'processing_job');--> statement-breakpoint
CREATE TYPE "public"."outbox_state" AS ENUM('pending', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."deletion_state" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."deletion_step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"success" boolean NOT NULL,
	"error_code" text,
	"error_message" text,
	CONSTRAINT "job_attempts_attempt_positive" CHECK ("job_attempts"."attempt" > 0)
);
--> statement-breakpoint
CREATE TABLE "job_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"percent" integer NOT NULL,
	"message" text,
	CONSTRAINT "job_progress_percent_range" CHECK ("job_progress"."percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"meeting_id" uuid NOT NULL,
	"type" "job_type" NOT NULL,
	"state" "job_state" DEFAULT 'pending' NOT NULL,
	"max_attempts" integer NOT NULL,
	"progress" integer,
	"result" jsonb,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "jobs_max_attempts_positive" CHECK ("jobs"."max_attempts" > 0),
	CONSTRAINT "jobs_progress_range" CHECK ("jobs"."progress" IS NULL OR ("jobs"."progress" BETWEEN 0 AND 100))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"owner_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_version" integer NOT NULL,
	"actor_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"state" "outbox_state" DEFAULT 'pending' NOT NULL,
	"leased_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "outbox_events_event_version_positive" CHECK ("outbox_events"."event_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_id" text NOT NULL,
	"response_code" text,
	"response_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tombstone_id" uuid NOT NULL,
	"step" text NOT NULL,
	"status" "deletion_step_status" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "deletion_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"state" "deletion_state" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "safe_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_progress" ADD CONSTRAINT "job_progress_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_steps" ADD CONSTRAINT "deletion_steps_tombstone_id_deletion_tombstones_id_fk" FOREIGN KEY ("tombstone_id") REFERENCES "public"."deletion_tombstones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_tombstones" ADD CONSTRAINT "deletion_tombstones_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_attempts_job_id_attempt_unique" ON "job_attempts" USING btree ("job_id","attempt");--> statement-breakpoint
CREATE INDEX "job_attempts_job_id_attempt_idx" ON "job_attempts" USING btree ("job_id","attempt");--> statement-breakpoint
CREATE INDEX "job_progress_job_id_recorded_idx" ON "job_progress" USING btree ("job_id","recorded_at");--> statement-breakpoint
CREATE INDEX "jobs_owner_state_created_idx" ON "jobs" USING btree ("owner_id","state","created_at");--> statement-breakpoint
CREATE INDEX "jobs_meeting_type_idx" ON "jobs" USING btree ("meeting_id","type");--> statement-breakpoint
CREATE INDEX "jobs_lease_idx" ON "jobs" USING btree ("state","lease_expires_at") WHERE "jobs"."state" IN ('pending', 'running', 'retrying');--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_message_id_unique" ON "outbox_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "outbox_events_lease_idx" ON "outbox_events" USING btree ("state","leased_until") WHERE "outbox_events"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "outbox_events_entity_type_entity_id_idx" ON "outbox_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_owner_entity_key_unique" ON "idempotency_records" USING btree ("owner_id","entity_type","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_steps_tombstone_id_step_unique" ON "deletion_steps" USING btree ("tombstone_id","step");--> statement-breakpoint
CREATE INDEX "deletion_steps_tombstone_id_status_idx" ON "deletion_steps" USING btree ("tombstone_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_tombstones_meeting_id_unique" ON "deletion_tombstones" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "deletion_tombstones_owner_state_idx" ON "deletion_tombstones" USING btree ("owner_id","state");--> statement-breakpoint
CREATE INDEX "safe_audit_owner_occurred_idx" ON "safe_audit" USING btree ("owner_id","occurred_at");--> statement-breakpoint
CREATE INDEX "safe_audit_entity_type_entity_id_idx" ON "safe_audit" USING btree ("entity_type","entity_id");