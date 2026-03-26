import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'userToken';
const USER_KEY = 'userData';

export const authStorage = {
  getToken: async () => AsyncStorage.getItem(TOKEN_KEY),

  getUser: async () => {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  setSession: async (token, user) => {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  updateUser: async (updater) => {
    const currentUser = await authStorage.getUser();
    const nextUser = typeof updater === 'function'
      ? updater(currentUser)
      : { ...(currentUser || {}), ...(updater || {}) };

    await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    return nextUser;
  },

  clearSession: async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  },
};
