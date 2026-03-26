import AsyncStorage from '@react-native-async-storage/async-storage';
import { authStorage } from './authStorage';
import { notificationService } from './notificationService';

const FAVORITES_KEY = 'football_favorites';
const listeners = new Set();

const getLocalMatchKey = (match) => String(
  match?._id ||
  match?.fixtureId ||
  match?.matchId ||
  match?.apiMatchId ||
  ''
);

const getFixtureId = (match) => {
  const fixtureId = Number(match?.fixtureId ?? match?.matchId ?? match?.apiMatchId);
  return Number.isInteger(fixtureId) ? fixtureId : null;
};

const notifyListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Erreur listener favoris:', error);
    }
  });
};

const syncFavoritesToBackend = async (favorites) => {
  const token = await authStorage.getToken();
  if (!token) {
    return;
  }

  const fixtureIds = [...new Set(
    (favorites || [])
      .map((match) => getFixtureId(match))
      .filter((fixtureId) => Number.isInteger(fixtureId))
  )];

  await notificationService.syncFavoriteNotifications(fixtureIds);
};

export const favoritesService = {
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getFavorites: async () => {
    try {
      const data = await AsyncStorage.getItem(FAVORITES_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Erreur getFavorites:', error);
      return [];
    }
  },

  isFavorite: async (matchId) => {
    try {
      const favorites = await favoritesService.getFavorites();
      return favorites.some((favorite) => getLocalMatchKey(favorite) === String(matchId));
    } catch (error) {
      console.error('Erreur isFavorite:', error);
      return false;
    }
  },

  toggleFavorite: async (match) => {
    try {
      const favorites = await favoritesService.getFavorites();
      const matchKey = getLocalMatchKey(match);
      const exists = favorites.some((favorite) => getLocalMatchKey(favorite) === matchKey);

      const updatedFavorites = exists
        ? favorites.filter((favorite) => getLocalMatchKey(favorite) !== matchKey)
        : [...favorites, match];

      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updatedFavorites));
      await syncFavoritesToBackend(updatedFavorites);
      notifyListeners();

      return {
        ok: true,
        isFavorite: !exists,
        favorites: updatedFavorites,
      };
    } catch (error) {
      console.error('Erreur toggleFavorite:', error);
      return {
        ok: false,
        isFavorite: false,
        favorites: [],
      };
    }
  },

  removeFavorite: async (matchId) => {
    try {
      const favorites = await favoritesService.getFavorites();
      const updatedFavorites = favorites.filter((favorite) => getLocalMatchKey(favorite) !== String(matchId));
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updatedFavorites));
      await syncFavoritesToBackend(updatedFavorites);
      notifyListeners();
      return { ok: true, favorites: updatedFavorites };
    } catch (error) {
      console.error('Erreur removeFavorite:', error);
      return { ok: false, favorites: [] };
    }
  },

  clearFavorites: async () => {
    try {
      await AsyncStorage.removeItem(FAVORITES_KEY);
      await syncFavoritesToBackend([]);
      notifyListeners();
      return { ok: true };
    } catch (error) {
      console.error('Erreur clearFavorites:', error);
      return { ok: false };
    }
  },

  syncWithServer: async () => {
    try {
      const favorites = await favoritesService.getFavorites();
      await syncFavoritesToBackend(favorites);
      return { ok: true, favorites };
    } catch (error) {
      console.error('Erreur syncWithServer:', error);
      return { ok: false, favorites: [] };
    }
  },
};
