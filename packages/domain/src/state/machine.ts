// ── Meeting states ──

export const MEETING_STATES = [
  'draft',
  'checking',
  'recording',
  'paused',
  'finalizing',
  'processing',
  'ready',
  'recovery_required',
  'partial_ready',
  'deleted',
] as const;

export type MeetingState = (typeof MEETING_STATES)[number];
export const ALL_STATES: readonly MeetingState[] = MEETING_STATES;

// ── Meeting commands ──

export const MEETING_COMMANDS = [
  'Create',
  'Start',
  'Pause',
  'Resume',
  'End',
  'MarkProcessing',
  'MarkReady',
  'MarkPartialReady',
  'MarkRecoveryRequired',
  'Recover',
  'RetryProcessing',
  'SoftDelete',
  'Restore',
  'PermanentDelete',
] as const;

export type MeetingCommandType = (typeof MEETING_COMMANDS)[number];
export const ALL_COMMANDS: readonly MeetingCommandType[] = MEETING_COMMANDS;

// ── Command interface ──

export interface MeetingCommand {
  type: MeetingCommandType;
  meetingId: string;
  actorId: string;
  version: number;
  stateVersion?: number;
  timestamp: string;
  // Create payload
  title?: string;
  language?: 'vi' | 'en';
  mode?: 'meeting_only' | 'meeting_translate';
  captureSources?: ('mic' | 'system')[];
  timezone?: string;
  // Recover payload
  action?: 'end' | 'continue';
  // Restore payload
  previousState?: MeetingState;
}

// ── Domain event ──

export interface DomainEvent {
  type: string;
  meetingId: string;
  actorId: string;
  timestamp: string;
  version: number;
  data?: Record<string, unknown>;
}

// ── State machine result ──

export type StateMachineResult =
  | { success: true; newState: MeetingState; events: DomainEvent[] }
  | { success: false; error: { code: string; message: string; details?: Record<string, unknown> } };

// ── Transition definition ──

export interface Transition {
  from: MeetingState;
  command: MeetingCommandType;
  to: MeetingState;
}

// ── Legal transition table ──

export const LEGAL_TRANSITIONS: readonly Transition[] = [
  // Creation
  { from: 'draft', command: 'Create', to: 'checking' },

  // Start capture
  { from: 'checking', command: 'Start', to: 'recording' },

  // Pause/Resume cycle
  { from: 'recording', command: 'Pause', to: 'paused' },
  { from: 'paused', command: 'Resume', to: 'recording' },

  // End meeting
  { from: 'recording', command: 'End', to: 'finalizing' },
  { from: 'paused', command: 'End', to: 'finalizing' },

  // Processing pipeline
  { from: 'finalizing', command: 'MarkProcessing', to: 'processing' },
  { from: 'processing', command: 'MarkReady', to: 'ready' },
  { from: 'processing', command: 'MarkPartialReady', to: 'partial_ready' },

  // Recovery
  { from: 'recording', command: 'MarkRecoveryRequired', to: 'recovery_required' },
  { from: 'paused', command: 'MarkRecoveryRequired', to: 'recovery_required' },
  { from: 'recovery_required', command: 'Recover', to: 'finalizing' },
  { from: 'recovery_required', command: 'Recover', to: 'recording' },

  // Retry
  { from: 'partial_ready', command: 'RetryProcessing', to: 'processing' },

  // Deletion lifecycle
  { from: 'draft', command: 'SoftDelete', to: 'deleted' },
  { from: 'checking', command: 'SoftDelete', to: 'deleted' },
  { from: 'recording', command: 'SoftDelete', to: 'deleted' },
  { from: 'paused', command: 'SoftDelete', to: 'deleted' },
  { from: 'finalizing', command: 'SoftDelete', to: 'deleted' },
  { from: 'processing', command: 'SoftDelete', to: 'deleted' },
  { from: 'ready', command: 'SoftDelete', to: 'deleted' },
  { from: 'partial_ready', command: 'SoftDelete', to: 'deleted' },
  { from: 'recovery_required', command: 'SoftDelete', to: 'deleted' },

  // Idempotent SoftDelete on already-deleted
  { from: 'deleted', command: 'SoftDelete', to: 'deleted' },

  // Restore
  { from: 'deleted', command: 'Restore', to: 'draft' }, // fallback; actual previousState used at runtime

  // Permanent delete
  { from: 'deleted', command: 'PermanentDelete', to: 'deleted' },

  // Idempotent recovery
  { from: 'recovery_required', command: 'MarkRecoveryRequired', to: 'recovery_required' },
  { from: 'finalizing', command: 'MarkProcessing', to: 'processing' },
  { from: 'partial_ready', command: 'RetryProcessing', to: 'processing' },
];

// ── Pure reducer ──

export function meetingStateMachine(
  currentState: MeetingState,
  command: MeetingCommand,
): StateMachineResult {
  // ── Optimistic version check ──
  if (command.stateVersion !== undefined && command.version !== command.stateVersion) {
    return {
      success: false,
      error: {
        code: 'MEETING_VERSION_CONFLICT',
        message: `Expected version ${command.stateVersion}, got ${command.version}`,
        details: { expectedVersion: command.stateVersion, actualVersion: command.version },
      },
    };
  }

  // ── Find matching transition ──
  const transition = LEGAL_TRANSITIONS.find(
    (t) => t.from === currentState && t.command === command.type,
  );

  if (!transition) {
    return {
      success: false,
      error: {
        code: 'MEETING_INVALID_TRANSITION',
        message: `Cannot execute ${command.type} from state ${currentState}`,
        details: { currentState, command: command.type },
      },
    };
  }

  // ── Restore special case: use previousState if provided ──
  let newState = transition.to;
  if (command.type === 'Restore' && command.previousState) {
    // Validate previousState is a valid non-deleted state
    if (command.previousState !== 'deleted') {
      newState = command.previousState;
    }
  }

  // ── Recover special case: use action to determine target ──
  if (command.type === 'Recover' && command.action) {
    newState = command.action === 'continue' ? 'recording' : 'finalizing';
  }

  // ── Build event ──
  const event: DomainEvent = {
    type: `Meeting${command.type}`,
    meetingId: command.meetingId,
    actorId: command.actorId,
    timestamp: command.timestamp,
    version: command.version,
    data: {},
  };

  return {
    success: true,
    newState,
    events: [event],
  };
}

// ── Utility functions ──

export function isTerminalState(_state: MeetingState): boolean {
  // 'deleted' is not terminal because it can be restored
  // PermanentDelete marks true terminal but we don't have a separate state for it
  return false;
}

export function canTransition(state: MeetingState, command: MeetingCommandType): boolean {
  return LEGAL_TRANSITIONS.some((t) => t.from === state && t.command === command);
}

export function getAvailableCommands(state: MeetingState): MeetingCommandType[] {
  const commands = new Set<MeetingCommandType>();
  for (const t of LEGAL_TRANSITIONS) {
    if (t.from === state) {
      commands.add(t.command);
    }
  }
  return [...commands];
}
