import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, getText, findByProp, findByType } from '../../../test-utils';
import { HomeScreen } from './HomeScreen';

describe('HomeScreen', () => {
  it('shows the main meeting setup regions', () => {
    const tree = render(<HomeScreen />);
    const text = getText(tree);

    expect(text).toContain("KAISER'S MEETING SPACE");
    expect(text).toContain('Record');
    expect(text).toContain('Translate');
    expect(text).toContain('Complete by default');
    expect(text).toContain('Set up meeting');
    expect(text).toContain('Native capture is not ready');
    expect(findByProp(tree, 'testID', 'home-screen')).toHaveLength(1);
  });

  it('keeps Start meeting disabled until native capture is verified', () => {
    const tree = render(<HomeScreen />);
    const start = findByProp(tree, 'testID', 'start-meeting-button')[0];

    expect(start.props.disabled).toBe(true);
    expect(start.props.accessibilityState).toEqual({ disabled: true });
    expect(findByType(tree, 'TouchableOpacity')).toHaveLength(4);
  });

  it('offers setup without pretending native capture is ready', () => {
    const tree = render(<HomeScreen onStart={() => {}} />);
    const setup = findByProp(tree, 'testID', 'setup-meeting-button')[0];

    expect(getText(setup)).toBe('Set up meeting');
    expect(setup.props.disabled).toBe(false);
  });
});
