import { MeetingLanguageSchema, TranscriptionPolicyV1Schema } from '@kms/domain';
import type { StartFlowState, StartFlowAction, StartFlowStep } from '../types';
import { z } from 'zod';

const STEP_ORDER: StartFlowStep[] = [
  'title',
  'language',
  'mode',
  'source',
  'processing',
  'readiness',
  'consent',
  'start',
];

const PersistedDraftSchema = z
  .object({
    title: z.string().max(500),
    language: z.enum(['vi', 'en']).nullable(),
    mode: z.enum(['meeting_only', 'meeting_translate']).nullable(),
    captureSources: z
      .array(z.enum(['mic', 'system']))
      .min(1)
      .refine((sources) => new Set(sources).size === sources.length),
    policy: TranscriptionPolicyV1Schema,
  })
  .strict();

export const INITIAL_STATE: StartFlowState = {
  currentStep: 'title',
  draft: {
    title: '',
    language: null,
    mode: null,
    captureSources: [],
    policy: {
      version: 1,
      language: 'vi',
      live: 'off',
      final: 'local',
      cloudCheckScope: 'off',
      cloudConsent: 'not_required',
    },
  },
  suggestions: {},
  readiness: null,
  consent: [],
  languageConfirmedThisMeeting: false,
};

function canGoForward(state: StartFlowState): boolean {
  switch (state.currentStep) {
    case 'title':
      return state.draft.title.length > 0 && state.draft.title.length <= 500;
    case 'language':
      return state.languageConfirmedThisMeeting;
    case 'mode':
      return state.draft.mode !== null;
    case 'source':
      return state.draft.captureSources.length >= 1; // Assuming array is distinct
    case 'processing':
      return TranscriptionPolicyV1Schema.safeParse(state.draft.policy).success;
    case 'readiness':
      return state.readiness !== null && state.readiness.blocking.length === 0;
    case 'consent': {
      // every cloud path in policy must have a matching granted CloudConsentRecord
      const p = state.draft.policy;

      const needsLive = p.live === 'cloud';
      const needsFinal = p.final === 'cloud';
      const needsCheck = p.cloudCheckScope !== 'off';

      if (needsLive && !state.consent.some((c) => c.scope === 'live')) return false;
      if (needsFinal && !state.consent.some((c) => c.scope === 'final')) return false;
      if (
        needsCheck &&
        !state.consent.some(
          (c) =>
            c.scope === 'cloud_check' &&
            (c.cloudCheckApproval === p.cloudCheckScope || c.cloudCheckApproval === 'full'),
        )
      )
        return false;

      return true;
    }
    case 'start':
      return false;
  }
}

export function startFlowReducer(state: StartFlowState, action: StartFlowAction): StartFlowState {
  switch (action.type) {
    case 'forward': {
      if (!canGoForward(state)) return state;
      const currentIndex = STEP_ORDER.indexOf(state.currentStep);
      if (currentIndex < STEP_ORDER.length - 1) {
        return { ...state, currentStep: STEP_ORDER[currentIndex + 1] };
      }
      return state;
    }
    case 'back': {
      const currentIndex = STEP_ORDER.indexOf(state.currentStep);
      if (currentIndex > 0) {
        return { ...state, currentStep: STEP_ORDER[currentIndex - 1] };
      }
      return state;
    }
    case 'edit': {
      const targetIndex = STEP_ORDER.indexOf(action.step);
      const currentIndex = STEP_ORDER.indexOf(state.currentStep);
      if (targetIndex < currentIndex) {
        return { ...state, currentStep: action.step };
      }
      return state;
    }
    case 'setField': {
      const newState = { ...state, draft: { ...state.draft, [action.field]: action.value } };
      if (action.field === 'language') {
        const language = MeetingLanguageSchema.safeParse(action.value);
        if (!language.success) return state;
        newState.languageConfirmedThisMeeting = true;
        newState.draft.policy = { ...newState.draft.policy, language: language.data };
      }
      return newState;
    }
    case 'setSources': {
      // ensure unique
      const uniqueSources = Array.from(new Set(action.sources));
      return { ...state, draft: { ...state.draft, captureSources: uniqueSources } };
    }
    case 'setPolicy': {
      const newPolicy = { ...state.draft.policy, ...action.policy };

      // Normalize dependents
      if (newPolicy.final !== 'local_cloud_check') {
        newPolicy.cloudCheckScope = 'off';
      }

      if (
        newPolicy.live === 'cloud' ||
        newPolicy.final === 'cloud' ||
        newPolicy.cloudCheckScope !== 'off'
      ) {
        if (newPolicy.cloudConsent === 'not_required') {
          newPolicy.cloudConsent = 'required';
        }
      } else {
        newPolicy.cloudConsent = 'not_required';
      }

      if (!TranscriptionPolicyV1Schema.safeParse(newPolicy).success) {
        // If still invalid, reject
        return state;
      }

      return { ...state, draft: { ...state.draft, policy: newPolicy } };
    }
    case 'setReadiness': {
      return { ...state, readiness: action.readiness };
    }
    case 'grantConsent': {
      return { ...state, consent: [...state.consent, action.record] };
    }
    case 'reset': {
      return INITIAL_STATE;
    }
    case 'restore': {
      try {
        const persisted = action.persisted as unknown;
        if (
          persisted &&
          typeof persisted === 'object' &&
          'languageConfirmedThisMeeting' in persisted &&
          persisted.languageConfirmedThisMeeting === true
        ) {
          return INITIAL_STATE; // Corrupt -> reset
        }

        if (!persisted || typeof persisted !== 'object' || !('draft' in persisted)) {
          return INITIAL_STATE;
        }
        const draftParse = PersistedDraftSchema.safeParse(persisted.draft);
        if (!draftParse.success) return INITIAL_STATE;
        const draft = draftParse.data;
        if (draft.language !== null && draft.policy.language !== draft.language) {
          return INITIAL_STATE;
        }

        return {
          ...INITIAL_STATE,
          draft: {
            title: draft.title,
            language: draft.language,
            mode: draft.mode,
            captureSources: draft.captureSources,
            policy: draft.policy,
          },
        };
      } catch {
        return INITIAL_STATE;
      }
    }
    default:
      return state;
  }
}
