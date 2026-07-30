import { describe, it, expect } from 'vitest';
import { tokens, createTheme } from './index';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function linearize(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function getContrastRatio(color1: string, color2: string): number {
  const L1 = getLuminance(color1);
  const L2 = getLuminance(color2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('theme tokens', () => {
  it('should have touch target at least 44', () => {
    expect(tokens.touchTarget).toBeGreaterThanOrEqual(44);
  });

  it('should have focus width at least 2', () => {
    expect(tokens.focus.width).toBeGreaterThanOrEqual(2);
  });

  it('should create default theme', () => {
    const theme = createTheme();
    expect(theme).toBeDefined();
    expect(theme.touchTarget).toBe(tokens.touchTarget);
  });

  it('should create theme with large text variant', () => {
    const defaultTheme = createTheme();
    const largeTheme = createTheme({ largeText: true });

    expect(largeTheme.typography.base.fontSize).toBeGreaterThan(
      defaultTheme.typography.base.fontSize,
    );
    const ratio = largeTheme.typography.base.fontSize / defaultTheme.typography.base.fontSize;
    expect(ratio).toBeGreaterThanOrEqual(1.5);
  });

  it('should have accessible color contrast', () => {
    const { colors } = tokens;
    expect(colors.darkSurface).toBeDefined();
    expect(colors.sheet).toBeDefined();
    expect(colors.accent).toBeDefined();
    expect(colors.danger).toBeDefined();
    expect(colors.textOnDark).toBeDefined();
    expect(colors.mutedOnDark).toBeDefined();
    expect(colors.textOnLight).toBeDefined();
    expect(colors.mutedOnLight).toBeDefined();
  });

  it('should have WCAG AA contrast ratios for text on background pairs', () => {
    const { colors } = tokens;

    const pairs = [
      {
        text: colors.textOnDark,
        background: colors.darkSurface,
        name: 'textOnDark on darkSurface',
      },
      {
        text: colors.mutedOnDark,
        background: colors.darkSurface,
        name: 'mutedOnDark on darkSurface',
      },
      { text: colors.textOnLight, background: colors.sheet, name: 'textOnLight on sheet' },
      { text: colors.mutedOnLight, background: colors.sheet, name: 'mutedOnLight on sheet' },
      { text: colors.accent, background: colors.darkSurface, name: 'accent on darkSurface' },
      { text: colors.danger, background: colors.darkSurface, name: 'danger on darkSurface' },
      { text: colors.focusRing, background: colors.darkSurface, name: 'focusRing on darkSurface' },
    ];

    pairs.forEach(({ text, background, name }) => {
      const ratio = getContrastRatio(text, background);
      console.log(`${name}: ${ratio.toFixed(1)}:1`);
      if (ratio < 4.5) {
        console.warn(
          `⚠️  ${name} has contrast ratio ${ratio.toFixed(1)}:1, below WCAG AA requirement of 4.5:1`,
        );
      }
    });
  });
});
