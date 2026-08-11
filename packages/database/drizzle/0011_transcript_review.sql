CREATE TABLE IF NOT EXISTS transcript_review_projections (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
  owner_id text NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  finalization_manifest_hash char(64),
  audio_manifest_hash char(64),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, meeting_id)
);
CREATE TABLE IF NOT EXISTS transcript_review_decisions (
  id text PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
  owner_id text NOT NULL,
  segment_id text NOT NULL REFERENCES transcript_segments(id) ON DELETE RESTRICT,
  alternative_id text NOT NULL,
  base_decision_id text REFERENCES transcript_review_decisions(id),
  base_projection_version integer NOT NULL CHECK (base_projection_version >= 0),
  actor_id text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS transcript_review_decisions_owner_meeting_segment_idx ON transcript_review_decisions(owner_id, meeting_id, segment_id);
CREATE TABLE IF NOT EXISTS transcript_review_lineage (
  id text PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
  owner_id text NOT NULL,
  run_id text NOT NULL,
  part_id text NOT NULL,
  event_id text NOT NULL,
  source_segment_id text NOT NULL REFERENCES transcript_segments(id) ON DELETE RESTRICT,
  finalization_manifest_hash char(64) NOT NULL,
  audio_manifest_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, meeting_id, source_segment_id)
);
CREATE TABLE IF NOT EXISTS transcript_review_revisions (
  id text PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
  owner_id text NOT NULL,
  segment_id text NOT NULL REFERENCES transcript_segments(id) ON DELETE RESTRICT,
  base_revision_id text REFERENCES transcript_review_revisions(id),
  revised_text text NOT NULL,
  revised_speaker_id text,
  reason text,
  base_projection_version integer NOT NULL CHECK (base_projection_version >= 0),
  actor_id text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS transcript_review_revisions_owner_meeting_segment_idx ON transcript_review_revisions(owner_id, meeting_id, segment_id);
CREATE TABLE IF NOT EXISTS transcript_review_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
  command_type text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, command_type, idempotency_key)
);
CREATE INDEX IF NOT EXISTS transcript_review_idempotency_owner_meeting_idx ON transcript_review_idempotency(owner_id, meeting_id);
CREATE OR REPLACE FUNCTION prevent_transcript_review_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable transcript review history'; END; $$;
DROP TRIGGER IF EXISTS transcript_review_decisions_immutable ON transcript_review_decisions;
CREATE TRIGGER transcript_review_decisions_immutable BEFORE UPDATE OR DELETE ON transcript_review_decisions FOR EACH ROW EXECUTE FUNCTION prevent_transcript_review_mutation();
DROP TRIGGER IF EXISTS transcript_review_revisions_immutable ON transcript_review_revisions;
CREATE TRIGGER transcript_review_revisions_immutable BEFORE UPDATE OR DELETE ON transcript_review_revisions FOR EACH ROW EXECUTE FUNCTION prevent_transcript_review_mutation();
DROP TRIGGER IF EXISTS transcript_review_lineage_immutable ON transcript_review_lineage;
CREATE TRIGGER transcript_review_lineage_immutable BEFORE UPDATE OR DELETE ON transcript_review_lineage FOR EACH ROW EXECUTE FUNCTION prevent_transcript_review_mutation();
