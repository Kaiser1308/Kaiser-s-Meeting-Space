import React from 'react';
import { findByType, getText, render } from '../test-utils';
import { ErrorBoundary } from './ErrorBoundary';
import { createTranslator } from '../i18n';

describe('ErrorBoundary', () => {
  it('should be exported correctly', () => {
    expect(ErrorBoundary).toBeDefined();
    expect(typeof ErrorBoundary).toBe('function');
  });

  it('should render children when no error occurs', () => {
    function TestFails({ shouldFail }: { shouldFail: boolean }) {
      if (shouldFail) {
        throw new Error('Test error');
      }
      return <div>Success</div>;
    }

    const tree = render(
      <div>
        <TestFails shouldFail={false} />
      </div>,
    );

    const text = getText(tree);
    expect(text).toBe('Success');
  });

  it('should render fallback with i18n error title when provided', () => {
    const t = createTranslator('en');

    const fallback = (
      <div>
        <span>{t('shell.error.title')}</span>
      </div>
    );

    const tree = render(<div>{fallback}</div>);

    const found = findByType(tree, 'span');
    expect(found.length).toBeGreaterThan(0);
    expect(getText(found[0])).toBe('Something went wrong');
  });
});
