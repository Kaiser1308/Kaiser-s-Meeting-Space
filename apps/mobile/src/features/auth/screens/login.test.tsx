import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, press, findByType, getText } from '../../../test-utils';
import { LoginScreen } from './login';

describe('LoginScreen', () => {
  it('renders login button with correct text', () => {
    const onLogin = () => {};
    const node = render(<LoginScreen onLogin={onLogin} loading={false} />);

    const buttons = findByType(node, 'Pressable');
    expect(buttons.length).toBe(1);

    const buttonText = getText(buttons[0]);
    expect(buttonText).toBe('Log in');
  });

  it('calls onLogin when button is pressed', () => {
    let called = false;
    const onLogin = () => {
      called = true;
    };
    const node = render(<LoginScreen onLogin={onLogin} loading={false} />);

    const buttons = findByType(node, 'Pressable');
    press(buttons[0]);

    expect(called).toBe(true);
  });

  it('shows loading text when loading', () => {
    const onLogin = () => {};
    const node = render(<LoginScreen onLogin={onLogin} loading={true} />);

    const buttons = findByType(node, 'Pressable');
    const buttonText = getText(buttons[0]);
    expect(buttonText).toBe('Loading...');
    expect(buttons[0].props.accessibilityState).toEqual({ disabled: true, busy: true });
  });

  it('disables button when loading', () => {
    const onLogin = () => {};
    const node = render(<LoginScreen onLogin={onLogin} loading={true} />);

    const buttons = findByType(node, 'Pressable');
    expect(buttons[0].props.disabled).toBe(true);
  });

  it('enables button when not loading', () => {
    const onLogin = () => {};
    const node = render(<LoginScreen onLogin={onLogin} loading={false} />);

    const buttons = findByType(node, 'Pressable');
    expect(buttons[0].props.disabled).toBe(false);
  });

  it('does not call onLogin when disabled', () => {
    let called = false;
    const onLogin = () => {
      called = true;
    };
    const node = render(<LoginScreen onLogin={onLogin} loading={true} />);

    const buttons = findByType(node, 'Pressable');
    press(buttons[0]);

    expect(called).toBe(false);
  });
});
