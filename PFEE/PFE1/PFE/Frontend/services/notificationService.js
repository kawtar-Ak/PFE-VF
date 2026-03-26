import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { authStorage } from './authStorage';
import { userService } from './userService';

const STORAGE_KEY = 'kickly_push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const getProjectId = () => (
  Constants?.easConfig?.projectId ||
  Constants?.expoConfig?.extra?.eas?.projectId ||
  null
);

const getStoredPushToken = async () => AsyncStorage.getItem(STORAGE_KEY);

const setStoredPushToken = async (token) => {
  if (!token) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, token);
};

const requestPermissions = async () => {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') {
    return existing;
  }
  return Notifications.requestPermissionsAsync();
};

const registerNativePushToken = async () => {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'web_not_supported' };
  }

  if (!Device.isDevice) {
    return { ok: false, reason: 'physical_device_required' };
  }

  const permissions = await requestPermissions();
  if (permissions.status !== 'granted') {
    return { ok: false, reason: 'permission_denied' };
  }

  const projectId = getProjectId();
  if (!projectId) {
    return { ok: false, reason: 'project_id_missing' };
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResponse?.data || null;
  if (!token) {
    return { ok: false, reason: 'token_unavailable' };
  }

  return { ok: true, token };
};

export const notificationService = {
  bootstrapForAuthenticatedUser: async ({ forcePermissionPrompt = false } = {}) => {
    const token = await authStorage.getToken();
    if (!token) {
      return { ok: false, reason: 'not_logged_in' };
    }

    if (!forcePermissionPrompt) {
      const settings = await Notifications.getPermissionsAsync().catch(() => null);
      if (settings?.status && settings.status !== 'granted' && Platform.OS !== 'web') {
        return { ok: false, reason: 'permission_not_granted' };
      }
    }

    const registration = await registerNativePushToken();
    if (!registration.ok) {
      return registration;
    }

    try {
      await setStoredPushToken(registration.token);
      await userService.registerDeviceToken({
        token: registration.token,
        platform: Platform.OS,
        deviceName: Device.deviceName || null,
      });

      return registration;
    } catch (error) {
      console.warn('Enregistrement backend du token impossible:', error?.message || error);
      return { ok: false, reason: 'backend_registration_failed' };
    }
  },

  unregisterCurrentDevice: async () => {
    const token = await getStoredPushToken();
    if (!token) {
      return { ok: true };
    }

    try {
      await userService.deactivateDeviceToken(token);
    } catch (error) {
      console.warn('Desactivation token notification impossible:', error?.message || error);
    } finally {
      await setStoredPushToken(null);
    }

    return { ok: true };
  },

  syncFavoriteNotifications: async (fixtureIds) => {
    const token = await authStorage.getToken();
    if (!token) {
      return { ok: false, reason: 'not_logged_in' };
    }

    try {
      await userService.syncFavoriteFixtureIds(fixtureIds);
      return { ok: true };
    } catch (error) {
      console.warn('Synchronisation favoris notifications impossible:', error?.message || error);
      return { ok: false, reason: 'sync_failed' };
    }
  },
};
