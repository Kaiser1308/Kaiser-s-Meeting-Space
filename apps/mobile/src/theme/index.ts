import { tokens } from './tokens';

export { tokens };

export interface Theme {
  colors: typeof tokens.colors;
  spacing: typeof tokens.spacing;
  touchTarget: number;
  typography: {
    base: { fontSize: number; lineHeight: number; fontWeight: string };
    large: { fontSize: number; lineHeight: number; fontWeight: string };
    small: { fontSize: number; lineHeight: number; fontWeight: string };
    medium: { fontSize: number; lineHeight: number; fontWeight: string };
  };
  focus: {
    width: number;
  };
}

export function createTheme({ largeText = false }: { largeText?: boolean } = {}): Theme {
  if (largeText) {
    return {
      ...tokens,
      typography: {
        base: {
          fontSize: 32,
          lineHeight: 48,
          fontWeight: '400',
        },
        large: {
          fontSize: 48,
          lineHeight: 64,
          fontWeight: '400',
        },
        small: {
          fontSize: 24,
          lineHeight: 36,
          fontWeight: '400',
        },
        medium: {
          fontSize: 28,
          lineHeight: 40,
          fontWeight: '400',
        },
      },
    };
  }
  return tokens;
}
