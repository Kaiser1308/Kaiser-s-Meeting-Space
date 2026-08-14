-- P19-T02: owner-authorized immutable minutes editor versions + current pointer.
-- Additive only. Style follows 0007.

CREATE TABLE "minutes_editor_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"version" integer NOT NULL,
	"content_hash" char(64) NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "minutes_editor_versions_version_positive" CHECK ("minutes_editor_versions"."version" > 0),
	CONSTRAINT "minutes_editor_versions_content_hash_hex64" CHECK ("minutes_editor_versions"."content_hash" ~ '^[0-9a-fA-F]{64}$')
);--> statement-breakpoint

CREATE TABLE "minutes_editor_current" (
	"document_id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"current_version_id" text NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "minutes_editor_current_version_positive" CHECK ("minutes_editor_current"."version" > 0)
);--> statement-breakpoint

ALTER TABLE "minutes_editor_versions" ADD CONSTRAINT "minutes_editor_versions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutes_editor_current" ADD CONSTRAINT "minutes_editor_current_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutes_editor_current" ADD CONSTRAINT "minutes_editor_current_current_version_id_minutes_editor_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."minutes_editor_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "minutes_editor_versions_document_idx" ON "minutes_editor_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "minutes_editor_versions_owner_meeting_idx" ON "minutes_editor_versions" USING btree ("owner_id","meeting_id");--> statement-breakpoint
CREATE INDEX "minutes_editor_current_owner_meeting_idx" ON "minutes_editor_current" USING btree ("owner_id","meeting_id");--> statement-breakpoint

CREATE OR REPLACE FUNCTION "fn_minutes_editor_versions_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'minutes_editor_version_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_minutes_editor_versions_immutable" BEFORE UPDATE OR DELETE ON "minutes_editor_versions"
	FOR EACH ROW EXECUTE FUNCTION "fn_minutes_editor_versions_immutable"();--> statement-breakpoint
