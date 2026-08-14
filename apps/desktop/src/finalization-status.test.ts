import { describe, it, expect } from 'vitest';
import { mapFinalizationStatus } from './finalization-status.js';

const base = { meetingId: 'm-1', state: 'ready' as const, primaryAction: 'local' as const, version: 1 };

describe('mapFinalizationStatus', () => {
  it('marks ready/partial_ready as complete', () => {
    expect(mapFinalizationStatus({ ...base, state: 'ready' }).isComplete).toBe(true);
    expect(mapFinalizationStatus({ ...base, state: 'partial_ready' }).isComplete).toBe(true);
    expect(mapFinalizationStatus({ ...base, state: 'processing' }).isComplete).toBe(false);
  });

  it('flags attention for recovery and waiting/review actions', () => {
    expect(mapFinalizationStatus({ ...base, state: 'recovery_required' }).requiresAttention).toBe(true);
    expect(mapFinalizationStatus({ ...base, primaryAction: 'review_required' }).requiresAttention).toBe(true);
    expect(mapFinalizationStatus({ ...base, primaryAction: 'waiting_for_desktop' }).requiresAttention).toBe(true);
    expect(mapFinalizationStatus({ ...base, primaryAction: 'local' }).requiresAttention).toBe(false);
  });

  it('produces a human label for every state', () => {
    expect(mapFinalizationStatus({ ...base, state: 'ready' }).label).toBe('Ready');
    expect(mapFinalizationStatus({ ...base, state: 'recovery_required' }).label).toBe('Recovery required');
  });
});
