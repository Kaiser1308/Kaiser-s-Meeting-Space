import { describe, expect, it } from 'vitest';
import { outboxEvents } from '../src/schema/outbox.js';

describe('Outbox Drizzle Schema Definitions', () => {
  it('should define the new outbox fields with expected Drizzle properties', () => {
    expect(outboxEvents.leaseOwner).toBeDefined();
    expect(outboxEvents.nextAttemptAt).toBeDefined();
    expect(outboxEvents.lastErrorMessage).toBeDefined();
    expect(outboxEvents.meetingEventSequence).toBeDefined();

    expect(outboxEvents.leaseOwner.name).toBe('lease_owner');
    expect(outboxEvents.nextAttemptAt.name).toBe('next_attempt_at');
    expect(outboxEvents.lastErrorMessage.name).toBe('last_error_message');
    expect(outboxEvents.meetingEventSequence.name).toBe('meeting_event_sequence');
  });
});
