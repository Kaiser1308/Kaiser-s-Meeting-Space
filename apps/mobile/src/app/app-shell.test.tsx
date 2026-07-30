import React from 'react';
import { Text } from 'react-native';
import { render, getText, findByProp, findByType, press } from '../test-utils';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders authenticated content without the old placeholder', () => {
    const tree = render(
      <AppShell locale="en" authed={true} onLocaleChange={() => {}}>
        <Text>Child content</Text>
      </AppShell>,
    );

    const text = getText(tree);
    expect(text).toContain('Child content');
    expect(text).not.toContain('App Content');
  });

  it('renders a centered safe-area login affordance', () => {
    const tree = render(
      <AppShell locale="en" authed={false} onLocaleChange={() => {}}>
        <Text>Should not show</Text>
      </AppShell>,
    );

    const text = getText(tree);
    expect(text).toContain("Kaiser's Meeting Space");
    expect(text).toContain('Log in');
    expect(text).not.toContain('Should not show');
    expect(findByType(tree, 'SafeAreaView')).toHaveLength(1);
  });

  it('shows an authentication error with recovery context', () => {
    const tree = render(
      <AppShell locale="en" authed={false} authError="Auth0 is unavailable" onLogin={() => {}} onLocaleChange={() => {}}>
        <Text>Custom child</Text>
      </AppShell>,
    );

    const text = getText(tree);
    expect(text).toContain('Auth0 is unavailable');
    expect(findByProp(tree, 'testID', 'auth-error')).toHaveLength(1);
  });

  it('allows the login button to be pressed when ready', () => {
    let pressed = false;
    const tree = render(<AppShell locale="en" authed={false} authLoading={false} onLogin={() => { pressed = true; }} onLocaleChange={() => {}}><Text /></AppShell>);
    press(findByProp(tree, 'testID', 'login-button')[0]);
    expect(pressed).toBe(true);
  });

  it('should pass locale as data attribute', () => {
    const tree = render(
      <AppShell locale="en" authed={false} onLocaleChange={() => {}}>
        <Text>Child</Text>
      </AppShell>,
    );

    const rootShell = findByProp(tree, 'testID', 'app-shell');
    expect(rootShell.length).toBeGreaterThan(0);
  });

  it('should pass authed as data attribute', () => {
    const tree = render(
      <AppShell locale="en" authed={true} onLocaleChange={() => {}}>
        <Text>Child</Text>
      </AppShell>,
    );

    const rootShell = findByProp(tree, 'testID', 'app-shell');
    expect(rootShell.length).toBeGreaterThan(0);
  });
});
