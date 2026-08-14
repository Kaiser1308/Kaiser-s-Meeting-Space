-- P18-T01/T02: minutes generation provenance (provider/model/prompt/schema/config/usage/evaluation).
-- Additive only. Style follows 0007. Immutable (append-only).

CREATE TABLE "minutes_provenance" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"projection_version" integer NOT NULL,
	"completeness_version" integer NOT NULL,
	"template_id" text NOT NULL,
	"template_version" integer NOT NULL,
	"detail_level" text NOT NULL,
	"output_language" "meeting_language" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"config_version" text NOT NULL,
	"input_hash" char(64) NOT NULL,
	"usage" jsonb NOT NULL,
	"evaluation" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "minutes_provenance_projection_version_positive" CHECK ("minutes_provenance"."projection_version" > 0),
	CONSTRAINT "minutes_provenance_completeness_version_positive" CHECK ("minutes_provenance"."completeness_version" > 0),
	CONSTRAINT "minutes_provenance_template_version_positive" CHECK ("minutes_provenance"."template_version" > 0),
	CONSTRAINT "minutes_provenance_input_hash_hex64" CHECK ("minutes_provenance"."input_hash" ~ '^[0-9a-fA-F]{64}$')
);--> statement-breakpoint

ALTER TABLE "minutes_provenance" ADD CONSTRAINT "minutes_provenance_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "minutes_provenance_owner_meeting_idx" ON "minutes_provenance" USING btree ("owner_id","meeting_id");--> statement-breakpoint

CREATE OR REPLACE FUNCTION "fn_minutes_provenance_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'minutes_provenance_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_minutes_provenance_immutable" BEFORE UPDATE OR DELETE ON "minutes_provenance"
	FOR EACH ROW EXECUTE FUNCTION "fn_minutes_provenance_immutable"();--> statement-breakpoint
