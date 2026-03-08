export const BRAND_COLORS = {
  first: '#e4f1fe',
  second: '#8dc6ff',
  third: '#22313f',
  fourth: '#34495e',
  accent: '#f05d23',
};

export const APP_THEME_COLORS = {
  light: {
    primary: BRAND_COLORS.accent,
    background: BRAND_COLORS.first,
    card: '#ffffff',
    text: BRAND_COLORS.third,
    border: '#c9dced',
    notification: BRAND_COLORS.accent,
    muted: BRAND_COLORS.fourth,
  },
  dark: {
    primary: BRAND_COLORS.accent,
    background: BRAND_COLORS.third,
    card: BRAND_COLORS.fourth,
    text: '#f5f9ff',
    border: '#425a72',
    notification: BRAND_COLORS.accent,
    muted: '#9fb8d1',
  },
};
