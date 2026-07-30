CREATE TYPE "audio_orphan_status" AS ENUM('pending_object', 'size_mismatch', 'corrupt_object', 'missing_completion', 'reconciled', 'abandoned');--> statement-breakpoint
CREATE TABLE "audio_reconciliation" (
	"meeting_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_reconciliation_version_positive" CHECK ("audio_reconciliation"."version" > 0)
);--> statement-breakpoint
ALTER TABLE "audio_reconciliation" ADD CONSTRAINT "audio_reconciliation_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audio_reconciliation_owner_idx" ON "audio_reconciliation" USING btree ("owner_id");--> statement-breakpoint
CREATE TABLE "audio_orphan_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"source" "audio_source" NOT NULL,
	"chunk_index" integer NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text,
	"byte_length" bigint,
	"status" "audio_orphan_status" NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconciled_at" timestamp with time zone,
	CONSTRAINT "audio_orphans_status_check" CHECK ("audio_orphan_records"."status" IN ('pending_object', 'size_mismatch', 'corrupt_object', 'missing_completion', 'reconciled', 'abandoned')),
	CONSTRAINT "audio_orphans_byte_length_positive" CHECK ("audio_orphan_records"."byte_length" IS NULL OR "audio_orphan_records"."byte_length" > 0)
);--> statement-breakpoint
ALTER TABLE "audio_orphan_records" ADD CONSTRAINT "audio_orphan_records_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audio_orphan_records_meeting_source_index_unique" ON "audio_orphan_records" USING btree ("meeting_id","source","chunk_index");--> statement-breakpoint
CREATE INDEX "audio_orphan_records_owner_status_idx" ON "audio_orphan_records" USING btree ("owner_id","status","detected_at");
