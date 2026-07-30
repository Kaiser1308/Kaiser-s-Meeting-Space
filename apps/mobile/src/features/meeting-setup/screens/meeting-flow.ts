export type MeetingMode = 'record' | 'translate';

export interface MeetingDraft {
  title: string;
  mode: MeetingMode;
  sourceLanguage: 'vi' | 'en';
  targetLanguage: 'vi' | 'en';
}

export interface MeetingDraftValidation {
  valid: boolean;
  error?: string;
}

export function validateMeetingDraft(draft: MeetingDraft): MeetingDraftValidation {
  if (!draft.title.trim()) return { valid: false, error: 'Meeting title is required.' };
  if (draft.mode === 'translate' && draft.sourceLanguage === draft.targetLanguage) {
    return { valid: false, error: 'Choose two different languages for translation.' };
  }
  return { valid: true };
}
