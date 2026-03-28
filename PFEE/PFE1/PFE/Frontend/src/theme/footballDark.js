export const FOOTBALL_DARK = {
  bg: '#08100b',
  panel: '#101a13',
  panelAlt: '#1a281d',
  panelSoft: '#223428',
  border: '#243428',
  text: '#f5f8f2',
  muted: '#91a38f',
  accent: '#c8ff36',
  accentDark: '#0f1607',
  live: '#ff453a',
  success: '#36d17c',
  white: '#ffffff',
  dangerSoft: 'rgba(255, 69, 58, 0.08)',
};

export const FOOTBALL_LIGHT = {
  bg: '#edf2f7',
  panel: '#ffffff',
  panelAlt: '#f8fbff',
  panelSoft: '#dde7f2',
  border: '#d9e3ee',
  text: '#13233f',
  muted: '#70829d',
  accent: '#2f9fe8',
  accentDark: '#ffffff',
  live: '#ff5f57',
  success: '#27b07d',
  white: '#ffffff',
  dangerSoft: 'rgba(255, 95, 87, 0.10)',
};

export const getFootballPalette = (mode = 'dark') =>
  mode === 'light' ? FOOTBALL_LIGHT : FOOTBALL_DARK;
