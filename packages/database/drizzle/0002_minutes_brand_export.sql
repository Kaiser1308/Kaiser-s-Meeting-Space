CREATE TYPE "public"."action_item_status" AS ENUM('open', 'done', 'needs_confirmation');--> statement-breakpoint
CREATE TYPE "public"."detail_level" AS ENUM('detailed', 'near_verbatim');--> statement-breakpoint
CREATE TYPE "public"."evidence_owner_type" AS ENUM('section', 'action_item');--> statement-breakpoint
CREATE TYPE "public"."minutes_template" AS ENUM('team', 'one_on_one', 'direct_report', 'leadership', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."paper_size" AS ENUM('A4', 'Letter', 'Legal');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('docx', 'pdf', 'markdown', 'txt', 'json', 'audio');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"description" text NOT NULL,
	"owner" text,
	"due_date" text,
	"status" "action_item_status" NOT NULL,
	"order_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"owner_type" "evidence_owner_type" NOT NULL,
	"section_id" text,
	"action_item_id" text,
	"segment_id" text NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"quote_hash" text,
	CONSTRAINT "evidence_refs_exactly_one_owner" CHECK (("evidence_refs"."section_id" IS NOT NULL) <> ("evidence_refs"."action_item_id" IS NOT NULL)),
	CONSTRAINT "evidence_refs_start_ms_non_negative" CHECK ("evidence_refs"."start_ms" >= 0),
	CONSTRAINT "evidence_refs_end_after_start" CHECK ("evidence_refs"."end_ms" >= "evidence_refs"."start_ms"),
	CONSTRAINT "evidence_refs_quote_hash_format" CHECK ("evidence_refs"."quote_hash" IS NULL OR "evidence_refs"."quote_hash" ~ '^[0-9a-fA-F]{64}$')
);
--> statement-breakpoint
CREATE TABLE "minutes_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"template" "minutes_template" NOT NULL,
	"current_version_id" text,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "minutes_documents_version_positive" CHECK ("minutes_documents"."current_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "minutes_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"heading" text NOT NULL,
	"content" text NOT NULL,
	"order_index" integer NOT NULL,
	CONSTRAINT "minutes_sections_kind_valid" CHECK ("minutes_sections"."kind" IN ('section', 'decisions', 'open_questions')),
	CONSTRAINT "minutes_sections_order_index_non_negative" CHECK ("minutes_sections"."order_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "minutes_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"version" integer NOT NULL,
	"template" "minutes_template" NOT NULL,
	"detail_level" "detail_level" NOT NULL,
	"output_language" "meeting_language" NOT NULL,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"transcript_projection" text DEFAULT 'current' NOT NULL,
	"is_complete" boolean DEFAULT true NOT NULL,
	"creator_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "minutes_versions_version_positive" CHECK ("minutes_versions"."version" > 0),
	CONSTRAINT "minutes_versions_transcript_projection_valid" CHECK ("minutes_versions"."transcript_projection" IN ('source', 'current'))
);
--> statement-breakpoint
CREATE TABLE "brand_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_preset_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_length" bigint NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_assets_sha256_format" CHECK ("brand_assets"."sha256" ~ '^[0-9a-fA-F]{64}$'),
	CONSTRAINT "brand_assets_byte_length_positive" CHECK ("brand_assets"."byte_length" > 0)
);
--> statement-breakpoint
CREATE TABLE "brand_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"primary_color" text,
	"secondary_color" text,
	"font_family" text,
	"header_text" text,
	"footer_text" text,
	"paper_size" "paper_size",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "brand_presets_primary_color_format" CHECK ("brand_presets"."primary_color" IS NULL OR "brand_presets"."primary_color" ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'),
	CONSTRAINT "brand_presets_secondary_color_format" CHECK ("brand_presets"."secondary_color" IS NULL OR "brand_presets"."secondary_color" ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'),
	CONSTRAINT "brand_presets_version_positive" CHECK ("brand_presets"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"minutes_version_id" text NOT NULL,
	"format" "export_format" NOT NULL,
	"brand_preset_id" text,
	"status" "export_status" DEFAULT 'pending' NOT NULL,
	"download_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "export_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_job_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"minutes_version_id" text NOT NULL,
	"template" "minutes_template" NOT NULL,
	"detail_level" "detail_level" NOT NULL,
	"output_language" "meeting_language" NOT NULL,
	"transcript_projection" text NOT NULL,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"brand_preset_id" text,
	"format" "export_format" NOT NULL,
	"sha256" text NOT NULL,
	"byte_length" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_manifests_sha256_format" CHECK ("export_manifests"."sha256" ~ '^[0-9a-fA-F]{64}$'),
	CONSTRAINT "export_manifests_byte_length_positive" CHECK ("export_manifests"."byte_length" > 0)
);
--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_version_id_minutes_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."minutes_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_refs" ADD CONSTRAINT "evidence_refs_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_refs" ADD CONSTRAINT "evidence_refs_section_id_minutes_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."minutes_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_refs" ADD CONSTRAINT "evidence_refs_action_item_id_action_items_id_fk" FOREIGN KEY ("action_item_id") REFERENCES "public"."action_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_refs" ADD CONSTRAINT "evidence_refs_segment_id_transcript_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutes_documents" ADD CONSTRAINT "minutes_documents_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutes_documents" ADD CONSTRAINT "minutes_documents_current_version_id_minutes_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."minutes_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutes_sections" ADD CONSTRAINT "minutes_sections_version_id_minutes_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."minutes_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutes_versions" ADD CONSTRAINT "minutes_versions_document_id_minutes_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."minutes_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutes_versions" ADD CONSTRAINT "minutes_versions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_brand_preset_id_brand_presets_id_fk" FOREIGN KEY ("brand_preset_id") REFERENCES "public"."brand_presets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_presets" ADD CONSTRAINT "brand_presets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_minutes_version_id_minutes_versions_id_fk" FOREIGN KEY ("minutes_version_id") REFERENCES "public"."minutes_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_brand_preset_id_brand_presets_id_fk" FOREIGN KEY ("brand_preset_id") REFERENCES "public"."brand_presets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_manifests" ADD CONSTRAINT "export_manifests_export_job_id_export_jobs_id_fk" FOREIGN KEY ("export_job_id") REFERENCES "public"."export_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_version_id_idx" ON "action_items" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "action_items_meeting_status_idx" ON "action_items" USING btree ("meeting_id","status");--> statement-breakpoint
CREATE INDEX "evidence_refs_section_id_idx" ON "evidence_refs" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "evidence_refs_action_item_id_idx" ON "evidence_refs" USING btree ("action_item_id");--> statement-breakpoint
CREATE INDEX "evidence_refs_segment_id_idx" ON "evidence_refs" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "minutes_documents_meeting_id_idx" ON "minutes_documents" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "minutes_documents_owner_created_idx" ON "minutes_documents" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "minutes_sections_version_order_idx" ON "minutes_sections" USING btree ("version_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "minutes_versions_document_version_unique" ON "minutes_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "minutes_versions_meeting_id_idx" ON "minutes_versions" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "brand_assets_brand_preset_id_idx" ON "brand_assets" USING btree ("brand_preset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_presets_owner_name_unique" ON "brand_presets" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "brand_presets_owner_id_idx" ON "brand_presets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "export_jobs_meeting_id_idx" ON "export_jobs" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "export_jobs_owner_status_created_idx" ON "export_jobs" USING btree ("owner_id","status","created_at");--> statement-breakpoint
CREATE INDEX "export_manifests_export_job_id_idx" ON "export_manifests" USING btree ("export_job_id");--> statement-breakpoint
CREATE INDEX "speakers_owner_id_idx" ON "speakers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "transcript_revisions_owner_id_idx" ON "transcript_revisions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "transcript_segments_owner_id_idx" ON "transcript_segments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "translation_segments_owner_id_idx" ON "translation_segments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "transcript_completeness_owner_id_idx" ON "transcript_completeness" USING btree ("owner_id");

-- ── Integrity / immutability triggers (DESIGN §6) ──────────────────────
-- Custom SQLSTATE 'P0311' = immutable_violation, so repositories can map it
-- distinctly from generic constraint violations. Triggers are owner-agnostic
-- and tamper-resistant at the DB (defense-in-depth before P04 role layer).

-- minutes_versions: immutable snapshot version of generated minutes.
-- Once created, minutes versions are never updated or deleted.
CREATE OR REPLACE FUNCTION "fn_minutes_versions_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'minutes_version_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_minutes_versions_immutable" BEFORE UPDATE OR DELETE ON "minutes_versions"
	FOR EACH ROW EXECUTE FUNCTION "fn_minutes_versions_immutable"();--> statement-breakpoint

-- export_manifests: immutable snapshot of exported file provenance.
-- Once written, export manifests are never updated or deleted.
CREATE OR REPLACE FUNCTION "fn_export_manifests_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'export_manifest_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_export_manifests_immutable" BEFORE UPDATE OR DELETE ON "export_manifests"
	FOR EACH ROW EXECUTE FUNCTION "fn_export_manifests_immutable"();--> statement-breakpoint

-- evidence_refs: cross-meeting guard that prevents an evidence reference from
-- pointing to a transcript segment that belongs to a different meeting.
-- If the segment does not exist at all, the FK constraint (23503) handles it.
CREATE OR REPLACE FUNCTION "fn_evidence_same_meeting"() RETURNS trigger AS $$
DECLARE
	seg_meeting_id uuid;
BEGIN
	SELECT meeting_id INTO seg_meeting_id FROM transcript_segments WHERE id = NEW.segment_id;
	IF seg_meeting_id IS NULL THEN
		-- Segment doesn't exist; let the FK constraint raise 23503 instead.
		RETURN NEW;
	END IF;
	IF seg_meeting_id IS DISTINCT FROM NEW.meeting_id THEN
		RAISE EXCEPTION 'evidence_cross_meeting' USING ERRCODE = 'P0311';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_evidence_same_meeting" BEFORE INSERT OR UPDATE ON "evidence_refs"
	FOR EACH ROW EXECUTE FUNCTION "fn_evidence_same_meeting"();