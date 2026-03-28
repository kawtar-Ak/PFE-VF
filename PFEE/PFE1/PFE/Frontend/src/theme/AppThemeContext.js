import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { APP_THEME_COLORS } from './colors';
import { getFootballPalette } from './footballDark';

const STORAGE_KEY = 'kickly_theme_mode';
const AppThemeContext = createContext(null);

const buildNavigationTheme = (mode) => {
  const isLight = mode === 'light';
  const palette = isLight ? APP_THEME_COLORS.light : APP_THEME_COLORS.dark;
  const base = isLight ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.card,
      text: palette.text,
      border: palette.border,
      notification: palette.notification,
    },
  };
};

export function AppThemeProvider({ children }) {
  const [mode, setMode] = useState('dark');

  useEffect(() => {
    let mounted = true;

    const loadStoredTheme = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (mounted && (stored === 'dark' || stored === 'light')) {
          setMode(stored);
        }
      } catch (error) {
        console.warn('[theme] load failed:', error?.message || error);
      }
    };

    loadStoredTheme();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleTheme = useCallback(async () => {
    const nextMode = mode === 'dark' ? 'light' : 'dark';
    setMode(nextMode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, nextMode);
    } catch (error) {
      console.warn('[theme] save failed:', error?.message || error);
    }
  }, [mode]);

  const value = useMemo(() => ({
    mode,
    isDark: mode === 'dark',
    isLight: mode === 'light',
    palette: getFootballPalette(mode),
    navigationTheme: buildNavigationTheme(mode),
    toggleTheme,
  }), [mode, toggleTheme]);

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}

export const useAppTheme = () => {
  const ctx = useContext(AppThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }
  return ctx;
};
