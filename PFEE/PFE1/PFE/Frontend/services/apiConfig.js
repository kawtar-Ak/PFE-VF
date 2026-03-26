import { Platform } from 'react-native';
import Constants from 'expo-constants';

const EXPLICIT_API_BASE_URL = String(process.env.EXPO_PUBLIC_API_BASE_URL || '').trim();
const EXPLICIT_API_HOST = String(process.env.EXPO_PUBLIC_API_HOST || '').trim();

const getHostFromExpo = () => {
  const hostUri =
    Constants?.expoConfig?.hostUri ||
    Constants?.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants?.manifest?.debuggerHost;

  if (!hostUri) {
    return null;
  }

  return String(hostUri).split(':')[0] || null;
};

export const getApiHost = () => {
  if (EXPLICIT_API_HOST) {
    return EXPLICIT_API_HOST;
  }

  const expoHost = getHostFromExpo();

  if (Platform.OS === 'android') {
    // Sur appareil physique Android, l'IP Expo est generalement la bonne cible.
    return expoHost || '10.0.2.2';
  }

  if (Platform.OS === 'web') {
    return 'localhost';
  }

  return expoHost || 'localhost';
};

export const API_HOST = getApiHost();
export const API_BASE_URL = EXPLICIT_API_BASE_URL
  ? EXPLICIT_API_BASE_URL.replace(/\/+$/, '')
  : `http://${API_HOST}:3000`;
