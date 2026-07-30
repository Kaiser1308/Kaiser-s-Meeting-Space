import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, findByProp, getText } from '../../../test-utils';
import { ReadinessScreen } from './ReadinessScreen';

describe('ReadinessScreen', () => {
  it('shows native capture as unavailable without claiming readiness', () => {
    const tree = render(<ReadinessScreen onBack={() => {}} onStart={() => {}} nativeAvailable={false} />);
    expect(getText(tree)).toContain('Native capture is unavailable');
    expect(findByProp(tree, 'testID', 'readiness-back-button')).toHaveLength(1);
  });
});
