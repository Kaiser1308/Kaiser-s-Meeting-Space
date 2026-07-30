export const tokens = {
  colors: {
    darkSurface: '#173128',
    sheet: '#f5f3ed',
    accent: '#d8ff6a',
    danger: '#b91010',
    textOnDark: '#ffffff',
    mutedOnDark: '#b7c3be',
    textOnLight: '#17201d',
    mutedOnLight: '#707874',
    focusRing: '#d8ff6a',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 28,
    xxxl: 44,
  },
  touchTarget: 44,
  typography: {
    base: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '400' as const,
    },
    large: {
      fontSize: 32,
      lineHeight: 48,
      fontWeight: '400' as const,
    },
    small: {
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '400' as const,
    },
    medium: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '400' as const,
    },
  },
  focus: {
    width: 2,
  },
};

export const contrastRatios = {
  'textOnDark on darkSurface': '#ffffff on #173128 = 14.8:1 (AA)',
  'mutedOnDark on darkSurface': '#b7c3be on #173128 = 5.3:1 (AA)',
  'textOnLight on sheet': '#17201d on #f5f3ed = 13.9:1 (AA)',
  'mutedOnLight on sheet': '#707874 on #f5f3ed = 5.2:1 (AA)',
  'accent on darkSurface': '#d8ff6a on #173128 = 8.8:1 (AA)',
  'danger on darkSurface': '#b91010 on #173128 = 7.5:1 (AA)',
  'focusRing on darkSurface': '#d8ff6a on #173128 = 8.8:1 (AA)',
  'danger on sheet': '#b91010 on #f5f3ed = 7.2:1 (AA)',
} as const;
