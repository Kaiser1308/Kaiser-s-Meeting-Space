CREATE TYPE "public"."gap_reason" AS ENUM('network_loss', 'provider_unavailable', 'buffer_overflow', 'crash_recovery', 'source_disconnect');--> statement-breakpoint
CREATE TYPE "public"."transcript_source" AS ENUM('api', 'local', 'manual');--> statement-breakpoint
CREATE TYPE "public"."translation_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "speakers" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"label" text DEFAULT 'Unknown Speaker' NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"segment_id" text NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"base_revision_id" text,
	"revised_text" text NOT NULL,
	"revised_speaker_id" text,
	"actor_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"speaker_id" text NOT NULL,
	"language" "meeting_language" NOT NULL,
	"text" text NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"confidence" double precision,
	"source" "transcript_source" NOT NULL,
	"provider" text,
	"provider_event_id" text,
	"is_gap" boolean DEFAULT false NOT NULL,
	"gap_reason" "gap_reason",
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transcript_segments_end_gt_start" CHECK ("transcript_segments"."end_ms" > "transcript_segments"."start_ms"),
	CONSTRAINT "transcript_segments_sequence_non_negative" CHECK ("transcript_segments"."sequence" >= 0),
	CONSTRAINT "transcript_segments_confidence_range" CHECK ("transcript_segments"."confidence" IS NULL OR ("transcript_segments"."confidence" >= 0 AND "transcript_segments"."confidence" <= 1)),
	CONSTRAINT "transcript_segments_gap_requires_reason" CHECK ("transcript_segments"."is_gap" = false OR "transcript_segments"."gap_reason" IS NOT NULL),
	CONSTRAINT "transcript_segments_start_ms_non_negative" CHECK ("transcript_segments"."start_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "translation_current" (
	"source_segment_id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"current_translation_id" text NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "translation_current_version_positive" CHECK ("translation_current"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "translation_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"source_segment_id" text NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"target_language" "meeting_language" NOT NULL,
	"translated_text" text NOT NULL,
	"provider" text,
	"model" text,
	"status" "translation_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_completeness" (
	"meeting_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"audio_complete" boolean NOT NULL,
	"transcript_complete" boolean NOT NULL,
	"diarization_complete" boolean,
	"translation_complete" boolean,
	"gaps" jsonb DEFAULT '[]' NOT NULL,
	"pending_ranges" jsonb DEFAULT '[]' NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_completeness_version_positive" CHECK ("transcript_completeness"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_revisions" ADD CONSTRAINT "transcript_revisions_segment_id_transcript_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_revisions" ADD CONSTRAINT "transcript_revisions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_revisions" ADD CONSTRAINT "transcript_revisions_base_revision_id_transcript_revisions_id_fk" FOREIGN KEY ("base_revision_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_current" ADD CONSTRAINT "translation_current_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_current" ADD CONSTRAINT "translation_current_source_segment_id_transcript_segments_id_fk" FOREIGN KEY ("source_segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_current" ADD CONSTRAINT "translation_current_current_translation_id_translation_segments_id_fk" FOREIGN KEY ("current_translation_id") REFERENCES "public"."translation_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_segments" ADD CONSTRAINT "translation_segments_source_segment_id_transcript_segments_id_fk" FOREIGN KEY ("source_segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_segments" ADD CONSTRAINT "translation_segments_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_completeness" ADD CONSTRAINT "transcript_completeness_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "speakers_meeting_label_unique" ON "speakers" USING btree ("meeting_id","label");--> statement-breakpoint
CREATE INDEX "speakers_meeting_id_idx" ON "speakers" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "transcript_revisions_segment_created_at_idx" ON "transcript_revisions" USING btree ("segment_id","created_at");--> statement-breakpoint
CREATE INDEX "transcript_revisions_base_revision_id_idx" ON "transcript_revisions" USING btree ("base_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_segments_meeting_sequence_unique" ON "transcript_segments" USING btree ("meeting_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_segments_provider_event_partial_unique" ON "transcript_segments" USING btree ("meeting_id","provider","provider_event_id") WHERE "transcript_segments"."provider_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transcript_segments_meeting_start_ms_idx" ON "transcript_segments" USING btree ("meeting_id","start_ms");--> statement-breakpoint
CREATE INDEX "transcript_segments_speaker_id_idx" ON "transcript_segments" USING btree ("speaker_id");--> statement-breakpoint
CREATE INDEX "translation_current_owner_id_idx" ON "translation_current" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "translation_segments_source_segment_id_idx" ON "translation_segments" USING btree ("source_segment_id");--> statement-breakpoint
CREATE INDEX "translation_segments_meeting_target_language_idx" ON "translation_segments" USING btree ("meeting_id","target_language");--> statement-breakpoint

-- ── Integrity / immutability triggers (DESIGN §6) ──────────────────────
-- Custom SQLSTATE 'P0311' = immutable_violation, so repositories can map it
-- distinctly from generic constraint violations. Triggers are owner-agnostic
-- and tamper-resistant at the DB (defense-in-depth before P04 role layer).

-- transcript_segments: source segments are immutable after insert (ADR-002);
-- corrections go to transcript_revisions.
CREATE OR REPLACE FUNCTION "fn_transcript_segments_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'transcript_segment_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_transcript_segments_immutable" BEFORE UPDATE OR DELETE ON "transcript_segments"
	FOR EACH ROW EXECUTE FUNCTION "fn_transcript_segments_immutable"();--> statement-breakpoint

-- transcript_revisions: append-only; corrections are new revisions.
CREATE OR REPLACE FUNCTION "fn_transcript_revisions_appendonly"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'transcript_revision_appendonly' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_transcript_revisions_appendonly" BEFORE UPDATE OR DELETE ON "transcript_revisions"
	FOR EACH ROW EXECUTE FUNCTION "fn_transcript_revisions_appendonly"();--> statement-breakpoint

-- translation_segments: immutable snapshot; current projection via translation_current.
CREATE OR REPLACE FUNCTION "fn_translation_segments_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'translation_segment_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_translation_segments_immutable" BEFORE UPDATE OR DELETE ON "translation_segments"
	FOR EACH ROW EXECUTE FUNCTION "fn_translation_segments_immutable"();