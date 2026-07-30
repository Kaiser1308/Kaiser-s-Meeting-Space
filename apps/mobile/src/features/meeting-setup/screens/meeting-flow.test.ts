import { describe, expect, it } from 'vitest';
import { validateMeetingDraft, type MeetingDraft } from './meeting-flow';

const baseDraft: MeetingDraft = {
  title: 'Weekly sync',
  mode: 'record',
  sourceLanguage: 'vi',
  targetLanguage: 'en',
};

describe('validateMeetingDraft', () => {
  it('rejects a blank meeting title', () => {
    expect(validateMeetingDraft({ ...baseDraft, title: '  ' })).toEqual({
      valid: false,
      error: 'Meeting title is required.',
    });
  });

  it('rejects translate mode when both languages are the same', () => {
    expect(validateMeetingDraft({ ...baseDraft, mode: 'translate', targetLanguage: 'vi' })).toEqual({
      valid: false,
      error: 'Choose two different languages for translation.',
    });
  });

  it('accepts a titled record meeting', () => {
    expect(validateMeetingDraft(baseDraft)).toEqual({ valid: true });
  });
});
