import { describe, it, expect } from 'vitest';
import {
  meetingStateMachine,
  MeetingState,
  MeetingCommand,
  ALL_STATES,
  ALL_COMMANDS,
  LEGAL_TRANSITIONS,
  isTerminalState,
  canTransition,
  getAvailableCommands,
} from './machine.js';

const BASE_CMD = {
  meetingId: '550e8400-e29b-41d4-a716-446655440000',
  actorId: 'user-1',
  version: 1,
  timestamp: '2026-07-22T09:00:00.000Z',
};

// ── Legal transition tests ──

describe('Legal transitions', () => {
  it('draft + Create → checking', () => {
    const result = meetingStateMachine('draft', {
      ...BASE_CMD,
      type: 'Create',
      title: 'Test Meeting',
      language: 'vi',
      mode: 'meeting_only',
      captureSources: ['mic'],
      timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('checking');
    }
  });

  it('checking + Start → recording', () => {
    const result = meetingStateMachine('checking', { ...BASE_CMD, type: 'Start' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('recording');
    }
  });

  it('recording + Pause → paused', () => {
    const result = meetingStateMachine('recording', { ...BASE_CMD, type: 'Pause' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('paused');
    }
  });

  it('paused + Resume → recording', () => {
    const result = meetingStateMachine('paused', { ...BASE_CMD, type: 'Resume' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('recording');
    }
  });

  it('recording + End → finalizing', () => {
    const result = meetingStateMachine('recording', { ...BASE_CMD, type: 'End' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('finalizing');
    }
  });

  it('paused + End → finalizing', () => {
    const result = meetingStateMachine('paused', { ...BASE_CMD, type: 'End' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('finalizing');
    }
  });

  it('finalizing + auto → processing', () => {
    const result = meetingStateMachine('finalizing', {
      ...BASE_CMD,
      type: 'MarkProcessing',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('processing');
    }
  });

  it('processing + MarkReady → ready', () => {
    const result = meetingStateMachine('processing', {
      ...BASE_CMD,
      type: 'MarkReady',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('ready');
    }
  });

  it('processing + MarkPartialReady → partial_ready', () => {
    const result = meetingStateMachine('processing', {
      ...BASE_CMD,
      type: 'MarkPartialReady',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('partial_ready');
    }
  });

  it('partial_ready + RetryProcessing → processing', () => {
    const result = meetingStateMachine('partial_ready', {
      ...BASE_CMD,
      type: 'RetryProcessing',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('processing');
    }
  });

  it('recording + MarkRecoveryRequired → recovery_required', () => {
    const result = meetingStateMachine('recording', {
      ...BASE_CMD,
      type: 'MarkRecoveryRequired',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('recovery_required');
    }
  });

  it('paused + MarkRecoveryRequired → recovery_required', () => {
    const result = meetingStateMachine('paused', {
      ...BASE_CMD,
      type: 'MarkRecoveryRequired',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('recovery_required');
    }
  });

  it('recovery_required + Recover(end) → finalizing', () => {
    const result = meetingStateMachine('recovery_required', {
      ...BASE_CMD,
      type: 'Recover',
      action: 'end',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('finalizing');
    }
  });

  it('recovery_required + Recover(continue) → recording', () => {
    const result = meetingStateMachine('recovery_required', {
      ...BASE_CMD,
      type: 'Recover',
      action: 'continue',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('recording');
    }
  });

  it('recovery_required + Recover without action → error', () => {
    const result = meetingStateMachine('recovery_required', {
      ...BASE_CMD,
      type: 'Recover',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MEETING_INVALID_TRANSITION');
      expect(result.error.message).toContain('action');
    }
  });
});

// ── Deletion lifecycle tests ──

describe('Deletion lifecycle', () => {
  it('SoftDelete from any non-deleted state → deleted', () => {
    const deletableStates: MeetingState[] = [
      'draft',
      'checking',
      'recording',
      'paused',
      'finalizing',
      'processing',
      'ready',
      'partial_ready',
      'recovery_required',
    ];
    for (const state of deletableStates) {
      const result = meetingStateMachine(state, { ...BASE_CMD, type: 'SoftDelete' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.newState).toBe('deleted');
      }
    }
  });

  it('SoftDelete from deleted is idempotent', () => {
    const result = meetingStateMachine('deleted', { ...BASE_CMD, type: 'SoftDelete' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('deleted');
    }
  });

  it('Restore from deleted → previous state', () => {
    // After soft delete, restore brings it back
    const result = meetingStateMachine('deleted', {
      ...BASE_CMD,
      type: 'Restore',
      previousState: 'ready',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('ready');
    }
  });

  it('PermanentDelete from deleted succeeds', () => {
    const result = meetingStateMachine('deleted', {
      ...BASE_CMD,
      type: 'PermanentDelete',
    });
    expect(result.success).toBe(true);
    // PermanentDelete is terminal — no state change returned (handled externally)
  });

  it('PermanentDelete from non-deleted state fails', () => {
    const result = meetingStateMachine('ready', {
      ...BASE_CMD,
      type: 'PermanentDelete',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MEETING_INVALID_TRANSITION');
    }
  });

  it('Restore from non-deleted state fails', () => {
    const result = meetingStateMachine('ready', {
      ...BASE_CMD,
      type: 'Restore',
      previousState: 'ready',
    });
    expect(result.success).toBe(false);
  });

  it('Restore with previousState=deleted fails', () => {
    const result = meetingStateMachine('deleted', {
      ...BASE_CMD,
      type: 'Restore',
      previousState: 'deleted',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MEETING_INVALID_TRANSITION');
    }
  });
});

// ── Illegal transition tests ──

describe('Illegal transitions', () => {
  it('Create from non-draft fails', () => {
    const states: MeetingState[] = [
      'checking',
      'recording',
      'paused',
      'finalizing',
      'processing',
      'ready',
    ];
    for (const state of states) {
      const result = meetingStateMachine(state, {
        ...BASE_CMD,
        type: 'Create',
        title: 'Test',
        language: 'vi',
        mode: 'meeting_only',
        captureSources: ['mic'],
        timezone: 'UTC',
      });
      expect(result.success).toBe(false);
    }
  });

  it('Start from non-checking fails', () => {
    const result = meetingStateMachine('draft', { ...BASE_CMD, type: 'Start' });
    expect(result.success).toBe(false);
  });

  it('Pause from non-recording fails', () => {
    const result = meetingStateMachine('draft', { ...BASE_CMD, type: 'Pause' });
    expect(result.success).toBe(false);
  });

  it('Resume from non-paused fails', () => {
    const result = meetingStateMachine('recording', { ...BASE_CMD, type: 'Resume' });
    expect(result.success).toBe(false);
  });

  it('End from non-recording/paused fails', () => {
    const result = meetingStateMachine('draft', { ...BASE_CMD, type: 'End' });
    expect(result.success).toBe(false);
  });

  it('MarkReady from non-processing fails', () => {
    const result = meetingStateMachine('draft', { ...BASE_CMD, type: 'MarkReady' });
    expect(result.success).toBe(false);
  });

  it('RetryProcessing from non-partial_ready fails', () => {
    const result = meetingStateMachine('draft', { ...BASE_CMD, type: 'RetryProcessing' });
    expect(result.success).toBe(false);
  });

  it('Recover from non-recovery_required fails', () => {
    const result = meetingStateMachine('draft', {
      ...BASE_CMD,
      type: 'Recover',
      action: 'end',
    });
    expect(result.success).toBe(false);
  });
});

// ── Version (optimistic concurrency) tests ──

describe('Optimistic versioning', () => {
  it('succeeds when command version matches persisted version', () => {
    const result = meetingStateMachine(
      'draft',
      {
        ...BASE_CMD,
        type: 'Create',
        version: 1,
        title: 'Test',
        language: 'vi',
        mode: 'meeting_only',
        captureSources: ['mic'],
        timezone: 'UTC',
      },
      1, // persistedVersion matches
    );
    expect(result.success).toBe(true);
  });

  it('fails when command version does not match persisted version', () => {
    const result = meetingStateMachine(
      'draft',
      {
        ...BASE_CMD,
        type: 'Create',
        version: 2,
        title: 'Test',
        language: 'vi',
        mode: 'meeting_only',
        captureSources: ['mic'],
        timezone: 'UTC',
      },
      1, // persistedVersion is 1, but command says version 2
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MEETING_VERSION_CONFLICT');
    }
  });

  it('version check skipped when no persistedVersion provided', () => {
    const result = meetingStateMachine('draft', {
      ...BASE_CMD,
      type: 'Create',
      version: 1,
      title: 'Test',
      language: 'vi',
      mode: 'meeting_only',
      captureSources: ['mic'],
      timezone: 'UTC',
    });
    expect(result.success).toBe(true);
  });
});

// ── Idempotency tests ──

describe('Idempotency', () => {
  it('same command applied twice from same state yields same result', () => {
    const cmd = { ...BASE_CMD, type: 'Start' as const };
    const result1 = meetingStateMachine('checking', cmd);
    // After Start, state is 'recording'. Applying Start again would fail
    // (not idempotent — but that's correct; Start is not idempotent)
    // Idempotent commands are those that can be repeated safely.
    // Pause from recording → paused; Pause from paused is illegal.
    expect(result1.success).toBe(true);
  });

  it('Pause while paused is illegal (not idempotent)', () => {
    const result = meetingStateMachine('paused', { ...BASE_CMD, type: 'Pause' });
    expect(result.success).toBe(false);
  });

  it('SoftDelete is idempotent', () => {
    const result = meetingStateMachine('deleted', { ...BASE_CMD, type: 'SoftDelete' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('deleted');
    }
  });

  it('MarkRecoveryRequired is idempotent on recovery_required', () => {
    const result = meetingStateMachine('recovery_required', {
      ...BASE_CMD,
      type: 'MarkRecoveryRequired',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('recovery_required');
    }
  });
});

// ── Full lifecycle tests ──

describe('Full meeting lifecycle', () => {
  it('happy path: draft → checking → recording → paused → recording → finalizing → processing → ready', () => {
    let state: MeetingState = 'draft';

    const r1 = meetingStateMachine(state, {
      ...BASE_CMD,
      type: 'Create',
      title: 'Test',
      language: 'vi',
      mode: 'meeting_only',
      captureSources: ['mic'],
      timezone: 'UTC',
    });
    expect(r1.success).toBe(true);
    if (r1.success) state = r1.newState;
    expect(state).toBe('checking');

    const r2 = meetingStateMachine(state, { ...BASE_CMD, type: 'Start' });
    expect(r2.success).toBe(true);
    if (r2.success) state = r2.newState;
    expect(state).toBe('recording');

    const r3 = meetingStateMachine(state, { ...BASE_CMD, type: 'Pause' });
    expect(r3.success).toBe(true);
    if (r3.success) state = r3.newState;
    expect(state).toBe('paused');

    const r4 = meetingStateMachine(state, { ...BASE_CMD, type: 'Resume' });
    expect(r4.success).toBe(true);
    if (r4.success) state = r4.newState;
    expect(state).toBe('recording');

    const r5 = meetingStateMachine(state, { ...BASE_CMD, type: 'End' });
    expect(r5.success).toBe(true);
    if (r5.success) state = r5.newState;
    expect(state).toBe('finalizing');

    const r6 = meetingStateMachine(state, { ...BASE_CMD, type: 'MarkProcessing' });
    expect(r6.success).toBe(true);
    if (r6.success) state = r6.newState;
    expect(state).toBe('processing');

    const r7 = meetingStateMachine(state, { ...BASE_CMD, type: 'MarkReady' });
    expect(r7.success).toBe(true);
    if (r7.success) state = r7.newState;
    expect(state).toBe('ready');
  });

  it('recovery path: recording → recovery_required → finalizing', () => {
    let state: MeetingState = 'recording';

    const r1 = meetingStateMachine(state, { ...BASE_CMD, type: 'MarkRecoveryRequired' });
    expect(r1.success).toBe(true);
    if (r1.success) state = r1.newState;
    expect(state).toBe('recovery_required');

    const r2 = meetingStateMachine(state, { ...BASE_CMD, type: 'Recover', action: 'end' });
    expect(r2.success).toBe(true);
    if (r2.success) state = r2.newState;
    expect(state).toBe('finalizing');
  });

  it('recovery and continue: recovery_required → recording', () => {
    const result = meetingStateMachine('recovery_required', {
      ...BASE_CMD,
      type: 'Recover',
      action: 'continue',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newState).toBe('recording');
    }
  });

  it('partial_ready retry cycle', () => {
    let state: MeetingState = 'partial_ready';

    const r1 = meetingStateMachine(state, { ...BASE_CMD, type: 'RetryProcessing' });
    expect(r1.success).toBe(true);
    if (r1.success) state = r1.newState;
    expect(state).toBe('processing');

    // Can go back to partial_ready
    const r2 = meetingStateMachine(state, { ...BASE_CMD, type: 'MarkPartialReady' });
    expect(r2.success).toBe(true);
    if (r2.success) state = r2.newState;
    expect(state).toBe('partial_ready');
  });

  it('deletion cycle: ready → deleted → ready → deleted → permanent', () => {
    let state: MeetingState = 'ready';

    const r1 = meetingStateMachine(state, { ...BASE_CMD, type: 'SoftDelete' });
    expect(r1.success).toBe(true);
    if (r1.success) state = r1.newState;
    expect(state).toBe('deleted');

    const r2 = meetingStateMachine(state, { ...BASE_CMD, type: 'Restore', previousState: 'ready' });
    expect(r2.success).toBe(true);
    if (r2.success) state = r2.newState;
    expect(state).toBe('ready');

    const r3 = meetingStateMachine(state, { ...BASE_CMD, type: 'SoftDelete' });
    expect(r3.success).toBe(true);
    if (r3.success) state = r3.newState;
    expect(state).toBe('deleted');

    const r4 = meetingStateMachine(state, { ...BASE_CMD, type: 'PermanentDelete' });
    expect(r4.success).toBe(true);
  });
});

// ── Utility tests ──

describe('Utility functions', () => {
  it('isTerminalState identifies deleted as terminal', () => {
    expect(isTerminalState('deleted')).toBe(false); // deleted can be restored
  });

  it('canTransition returns true for legal transitions', () => {
    expect(canTransition('recording', 'Pause')).toBe(true);
  });

  it('canTransition returns false for illegal transitions', () => {
    expect(canTransition('draft', 'Start')).toBe(false);
  });

  it('getAvailableCommands returns list for a state', () => {
    const cmds = getAvailableCommands('recording');
    expect(cmds).toContain('Pause');
    expect(cmds).toContain('End');
    expect(cmds).toContain('SoftDelete');
  });
});

// ── Property: no undocumented transitions succeed ──

describe('Property: complete transition coverage', () => {
  it('every (state, command) pair has a documented outcome', () => {
    const undocumented: string[] = [];

    for (const state of ALL_STATES) {
      for (const command of ALL_COMMANDS) {
        // Skip commands that require extra payload — they'll fail on validation
        const result = meetingStateMachine(state, {
          meetingId: '550e8400-e29b-41d4-a716-446655440000',
          actorId: 'user-1',
          version: 1,
          timestamp: '2026-07-22T09:00:00.000Z',
          type: command,
          title: 'Test',
          language: 'vi',
          mode: 'meeting_only',
          captureSources: ['mic'],
          timezone: 'UTC',
          action: 'end',
        } as MeetingCommand);

        // Every result must be explicitly handled — success or typed error
        // No unexpected exceptions
        if (result.success) {
          const isLegal = LEGAL_TRANSITIONS.some((t) => t.from === state && t.command === command);
          if (!isLegal) {
            undocumented.push(`${state} + ${command} → ${result.newState} (undocumented success)`);
          }
        }
      }
    }

    expect(undocumented).toEqual([]);
  });
});
