import { io } from 'socket.io-client';
import { API_BASE_URL } from './apiConfig';

const API_URL = `${API_BASE_URL}/api/match`;
const SOCKET_URL = API_BASE_URL;
const loggedErrors = new Set();

const readJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
};

const normalizeMatchEvents = (events) => {
  if (!Array.isArray(events)) return [];

  return events.map((event) => ({
    id: event?.id || event?.eventId || `${event?.minute || 0}-${event?.teamId || event?.team?.id || 0}-${event?.playerId || event?.player?.id || 0}-${event?.type || 'event'}`,
    minute: event?.minute ?? null,
    extraMinute: event?.extraMinute ?? null,
    team: {
      id: event?.team?.id ?? event?.teamId ?? null,
      name: event?.team?.name || event?.teamName || null,
      logo: event?.team?.logo || null,
    },
    player: {
      id: event?.player?.id ?? event?.playerId ?? null,
      name: event?.player?.name || event?.playerName || null,
    },
    assist: {
      id: event?.assist?.id ?? event?.assistId ?? null,
      name: event?.assist?.name || event?.assistName || null,
    },
    type: event?.type || null,
    detail: event?.detail || null,
    comments: event?.comments || null,
  }));
};

const normalizeStatisticsPayload = (statistics) => {
  if (!Array.isArray(statistics)) return [];

  return statistics.map((teamStats) => ({
    team: {
      id: teamStats?.team?.id ?? null,
      name: teamStats?.team?.name || null,
      logo: teamStats?.team?.logo || null,
    },
    statistics: Array.isArray(teamStats?.statistics)
      ? teamStats.statistics.map((stat) => ({
          type: stat?.type || null,
          value: stat?.value ?? null,
        }))
      : [],
  }));
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

const normalizePlayerStatsPayload = (payload) => {
  const teams = Array.isArray(payload?.players)
    ? payload.players
    : Array.isArray(payload?.response)
      ? payload.response
      : [];

  return teams.map((teamEntry) => ({
    team: {
      id: teamEntry?.team?.id ?? null,
      name: teamEntry?.team?.name || null,
      logo: teamEntry?.team?.logo || null,
      colors: teamEntry?.team?.colors || null,
    },
    players: Array.isArray(teamEntry?.players)
      ? teamEntry.players.map((entry) => ({
          player: {
            id: entry?.player?.id ?? null,
            name: entry?.player?.name || null,
            photo: entry?.player?.photo || null,
          },
          statistics: {
            games: {
              minutes: entry?.statistics?.games?.minutes ?? null,
              number: entry?.statistics?.games?.number ?? null,
              position: entry?.statistics?.games?.position || null,
              rating: entry?.statistics?.games?.rating ?? null,
              captain: entry?.statistics?.games?.captain ?? false,
              substitute: entry?.statistics?.games?.substitute ?? false,
            },
            offsides: entry?.statistics?.offsides ?? null,
            shots: {
              total: entry?.statistics?.shots?.total ?? null,
              on: entry?.statistics?.shots?.on ?? null,
            },
            goals: {
              total: entry?.statistics?.goals?.total ?? null,
              conceded: entry?.statistics?.goals?.conceded ?? null,
              assists: entry?.statistics?.goals?.assists ?? null,
              saves: entry?.statistics?.goals?.saves ?? null,
            },
            passes: {
              total: entry?.statistics?.passes?.total ?? null,
              key: entry?.statistics?.passes?.key ?? null,
              accuracy: entry?.statistics?.passes?.accuracy ?? null,
            },
            tackles: {
              total: entry?.statistics?.tackles?.total ?? null,
              blocks: entry?.statistics?.tackles?.blocks ?? null,
              interceptions: entry?.statistics?.tackles?.interceptions ?? null,
            },
            duels: {
              total: entry?.statistics?.duels?.total ?? null,
              won: entry?.statistics?.duels?.won ?? null,
            },
            dribbles: {
              attempts: entry?.statistics?.dribbles?.attempts ?? null,
              success: entry?.statistics?.dribbles?.success ?? null,
              past: entry?.statistics?.dribbles?.past ?? null,
            },
            fouls: {
              drawn: entry?.statistics?.fouls?.drawn ?? null,
              committed: entry?.statistics?.fouls?.committed ?? null,
            },
            cards: {
              yellow: entry?.statistics?.cards?.yellow ?? null,
              red: entry?.statistics?.cards?.red ?? null,
            },
            penalty: {
              won: entry?.statistics?.penalty?.won ?? null,
              committed: entry?.statistics?.penalty?.committed ?? entry?.statistics?.penalty?.commited ?? null,
              scored: entry?.statistics?.penalty?.scored ?? null,
              missed: entry?.statistics?.penalty?.missed ?? null,
              saved: entry?.statistics?.penalty?.saved ?? null,
            },
          },
        }))
      : [],
  }));
};

const normalizeMatchPayload = (match) => {
  if (!match) return null;

  return {
    ...match,
    matchId: match?.matchId ?? match?.apiMatchId ?? match?.fixtureId ?? null,
    apiMatchId: match?.apiMatchId ?? match?.matchId ?? match?.fixtureId ?? null,
    fixtureId: match?.fixtureId ?? match?.matchId ?? match?.apiMatchId ?? null,
    score: match?.score || match?.goals || { home: null, away: null },
    goals: match?.goals || match?.score || { home: null, away: null },
    homeScore: match?.homeScore ?? match?.score?.home ?? match?.goals?.home ?? null,
    awayScore: match?.awayScore ?? match?.score?.away ?? match?.goals?.away ?? null,
    events: normalizeMatchEvents(match?.events),
    statistics: normalizeStatisticsPayload(match?.statistics),
    lineups: normalizeLineupsPayload({ lineups: match?.lineups }),
    players: normalizePlayerStatsPayload({ players: match?.players }),
  };
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
      const data = await fetchJson(`${API_URL}/league/${encodeURIComponent(league)}`, undefined, 'getMatchesByLeague');
      return Array.isArray(data?.matches) ? data.matches.map(normalizeMatchPayload).filter(Boolean) : [];
    } catch (_error) {
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

      const data = await fetchJson(`${API_URL}/standings?${params.toString()}`, undefined, 'getLeagueStandings');
      return Array.isArray(data?.standings) ? data.standings : [];
    } catch (_error) {
      return [];
    }
  },

  getLiveMatches: async () => {
    try {
      const data = await fetchJson(`${API_URL}/live`, undefined, 'getLiveMatches');
      const liveMatches = Array.isArray(data?.matches) ? data.matches.map(normalizeMatchPayload).filter(Boolean) : [];
      if (liveMatches.length > 0) {
        return liveMatches;
      }

      const fallback = await matchService.getAllMatchesState();
      return Array.isArray(fallback?.matches)
        ? fallback.matches.map(normalizeMatchPayload).filter((match) => String(match?.status || '').toLowerCase() === 'live')
        : [];
    } catch (_error) {
      const fallback = await matchService.getAllMatchesState().catch(() => ({ matches: [] }));
      return Array.isArray(fallback?.matches)
        ? fallback.matches.map(normalizeMatchPayload).filter((match) => String(match?.status || '').toLowerCase() === 'live')
        : [];
    }
  },

  getMatchesByDate: async (date) => {
    try {
      const data = await fetchJson(`${API_URL}/by-date?date=${encodeURIComponent(date)}`, undefined, 'getMatchesByDate');
      return Array.isArray(data?.matches) ? data.matches.map(normalizeMatchPayload).filter(Boolean) : [];
    } catch (_error) {
      return [];
    }
  },

  getMatchById: async (matchId) => {
    try {
      const data = await fetchJson(`${API_URL}/${matchId}`, undefined, 'getMatchById');
      return normalizeMatchPayload(data?.match || null);
    } catch (_error) {
      return null;
    }
  },

  getMatchEvents: async (matchId) => {
    try {
      const data = await fetchJson(`${API_URL}/${matchId}/events`, undefined, 'getMatchEvents');
      return normalizeMatchEvents(data?.events);
    } catch (_error) {
      return [];
    }
  },

  getMatchStatistics: async (matchId) => {
    try {
      const data = await fetchJson(`${API_URL}/${matchId}/statistics`, undefined, 'getMatchStatistics');
      return normalizeStatisticsPayload(data?.statistics);
    } catch (_error) {
      return [];
    }
  },

  getMatchLineups: async (matchId) => {
    try {
      const data = await fetchJson(`${API_URL}/${matchId}/lineups`, undefined, 'getMatchLineups');
      return normalizeLineupsPayload(data);
    } catch (_error) {
      return [];
    }
  },

  getMatchPlayers: async (matchId) => {
    try {
      const data = await fetchJson(`${API_URL}/${matchId}/players`, undefined, 'getMatchPlayers');
      return normalizePlayerStatsPayload(data);
    } catch (_error) {
      return [];
    }
  },

  getSupportedLeagues: async () => {
    try {
      const data = await fetchJson(`${API_URL}/import/leagues`, undefined, 'getSupportedLeagues');
      return Array.isArray(data?.leagues) ? data.leagues : [];
    } catch (_error) {
      return [];
    }
  },

  importAllMatches: async () => {
    try {
      return await fetchJson(`${API_URL}/import/all`, { method: 'POST' }, 'importAllMatches');
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  importLeague: async (leagueCode) => {
    try {
      return await fetchJson(`${API_URL}/import/${leagueCode}`, { method: 'POST' }, 'importLeague');
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  importMatchDetails: async (matchId) => {
    try {
      return await fetchJson(`${API_URL}/${matchId}/import/details`, { method: 'POST' }, 'importMatchDetails');
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  getProviderStatus: async () => {
    try {
      return await fetchJson(`${API_URL}/provider/status`, undefined, 'getProviderStatus');
    } catch (_error) {
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
