CREATE TYPE "public"."audio_source" AS ENUM('mic', 'system', 'derived_mix');--> statement-breakpoint
CREATE TYPE "public"."meeting_language" AS ENUM('vi', 'en');--> statement-breakpoint
CREATE TYPE "public"."meeting_mode" AS ENUM('meeting_only', 'meeting_translate');--> statement-breakpoint
CREATE TYPE "public"."meeting_state" AS ENUM('draft', 'checking', 'recording', 'paused', 'finalizing', 'processing', 'ready', 'recovery_required', 'partial_ready', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."speech_mode" AS ENUM('api', 'local');--> statement-breakpoint
CREATE TYPE "public"."audio_gap_description" AS ENUM('source_disconnect', 'buffer_overflow', 'crash_recovery');--> statement-breakpoint
CREATE TYPE "public"."timeline_marker_type" AS ENUM('pause', 'gap');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'uploading', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_capture_sources" (
	"meeting_id" uuid NOT NULL,
	"source" "audio_source" NOT NULL,
	CONSTRAINT "meeting_capture_sources_meeting_id_source_pk" PRIMARY KEY("meeting_id","source"),
	CONSTRAINT "meeting_capture_sources_source_capturable" CHECK ("meeting_capture_sources"."source" IN ('mic', 'system'))
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"language" "meeting_language" NOT NULL,
	"mode" "meeting_mode" NOT NULL,
	"speech_mode" "speech_mode" DEFAULT 'api' NOT NULL,
	"timezone" text NOT NULL,
	"version" integer NOT NULL,
	"state" "meeting_state" DEFAULT 'draft' NOT NULL,
	"capture_profile" jsonb DEFAULT '{"container":"webm","codec":"opus","sampleRate":48000,"bitDepth":16,"channels":1,"bitrate":96000,"opusFrameDurationMs":20,"complexity":5}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "meetings_version_positive" CHECK ("meetings"."version" > 0),
	CONSTRAINT "meetings_title_length" CHECK (char_length("meetings"."title") BETWEEN 1 AND 500),
	CONSTRAINT "meetings_ended_requires_started" CHECK ("meetings"."ended_at" IS NULL OR "meetings"."started_at" IS NOT NULL),
	CONSTRAINT "meetings_ended_after_started" CHECK ("meetings"."ended_at" IS NULL OR "meetings"."started_at" IS NULL OR "meetings"."ended_at" >= "meetings"."started_at")
);
--> statement-breakpoint
CREATE TABLE "capture_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"source" "audio_source" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"monotonic_start" bigint NOT NULL,
	"monotonic_end" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_intervals_ended_after_started" CHECK ("capture_intervals"."ended_at" IS NULL OR "capture_intervals"."ended_at" >= "capture_intervals"."started_at"),
	CONSTRAINT "capture_intervals_monotonic_ordered" CHECK ("capture_intervals"."monotonic_end" IS NULL OR "capture_intervals"."monotonic_end" >= "capture_intervals"."monotonic_start")
);
--> statement-breakpoint
CREATE TABLE "timeline_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"source" "audio_source" NOT NULL,
	"marker_type" timeline_marker_type NOT NULL,
	"description" "audio_gap_description",
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"duration_ms" bigint NOT NULL,
	CONSTRAINT "timeline_markers_start_ms_positive" CHECK ("timeline_markers"."start_ms" >= 0),
	CONSTRAINT "timeline_markers_end_after_start" CHECK ("timeline_markers"."end_ms" >= "timeline_markers"."start_ms"),
	CONSTRAINT "timeline_markers_duration_positive" CHECK ("timeline_markers"."duration_ms" > 0),
	CONSTRAINT "timeline_markers_marker_type_description" CHECK ("timeline_markers"."marker_type" = 'pause' OR ("timeline_markers"."marker_type" = 'gap' AND "timeline_markers"."description" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "audio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"source" "audio_source" NOT NULL,
	"label" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_length" bigint NOT NULL,
	"derived_from" jsonb NOT NULL,
	"mix_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_assets_source_is_derived" CHECK ("audio_assets"."source" = 'derived_mix'),
	CONSTRAINT "audio_assets_derived_from_mic" CHECK ("audio_assets"."derived_from" ?& array['mic']),
	CONSTRAINT "audio_assets_byte_length_positive" CHECK ("audio_assets"."byte_length" > 0),
	CONSTRAINT "audio_assets_sha256_format" CHECK ("audio_assets"."sha256" ~ '^[0-9a-fA-F]{64}$'),
	CONSTRAINT "audio_assets_mix_version_positive" CHECK ("audio_assets"."mix_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "audio_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"source" "audio_source" NOT NULL,
	"chunk_index" integer NOT NULL,
	"storage_key" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" bigint NOT NULL,
	"byte_length" bigint NOT NULL,
	"codec" text NOT NULL,
	"container" text NOT NULL,
	"sample_rate" integer NOT NULL,
	"channels" integer NOT NULL,
	"sha256" text NOT NULL,
	"upload_status" "upload_status" NOT NULL,
	"finalized_at" timestamp with time zone,
	"wall_clock_start" timestamp with time zone NOT NULL,
	"wall_clock_end" timestamp with time zone NOT NULL,
	"monotonic_start" bigint NOT NULL,
	"monotonic_end" bigint NOT NULL,
	CONSTRAINT "audio_chunks_chunk_index_positive" CHECK ("audio_chunks"."chunk_index" >= 0),
	CONSTRAINT "audio_chunks_byte_length_positive" CHECK ("audio_chunks"."byte_length" > 0),
	CONSTRAINT "audio_chunks_duration_positive" CHECK ("audio_chunks"."duration_ms" > 0),
	CONSTRAINT "audio_chunks_sample_rate_fixed" CHECK ("audio_chunks"."sample_rate" = 48000),
	CONSTRAINT "audio_chunks_channels_fixed" CHECK ("audio_chunks"."channels" = 1),
	CONSTRAINT "audio_chunks_codec_fixed" CHECK ("audio_chunks"."codec" = 'opus'),
	CONSTRAINT "audio_chunks_container_fixed" CHECK ("audio_chunks"."container" = 'webm'),
	CONSTRAINT "audio_chunks_wall_clock_ordered" CHECK ("audio_chunks"."wall_clock_end" >= "audio_chunks"."wall_clock_start"),
	CONSTRAINT "audio_chunks_monotonic_ordered" CHECK ("audio_chunks"."monotonic_end" >= "audio_chunks"."monotonic_start"),
	CONSTRAINT "audio_chunks_sha256_format" CHECK ("audio_chunks"."sha256" ~ '^[0-9a-fA-F]{64}$')
);
--> statement-breakpoint
CREATE TABLE "audio_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"source" "audio_source" NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_length" bigint NOT NULL,
	"entry_count" integer NOT NULL,
	"first_chunk_index" integer NOT NULL,
	"last_chunk_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_manifests_byte_length_positive" CHECK ("audio_manifests"."byte_length" > 0),
	CONSTRAINT "audio_manifests_entry_count_positive" CHECK ("audio_manifests"."entry_count" >= 0),
	CONSTRAINT "audio_manifests_sha256_format" CHECK ("audio_manifests"."sha256" ~ '^[0-9a-fA-F]{64}$')
);
--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_capture_sources" ADD CONSTRAINT "meeting_capture_sources_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_intervals" ADD CONSTRAINT "capture_intervals_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_markers" ADD CONSTRAINT "timeline_markers_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_chunks" ADD CONSTRAINT "audio_chunks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_manifests" ADD CONSTRAINT "audio_manifests_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_issuer_subject_unique" ON "external_identities" USING btree ("issuer","subject");--> statement-breakpoint
CREATE INDEX "external_identities_user_id_idx" ON "external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meetings_owner_created_idx" ON "meetings" USING btree ("owner_id","created_at","id");--> statement-breakpoint
CREATE INDEX "meetings_owner_state_idx" ON "meetings" USING btree ("owner_id","state");--> statement-breakpoint
CREATE INDEX "meetings_id_owner_idx" ON "meetings" USING btree ("id","owner_id");--> statement-breakpoint
CREATE INDEX "capture_intervals_meeting_source_started_idx" ON "capture_intervals" USING btree ("meeting_id","source","started_at");--> statement-breakpoint
CREATE INDEX "capture_intervals_owner_idx" ON "capture_intervals" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_markers_unique_event_idx" ON "timeline_markers" USING btree ("meeting_id","source","marker_type","start_ms");--> statement-breakpoint
CREATE INDEX "timeline_markers_owner_idx" ON "timeline_markers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "audio_assets_owner_idx" ON "audio_assets" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audio_chunks_meeting_source_index_unique" ON "audio_chunks" USING btree ("meeting_id","source","chunk_index");--> statement-breakpoint
CREATE INDEX "audio_chunks_meeting_finalized_idx" ON "audio_chunks" USING btree ("meeting_id","finalized_at");--> statement-breakpoint
CREATE INDEX "audio_chunks_owner_idx" ON "audio_chunks" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audio_manifests_meeting_source_unique" ON "audio_manifests" USING btree ("meeting_id","source");--> statement-breakpoint
CREATE INDEX "audio_manifests_owner_idx" ON "audio_manifests" USING btree ("owner_id");--> statement-breakpoint

-- ── Integrity / immutability triggers (DESIGN §6) ──────────────────────
-- Custom SQLSTATE 'P0311' = immutable_violation, so repositories can map it
-- distinctly from generic constraint violations. Triggers are owner-agnostic
-- and tamper-resistant at the DB (defense-in-depth before P04 role layer).

-- audio_chunks: the only allowed post-insert mutation is finalizing the row
-- (OLD.finalized_at IS NULL). Once finalized, UPDATE/DELETE are blocked.
CREATE OR REPLACE FUNCTION "fn_audio_chunks_immutable"() RETURNS trigger AS $$
BEGIN
	IF (TG_OP = 'DELETE') THEN
		IF OLD.finalized_at IS NOT NULL THEN
			RAISE EXCEPTION 'audio_chunk_finalized_immutable' USING ERRCODE = 'P0311';
		END IF;
		RETURN OLD;
	ELSIF (TG_OP = 'UPDATE') THEN
		IF OLD.finalized_at IS NOT NULL THEN
			RAISE EXCEPTION 'audio_chunk_finalized_immutable' USING ERRCODE = 'P0311';
		END IF;
		RETURN NEW;
	END IF;
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_audio_chunks_immutable" BEFORE UPDATE OR DELETE ON "audio_chunks"
	FOR EACH ROW EXECUTE FUNCTION "fn_audio_chunks_immutable"();--> statement-breakpoint

-- meetings: language/mode are locked once capture has started
-- (state NOT IN ('draft','checking')).
CREATE OR REPLACE FUNCTION "fn_meeting_language_mode_lock"() RETURNS trigger AS $$
BEGIN
	IF (NEW.language IS DISTINCT FROM OLD.language OR NEW.mode IS DISTINCT FROM OLD.mode)
		AND OLD.state NOT IN ('draft', 'checking') THEN
		RAISE EXCEPTION 'meeting_language_mode_locked' USING ERRCODE = 'P0311';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_meeting_language_mode_lock" BEFORE UPDATE ON "meetings"
	FOR EACH ROW EXECUTE FUNCTION "fn_meeting_language_mode_lock"();--> statement-breakpoint

-- meeting_capture_sources: membership is locked once capture has started.
CREATE OR REPLACE FUNCTION "fn_meeting_capture_sources_lock"() RETURNS trigger AS $$
DECLARE
	m_state meeting_state;
BEGIN
	IF (TG_OP = 'INSERT') THEN
		SELECT state INTO m_state FROM meetings WHERE id = NEW.meeting_id;
		IF m_state IS NULL OR m_state NOT IN ('draft', 'checking') THEN
			RAISE EXCEPTION 'meeting_capture_sources_locked' USING ERRCODE = 'P0311';
		END IF;
		RETURN NEW;
	ELSIF (TG_OP = 'DELETE') THEN
		SELECT state INTO m_state FROM meetings WHERE id = OLD.meeting_id;
		IF m_state IS NULL OR m_state NOT IN ('draft', 'checking') THEN
			RAISE EXCEPTION 'meeting_capture_sources_locked' USING ERRCODE = 'P0311';
		END IF;
		RETURN OLD;
	END IF;
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_meeting_capture_sources_lock" BEFORE INSERT OR DELETE ON "meeting_capture_sources"
	FOR EACH ROW EXECUTE FUNCTION "fn_meeting_capture_sources_lock"();