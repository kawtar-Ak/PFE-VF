import { io } from 'socket.io-client';
import { API_BASE_URL } from './apiConfig';

const API_URL = `${API_BASE_URL}/api/match`;
const SOCKET_URL = API_BASE_URL;
const loggedErrors = new Set();

const readJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
};

const fetchJson = async (url, options, scope) => {
  try {
    const response = await fetch(url, options);
    const payload = await readJsonSafely(response);

    if (!response.ok) {
      const message =
        payload?.error ||
        payload?.message ||
        `HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload || {};
  } catch (error) {
    logRequestError(scope, error);
    throw error;
  }
};

const getFriendlyMatchError = (error) => {
  const message = String(error?.message || '').trim();
  const lowered = message.toLowerCase();

  if (
    !message ||
    lowered.includes('network request failed') ||
    lowered.includes('failed to fetch') ||
    lowered.includes('load failed')
  ) {
    return 'Backend des matchs indisponible. Verifie le serveur sur le port 3000 et, si besoin, configure EXPO_PUBLIC_API_BASE_URL.';
  }

  return `Impossible de charger les matchs: ${message}`;
};

const normalizeLineupPlayers = (players) => {
  if (!Array.isArray(players)) return [];

  return players.map((entry) => {
    const player = entry?.player || entry || {};
    return {
      id: player?.id ?? null,
      name: player?.name || null,
      number: player?.number ?? null,
      position: player?.position || player?.pos || null,
      grid: player?.grid || null,
    };
  });
};

const normalizeLineupsPayload = (payload) => {
  const lineups = Array.isArray(payload?.lineups)
    ? payload.lineups
    : Array.isArray(payload?.response)
      ? payload.response
      : [];

  return lineups.map((lineup) => ({
    team: {
      id: lineup?.team?.id ?? null,
      name: lineup?.team?.name || null,
      logo: lineup?.team?.logo || null,
      colors: lineup?.team?.colors || null,
    },
    formation: lineup?.formation || null,
    coach: {
      id: lineup?.coach?.id ?? null,
      name: lineup?.coach?.name || null,
      photo: lineup?.coach?.photo || null,
    },
    startingXI: normalizeLineupPlayers(lineup?.startingXI || lineup?.startXI),
    substitutes: normalizeLineupPlayers(lineup?.substitutes || lineup?.bench),
  }));
};

const logRequestError = (scope, error) => {
  const message = String(error?.message || error || 'unknown error');
  const dedupeKey = `${scope}:${message}`;

  if (message.toLowerCase().includes('network request failed')) {
    if (loggedErrors.has(dedupeKey)) {
      return;
    }
    loggedErrors.add(dedupeKey);
    console.warn(`[network] ${scope}: ${message}`);
    return;
  }

  console.error(`[${scope}]`, error);
};

export const matchService = {
  getAllMatchesState: async () => {
    try {
      const data = await fetchJson(`${API_URL}/`, undefined, 'getAllMatches');
      return {
        matches: Array.isArray(data?.matches) ? data.matches : [],
        error: '',
      };
    } catch (error) {
      return {
        matches: [],
        error: getFriendlyMatchError(error),
      };
    }
  },

  getAllMatches: async () => {
    const { matches } = await matchService.getAllMatchesState();
    return matches;
  },

  getMatchesByLeague: async (league) => {
    try {
      const response = await fetch(`${API_URL}/league/${encodeURIComponent(league)}`);
      const data = await response.json();
      return data.matches || [];
    } catch (error) {
      logRequestError('getMatchesByLeague', error);
      return [];
    }
  },

  getLeagueStandings: async (leagueId, season, leagueName) => {
    try {
      if (!leagueId && !leagueName) {
        return [];
      }

      const params = new URLSearchParams();
      if (leagueId) {
        params.set('leagueId', String(leagueId));
      } else if (leagueName) {
        params.set('league', String(leagueName));
      }
      if (season) {
        params.set('season', String(season));
      }

      const response = await fetch(`${API_URL}/standings?${params.toString()}`);
      const data = await response.json();
      return data.standings || [];
    } catch (error) {
      logRequestError('getLeagueStandings', error);
      return [];
    }
  },

  getLiveMatches: async () => {
    try {
      const response = await fetch(`${API_URL}/live`);
      const data = await response.json();
      return data.matches || [];
    } catch (error) {
      logRequestError('getLiveMatches', error);
      return [];
    }
  },

  getMatchesByDate: async (date) => {
    try {
      const response = await fetch(`${API_URL}/by-date?date=${encodeURIComponent(date)}`);
      const data = await response.json();
      return data.matches || [];
    } catch (error) {
      logRequestError('getMatchesByDate', error);
      return [];
    }
  },

  getMatchById: async (matchId) => {
    try {
      const response = await fetch(`${API_URL}/${matchId}`);
      const data = await response.json();
      return data.match || null;
    } catch (error) {
      logRequestError('getMatchById', error);
      return null;
    }
  },

  getMatchEvents: async (matchId) => {
    try {
      const response = await fetch(`${API_URL}/${matchId}/events`);
      const data = await response.json();
      return data.events || [];
    } catch (error) {
      logRequestError('getMatchEvents', error);
      return [];
    }
  },

  getMatchStatistics: async (matchId) => {
    try {
      const response = await fetch(`${API_URL}/${matchId}/statistics`);
      const data = await response.json();
      return data.statistics || [];
    } catch (error) {
      logRequestError('getMatchStatistics', error);
      return [];
    }
  },

  getMatchLineups: async (matchId) => {
    try {
      const response = await fetch(`${API_URL}/${matchId}/lineups`);
      const data = await response.json();
      return normalizeLineupsPayload(data);
    } catch (error) {
      logRequestError('getMatchLineups', error);
      return [];
    }
  },

  getSupportedLeagues: async () => {
    try {
      const response = await fetch(`${API_URL}/import/leagues`);
      const data = await response.json();
      return data.leagues || [];
    } catch (error) {
      logRequestError('getSupportedLeagues', error);
      return [];
    }
  },

  importAllMatches: async () => {
    try {
      const response = await fetch(`${API_URL}/import/all`, { method: 'POST' });
      return await response.json();
    } catch (error) {
      logRequestError('importAllMatches', error);
      return { success: false, message: error.message };
    }
  },

  importLeague: async (leagueCode) => {
    try {
      const response = await fetch(`${API_URL}/import/${leagueCode}`, { method: 'POST' });
      return await response.json();
    } catch (error) {
      logRequestError('importLeague', error);
      return { success: false, message: error.message };
    }
  },

  importMatchDetails: async (matchId) => {
    try {
      const response = await fetch(`${API_URL}/${matchId}/import/details`, { method: 'POST' });
      return await response.json();
    } catch (error) {
      logRequestError('importMatchDetails', error);
      return { success: false, message: error.message };
    }
  },

  getProviderStatus: async () => {
    try {
      const response = await fetch(`${API_URL}/provider/status`);
      return await response.json();
    } catch (error) {
      logRequestError('getProviderStatus', error);
      return { provider: 'api-sports', blocked: false, blockedUntil: null, lastError: null };
    }
  },

  createSocketConnection: () => io(SOCKET_URL, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1200,
    reconnectionDelayMax: 8000,
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
