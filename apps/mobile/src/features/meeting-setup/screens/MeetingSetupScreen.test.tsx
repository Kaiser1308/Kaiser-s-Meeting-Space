import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, findByProp, getText } from '../../../test-utils';
import { MeetingSetupScreen } from './MeetingSetupScreen';
import type { MeetingDraft } from './meeting-flow';

const draft: MeetingDraft = { title: 'Weekly sync', mode: 'record', sourceLanguage: 'vi', targetLanguage: 'en' };

describe('MeetingSetupScreen', () => {
  it('renders title input, mode controls, and continue action', () => {
    const tree = render(<MeetingSetupScreen draft={draft} onChange={() => {}} onContinue={() => {}} onBack={() => {}} />);
    expect(getText(tree)).toContain('Name this meeting.');
    expect(findByProp(tree, 'testID', 'meeting-title-input')).toHaveLength(1);
    expect(findByProp(tree, 'testID', 'meeting-continue-button')).toHaveLength(1);
  });
});
