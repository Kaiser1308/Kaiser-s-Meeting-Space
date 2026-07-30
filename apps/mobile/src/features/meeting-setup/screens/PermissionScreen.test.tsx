import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, findByProp, getText } from '../../../test-utils';
import { PermissionScreen } from './PermissionScreen';

describe('PermissionScreen', () => {
  it('explains that native permission verification is pending', () => {
    const tree = render(<PermissionScreen onBack={() => {}} onContinue={() => {}} />);
    expect(getText(tree)).toContain('Native permission check pending');
    expect(findByProp(tree, 'testID', 'permission-continue-button')).toHaveLength(1);
  });
});
