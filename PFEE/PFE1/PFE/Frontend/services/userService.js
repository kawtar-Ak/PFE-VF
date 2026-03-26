import { API_BASE_URL } from './apiConfig';
import { authStorage } from './authStorage';

const API_URL = `${API_BASE_URL}/api/user`;

const authFetchJson = async (path, options = {}) => {
  const token = await authStorage.getToken();
  if (!token) {
    throw new Error('Session utilisateur absente.');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
  }

  return payload;
};

export const userService = {
  getCurrentUserProfile: async () => {
    const data = await authFetchJson('/me');
    if (data?.user) {
      await authStorage.updateUser(data.user);
    }
    return data?.user || null;
  },

  updateNotificationSettings: async (settings) => {
    const data = await authFetchJson('/me/notifications', {
      method: 'PUT',
      body: JSON.stringify(settings || {}),
    });

    if (data?.user) {
      await authStorage.updateUser(data.user);
    }

    return data;
  },

  registerDeviceToken: async ({ token, platform, deviceName }) => authFetchJson('/me/device-token', {
    method: 'POST',
    body: JSON.stringify({ token, platform, deviceName }),
  }),

  deactivateDeviceToken: async (token) => authFetchJson('/me/device-token', {
    method: 'DELETE',
    body: JSON.stringify({ token }),
  }),

  syncFavoriteFixtureIds: async (fixtureIds) => authFetchJson('/me/favorites/sync', {
    method: 'PUT',
    body: JSON.stringify({ fixtureIds }),
  }),

  addFavoriteFixture: async (fixtureId) => authFetchJson('/me/favorites', {
    method: 'POST',
    body: JSON.stringify({ fixtureId }),
  }),

  removeFavoriteFixture: async (fixtureId) => authFetchJson(`/me/favorites/${fixtureId}`, {
    method: 'DELETE',
  }),
};
