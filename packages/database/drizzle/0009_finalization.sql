-- P14-T01/T02: finalization expected-source manifest, state, range classification, run parts.
-- Additive only. Style follows 0007. Immutability: manifest/ranges/run-parts are append-only.

CREATE TYPE "public"."finalization_state" AS ENUM('finalizing','processing','partial_ready','ready','recovery_required');--> statement-breakpoint
CREATE TYPE "public"."finalization_primary_action" AS ENUM('none','local','cloud','waiting_for_desktop','waiting_for_model','review_required');--> statement-breakpoint
CREATE TYPE "public"."finalization_range_classification" AS ENUM('verified','missing','corrupt','overlapping','pending','paused','gap','waived');--> statement-breakpoint
CREATE TYPE "public"."finalization_part_state" AS ENUM('pending','running','completed','failed','cancelled');--> statement-breakpoint
CREATE TYPE "public"."finalization_locality" AS ENUM('local','cloud');--> statement-breakpoint
CREATE TYPE "public"."finalization_source" AS ENUM('mic','system');--> statement-breakpoint

CREATE TABLE "finalization_manifests" (
	"meeting_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"local_manifest_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finalization_manifests_local_manifest_hash_hex64" CHECK ("finalization_manifests"."local_manifest_hash" ~ '^[0-9a-fA-F]{64}$')
);--> statement-breakpoint

CREATE TABLE "finalization_states" (
	"meeting_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"state" "finalization_state" NOT NULL,
	"primary_action" "finalization_primary_action" NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finalization_states_version_positive" CHECK ("finalization_states"."version" > 0)
);--> statement-breakpoint

CREATE TABLE "finalization_ranges" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"source" "finalization_source" NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"classification" "finalization_range_classification" NOT NULL,
	"actor_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finalization_ranges_end_gt_start" CHECK ("finalization_ranges"."end_ms" > "finalization_ranges"."start_ms")
);--> statement-breakpoint

CREATE TABLE "finalization_run_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"run_id" text NOT NULL,
	"index" integer NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"locality" "finalization_locality" NOT NULL,
	"lifecycle_state" "finalization_part_state" NOT NULL,
	"raw_result_hash" char(64),
	"safe_error" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finalization_run_parts_end_gt_start" CHECK ("finalization_run_parts"."end_ms" > "finalization_run_parts"."start_ms"),
	CONSTRAINT "finalization_run_parts_index_non_negative" CHECK ("finalization_run_parts"."index" >= 0),
	CONSTRAINT "finalization_run_parts_raw_result_hash_hex64" CHECK ("finalization_run_parts"."raw_result_hash" IS NULL OR ("finalization_run_parts"."raw_result_hash" ~ '^[0-9a-fA-F]{64}$'))
);--> statement-breakpoint

ALTER TABLE "finalization_manifests" ADD CONSTRAINT "finalization_manifests_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalization_states" ADD CONSTRAINT "finalization_states_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalization_ranges" ADD CONSTRAINT "finalization_ranges_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalization_run_parts" ADD CONSTRAINT "finalization_run_parts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "finalization_manifests_owner_idx" ON "finalization_manifests" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "finalization_states_owner_idx" ON "finalization_states" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "finalization_ranges_owner_meeting_idx" ON "finalization_ranges" USING btree ("owner_id","meeting_id");--> statement-breakpoint
CREATE INDEX "finalization_run_parts_owner_meeting_idx" ON "finalization_run_parts" USING btree ("owner_id","meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finalization_run_parts_run_index_unique" ON "finalization_run_parts" USING btree ("run_id","index");--> statement-breakpoint

-- ── Integrity / immutability triggers ──────────────────────────────────
-- Manifest, range classifications, and completed run parts are immutable.
-- Custom SQLSTATE 'P0311' = immutable_violation.

CREATE OR REPLACE FUNCTION "fn_finalization_manifests_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'finalization_manifest_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_finalization_manifests_immutable" BEFORE UPDATE OR DELETE ON "finalization_manifests"
	FOR EACH ROW EXECUTE FUNCTION "fn_finalization_manifests_immutable"();--> statement-breakpoint

CREATE OR REPLACE FUNCTION "fn_finalization_ranges_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'finalization_range_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_finalization_ranges_immutable" BEFORE UPDATE OR DELETE ON "finalization_ranges"
	FOR EACH ROW EXECUTE FUNCTION "fn_finalization_ranges_immutable"();--> statement-breakpoint

CREATE OR REPLACE FUNCTION "fn_finalization_run_parts_immutable"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'finalization_run_part_immutable' USING ERRCODE = 'P0311';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_finalization_run_parts_immutable" BEFORE UPDATE OR DELETE ON "finalization_run_parts"
	FOR EACH ROW EXECUTE FUNCTION "fn_finalization_run_parts_immutable"();--> statement-breakpoint
