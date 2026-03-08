import { Platform } from 'react-native';
import Constants from 'expo-constants';

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
export const API_BASE_URL = `http://${API_HOST}:3000`;
