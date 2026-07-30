import { describe, it, expect } from 'vitest';
import { startFlowReducer, INITIAL_STATE } from './start-flow-reducer.js';

describe('startFlowReducer', () => {
  it('should initialize with correct state', () => {
    expect(INITIAL_STATE.currentStep).toBe('title');
    expect(INITIAL_STATE.languageConfirmedThisMeeting).toBe(false);
  });

  describe('forward/back navigation', () => {
    it('blocks forward from title if empty', () => {
      const state = startFlowReducer(INITIAL_STATE, { type: 'forward' });
      expect(state.currentStep).toBe('title');
    });

    it('allows forward from title if valid', () => {
      const state1 = startFlowReducer(INITIAL_STATE, {
        type: 'setField',
        field: 'title',
        value: 'Hello',
      });
      const state2 = startFlowReducer(state1, { type: 'forward' });
      expect(state2.currentStep).toBe('language');
    });

    it('blocks forward from language if not confirmed', () => {
      const state = { ...INITIAL_STATE, currentStep: 'language' as const };
      const next = startFlowReducer(state, { type: 'forward' });
      expect(next.currentStep).toBe('language');
    });

    it('allows forward from language if confirmed', () => {
      const state1 = { ...INITIAL_STATE, currentStep: 'language' as const };
      const state2 = startFlowReducer(state1, { type: 'setField', field: 'language', value: 'vi' });
      const state3 = startFlowReducer(state2, { type: 'forward' });
      expect(state3.currentStep).toBe('mode');
    });

    it('allows back navigation', () => {
      const state = { ...INITIAL_STATE, currentStep: 'mode' as const };
      const next = startFlowReducer(state, { type: 'back' });
      expect(next.currentStep).toBe('language');
    });

    it('blocks forward from readiness if blocking issues exist', () => {
      const state = {
        ...INITIAL_STATE,
        currentStep: 'readiness' as const,
        readiness: {
          blocking: [{ category: 'microphone_permission', remediationKey: 'x' }],
          delayed: [],
          checkedAt: 0,
          sequence: 0,
        } as any,
      };
      const next = startFlowReducer(state, { type: 'forward' });
      expect(next.currentStep).toBe('readiness');
    });

    it('allows forward from readiness if no blocking issues', () => {
      const state = {
        ...INITIAL_STATE,
        currentStep: 'readiness' as const,
        readiness: {
          blocking: [],
          delayed: [{ category: 'desktop_absent', waitingStateLabel: 'waiting_for_desktop' }],
          checkedAt: 0,
          sequence: 0,
        } as any,
      };
      const next = startFlowReducer(state, { type: 'forward' });
      expect(next.currentStep).toBe('consent');
    });
  });

  describe('edit navigation', () => {
    it('allows jumping back', () => {
      const state = { ...INITIAL_STATE, currentStep: 'readiness' as const };
      const next = startFlowReducer(state, { type: 'edit', step: 'title' });
      expect(next.currentStep).toBe('title');
    });

    it('blocks jumping forward', () => {
      const state = { ...INITIAL_STATE, currentStep: 'title' as const };
      const next = startFlowReducer(state, { type: 'edit', step: 'readiness' });
      expect(next.currentStep).toBe('title');
    });
  });

  describe('setPolicy', () => {
    it('normalizes cloudCheckScope when final is changed away from local_cloud_check', () => {
      const state = {
        ...INITIAL_STATE,
        draft: {
          ...INITIAL_STATE.draft,
          policy: {
            ...INITIAL_STATE.draft.policy,
            final: 'local_cloud_check' as const,
            cloudCheckScope: 'full' as const,
            cloudConsent: 'granted' as const,
          },
        },
      };
      const next = startFlowReducer(state, { type: 'setPolicy', policy: { final: 'local' } });
      expect(next.draft.policy.final).toBe('local');
      expect(next.draft.policy.cloudCheckScope).toBe('off');
    });

    it('normalizes cloudConsent when cloud path is selected', () => {
      const state = INITIAL_STATE;
      const next = startFlowReducer(state, { type: 'setPolicy', policy: { live: 'cloud' } });
      expect(next.draft.policy.cloudConsent).toBe('required');
    });
  });

  describe('restore', () => {
    it('resets if languageConfirmedThisMeeting is true', () => {
      const persisted = { languageConfirmedThisMeeting: true };
      const state = startFlowReducer(INITIAL_STATE, { type: 'restore', persisted });
      expect(state).toEqual(INITIAL_STATE);
    });

    it('restores valid draft', () => {
      const persisted = {
        draft: {
          title: 'Hello',
          language: null,
          mode: null,
          captureSources: ['mic'],
          policy: INITIAL_STATE.draft.policy,
        },
      };
      const state = startFlowReducer(INITIAL_STATE, { type: 'restore', persisted });
      expect(state.draft.title).toBe('Hello');
    });

    it('resets on invalid policy', () => {
      const persisted = {
        draft: {
          title: 'Hello',
          language: null,
          mode: null,
          captureSources: ['mic'],
          policy: { ...INITIAL_STATE.draft.policy, version: 2 },
        },
      };
      const state = startFlowReducer(INITIAL_STATE, { type: 'restore', persisted });
      expect(state).toEqual(INITIAL_STATE);
    });
  });
});
