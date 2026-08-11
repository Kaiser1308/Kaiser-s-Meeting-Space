import { describe, expect, it } from 'vitest';
import { renderJson, renderMarkdown, renderText } from './renderers.js';
const input = {
  title: 'Synthetic',
  locale: 'vi' as const,
  sections: [{ heading: 'Discussion', content: 'Safe content' }],
};
describe('deterministic simple exporters', () => {
  it('renders markdown/text/json with stable semantics', () => {
    expect(renderMarkdown(input).body).toContain('# Synthetic');
    expect(renderText(input).body).toContain('Safe content');
    expect(JSON.parse(renderJson(input).body)).toEqual(input);
  });
});
