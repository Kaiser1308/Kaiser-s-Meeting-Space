import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, findByProp, getText } from '../../../test-utils';
import { RecordingScreen } from './RecordingScreen';
import { INITIAL_RECORDING_STATE } from '../reducer/types';

describe('RecordingScreen', () => {
  it('renders the real local recording state and controls', () => {
    const tree = render(<RecordingScreen state={{ ...INITIAL_RECORDING_STATE, status: 'recording' }} error={null} onPause={() => {}} onResume={() => {}} onEnd={() => {}} onBack={() => {}} />);
    expect(getText(tree)).toContain('Recording in progress.');
    expect(getText(tree)).toContain('Microphone active');
    expect(findByProp(tree, 'testID', 'pause-recording-button')).toHaveLength(1);
    expect(findByProp(tree, 'testID', 'recording-screen')).toHaveLength(1);
  });
});
