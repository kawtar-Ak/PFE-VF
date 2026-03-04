import { Platform } from 'react-native';
import { io } from 'socket.io-client';

const API_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const API_URL = `http://${API_HOST}:3000/api/match`;
const SOCKET_URL = `http://${API_HOST}:3000`;

export const matchService = {
  getAllMatches: async () => {
    try {
      const response = await fetch(`${API_URL}/`);
      const data = await response.json();
      return data.matches || [];
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  },

  getMatchesByLeague: async (league) => {
    try {
      const response = await fetch(`${API_URL}/league/${league}`);
      const data = await response.json();
      return data.matches || [];
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  },

  getLiveMatches: async () => {
    try {
      const response = await fetch(`${API_URL}/live`);
      const data = await response.json();
      return data.matches || [];
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  },

  getMatchesByDate: async (date) => {
    try {
      const response = await fetch(`${API_URL}/by-date?date=${encodeURIComponent(date)}`);
      const data = await response.json();
      return data.matches || [];
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  },

  getMatchById: async (matchId) => {
    try {
      const response = await fetch(`${API_URL}/${matchId}`);
      const data = await response.json();
      return data.match || null;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  },

  getMatchEvents: async (matchId) => {
    try {
      const response = await fetch(`${API_URL}/${matchId}/events`);
      const data = await response.json();
      return data.events || [];
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  },

  getMatchStatistics: async (matchId) => {
    try {
      const response = await fetch(`${API_URL}/${matchId}/statistics`);
      const data = await response.json();
      return data.statistics || [];
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  },

  getMatchLineups: async (matchId) => {
    try {
      const response = await fetch(`${API_URL}/${matchId}/lineups`);
      const data = await response.json();
      return data.lineups || [];
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  },

  getSupportedLeagues: async () => {
    try {
      const response = await fetch(`${API_URL}/import/leagues`);
      const data = await response.json();
      return data.leagues || [];
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  },

  importAllMatches: async () => {
    try {
      const response = await fetch(`${API_URL}/import/all`, { method: 'POST' });
      return await response.json();
    } catch (error) {
      console.error('Error:', error);
      return { success: false, message: error.message };
    }
  },

  importLeague: async (leagueCode) => {
    try {
      const response = await fetch(`${API_URL}/import/${leagueCode}`, { method: 'POST' });
      return await response.json();
    } catch (error) {
      console.error('Error:', error);
      return { success: false, message: error.message };
    }
  },

  createSocketConnection: () => io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  }),

  mergeMatchIntoList: (matches, incomingMatch) => {
    if (!incomingMatch?.matchId && !incomingMatch?.apiMatchId && !incomingMatch?._id) {
      return matches;
    }

    const matchIndex = matches.findIndex((match) => (
      (incomingMatch._id && match._id === incomingMatch._id) ||
      (incomingMatch.matchId && match.matchId === incomingMatch.matchId) ||
      (incomingMatch.apiMatchId && match.apiMatchId === incomingMatch.apiMatchId)
    ));

    if (matchIndex === -1) {
      return [incomingMatch, ...matches].sort((left, right) => new Date(left.date) - new Date(right.date));
    }

    const nextMatches = [...matches];
    nextMatches[matchIndex] = {
      ...nextMatches[matchIndex],
      ...incomingMatch,
    };

    return nextMatches.sort((left, right) => new Date(left.date) - new Date(right.date));
  }
};
