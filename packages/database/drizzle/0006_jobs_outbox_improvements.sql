ALTER TABLE "outbox_events" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "last_error_message" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "meeting_event_sequence" integer;--> statement-breakpoint

CREATE OR REPLACE FUNCTION notify_outbox_inserted()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('outbox_inserted', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS trigger_notify_outbox_inserted ON outbox_events;--> statement-breakpoint
CREATE TRIGGER trigger_notify_outbox_inserted
AFTER INSERT ON outbox_events
FOR EACH ROW
EXECUTE FUNCTION notify_outbox_inserted();
