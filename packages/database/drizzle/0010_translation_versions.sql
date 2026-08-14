-- P15-T04: versioned derived translation with full provenance (append-only).
-- Additive only. Style follows 0007. translation_versions is immutable.

CREATE TABLE "translation_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"source_segment_id" text NOT NULL,
	"source_revision" integer NOT NULL,
	"source_text_hash" char(64) NOT NULL,
	"source_language" "meeting_language" NOT NULL,
	"target_language" "meeting_language" NOT NULL,
	"translated_text" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"config" jsonb NOT NULL,
	"prompt_id" text,
	"status" "translation_status" NOT NULL,
	"confidence" real,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "translation_versions_source_revision_non_negative" CHECK ("translation_versions"."source_revision" >= 0),
	CONSTRAINT "translation_versions_source_text_hash_hex64" CHECK ("translation_versions"."source_text_hash" ~ '^[0-9a-fA-F]{64}$'),
	CONSTRAINT "translation_versions_confidence_range" CHECK ("translation_versions"."confidence" IS NULL OR ("translation_versions"."confidence" >= 0 AND "translation_versions"."confidence" <= 1))
);--> statement-breakpoint

CREATE TABLE "translation_versions_current" (
	"source_segment_id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"target_language" "meeting_language" NOT NULL,
	"current_version_id" text NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_versions_current_version_positive" CHECK ("translation_versions_current"."version" > 0)
);--> statement-breakpoint

ALTER TABLE "translation_versions" ADD CONSTRAINT "translation_versions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_versions_current" ADD CONSTRAINT "translation_versions_current_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_versions_current" ADD CONSTRAINT "translation_versions_current_current_version_id_translation_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."translation_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "translation_versions_owner_meeting_idx" ON "translation_versions" USING btree ("owner_id","meeting_id");--> statement-breakpoint
CREATE INDEX "translation_versions_segment_revision_idx" ON "translation_versions" USING btree ("source_segment_id","source_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_versions_idempotency_unique" ON "translation_versions" USING btree ("source_segment_id","source_revision","target_language");--> statement-breakpoint
CREATE INDEX "translation_versions_current_owner_idx" ON "translation_versions_current" USING btree ("owner_id","meeting_id");--> statement-breakpoint

-- ── Integrity / immutability trigger ──────────────────────────────────
-- translation_versions are append-only; the current pointer is mutable.

CREATE OR REPLACE FUNCTION "fn_translation_versions_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'translation_version_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_translation_versions_immutable" BEFORE UPDATE OR DELETE ON "translation_versions"
	FOR EACH ROW EXECUTE FUNCTION "fn_translation_versions_immutable"();--> statement-breakpoint
