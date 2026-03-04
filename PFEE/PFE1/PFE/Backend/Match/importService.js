const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchImpl }) => fetchImpl(...args));

const Match = require("./MatchModel");

const API_SPORTS_BASE_URL = "https://v3.football.api-sports.io";
const API_SPORTS_KEY = process.env.APISPORTS_KEY;
const IMPORT_TIMEZONE = process.env.MATCH_TIMEZONE || "Europe/Paris";
const IMPORT_PAST_DAYS = Number(process.env.MATCH_IMPORT_PAST_DAYS || 1);
const IMPORT_FUTURE_DAYS = Number(process.env.MATCH_IMPORT_FUTURE_DAYS || 3);

const LIVE_STATUSES = new Set(["1H", "2H", "HT", "ET", "P"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

const LEAGUES = {
  PL: { id: 39, name: "Premier League" },
  PD: { id: 140, name: "La Liga" },
  SA: { id: 135, name: "Serie A" },
  BL1: { id: 78, name: "Bundesliga" },
  FL1: { id: 61, name: "Ligue 1" },
  PPL: { id: 94, name: "Primeira Liga" },
  DED: { id: 88, name: "Eredivisie" },
  CL: { id: 2, name: "Champions League" },
  EL: { id: 3, name: "Europa League" }
};

let importAllInProgress = false;
let livePollInProgress = false;
let scheduledPollInProgress = false;

const getHeaders = () => ({
  "x-apisports-key": API_SPORTS_KEY
});

const getCurrentSeason = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
};

const formatDate = (date) => date.toISOString().slice(0, 10);

const getDateWindow = () => {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - IMPORT_PAST_DAYS);

  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + IMPORT_FUTURE_DAYS);

  return {
    from: formatDate(from),
    to: formatDate(to)
  };
};

const mapStatus = (shortStatus = "") => {
  if (LIVE_STATUSES.has(shortStatus)) return "live";
  if (FINISHED_STATUSES.has(shortStatus)) return "finished";
  return "scheduled";
};

const requestApiSports = async (path, params = {}) => {
  if (!API_SPORTS_KEY) {
    console.warn("API_SPORTS_KEY not configured.");
    return [];
  }

  const url = new URL(`${API_SPORTS_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  try {
    const response = await fetch(url, { headers: getHeaders() });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`API-Sports error ${response.status}: ${response.statusText} ${body}`);
      return [];
    }

    const payload = await response.json();
    if (payload?.errors && Object.keys(payload.errors).length > 0) {
      console.error("API-Sports payload errors:", payload.errors);
      return [];
    }

    return Array.isArray(payload?.response) ? payload.response : [];
  } catch (error) {
    console.error("API-Sports request failed:", error.message);
    return [];
  }
};

const fetchLeagueFixtures = async (leagueCode) => {
  const league = LEAGUES[leagueCode];
  if (!league) return [];

  const season = getCurrentSeason();
  const { from, to } = getDateWindow();

  return requestApiSports("/fixtures", {
    league: league.id,
    season,
    from,
    to,
    timezone: IMPORT_TIMEZONE
  });
};

const fetchLiveFixtures = async () => requestApiSports("/fixtures", {
  live: "all",
  timezone: IMPORT_TIMEZONE
});

const fetchFixtureById = async (matchId) => {
  const [fixture] = await requestApiSports("/fixtures", { id: matchId, timezone: IMPORT_TIMEZONE });
  return fixture || null;
};

const fetchFixtureEvents = async (matchId) => requestApiSports("/fixtures/events", { fixture: matchId });
const fetchFixtureStatistics = async (matchId) => requestApiSports("/fixtures/statistics", { fixture: matchId });
const fetchFixtureLineups = async (matchId) => requestApiSports("/fixtures/lineups", { fixture: matchId });

const buildScore = (fixture) => ({
  home: fixture?.goals?.home ?? null,
  away: fixture?.goals?.away ?? null
});

const transformFixture = (fixture, fallbackLeagueCode = null, fallbackLeagueName = null) => {
  const matchId = fixture?.fixture?.id;
  const shortStatus = fixture?.fixture?.status?.short || null;
  const venueName = fixture?.fixture?.venue?.name || null;

  return {
    matchId,
    apiMatchId: matchId,
    league: fixture?.league?.name || fallbackLeagueName || "Unknown League",
    leagueId: fixture?.league?.id ?? null,
    leagueCode: fallbackLeagueCode,
    leagueLogo: fixture?.league?.logo || null,
    country: fixture?.league?.country || null,
    countryFlag: fixture?.league?.flag || null,
    season: fixture?.league?.season ?? null,
    round: fixture?.league?.round || null,
    stadium: venueName,
    venue: venueName,
    city: fixture?.fixture?.venue?.city || null,
    referee: fixture?.fixture?.referee || null,
    homeTeam: fixture?.teams?.home?.name || "Unknown",
    homeTeamId: fixture?.teams?.home?.id ?? null,
    homeTeamLogo: fixture?.teams?.home?.logo || null,
    awayTeam: fixture?.teams?.away?.name || "Unknown",
    awayTeamId: fixture?.teams?.away?.id ?? null,
    awayTeamLogo: fixture?.teams?.away?.logo || null,
    score: buildScore(fixture),
    homeScore: fixture?.goals?.home ?? null,
    awayScore: fixture?.goals?.away ?? null,
    status: mapStatus(shortStatus),
    statusShort: shortStatus,
    minute: fixture?.fixture?.status?.elapsed ?? null,
    date: fixture?.fixture?.date ? new Date(fixture.fixture.date) : null,
    updatedAt: new Date()
  };
};

const isMeaningfulChange = (existing, nextMatch) => {
  if (!existing) return true;

  return (
    existing.homeScore !== nextMatch.homeScore ||
    existing.awayScore !== nextMatch.awayScore ||
    existing.status !== nextMatch.status ||
    existing.statusShort !== nextMatch.statusShort ||
    existing.minute !== nextMatch.minute ||
    existing.referee !== nextMatch.referee ||
    existing.round !== nextMatch.round ||
    existing.stadium !== nextMatch.stadium ||
    existing.city !== nextMatch.city ||
    existing.homeTeam !== nextMatch.homeTeam ||
    existing.awayTeam !== nextMatch.awayTeam ||
    existing.homeTeamLogo !== nextMatch.homeTeamLogo ||
    existing.awayTeamLogo !== nextMatch.awayTeamLogo ||
    existing.country !== nextMatch.country ||
    existing.league !== nextMatch.league ||
    String(existing.date) !== String(nextMatch.date)
  );
};

const upsertMatch = async (match) => Match.findOneAndUpdate(
  { matchId: match.matchId },
  { $set: match },
  {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    lean: true
  }
);

const mergeFixtures = (fixtures, leagueCode, leagueName, bucket) => {
  fixtures.forEach((fixture) => {
    const transformed = transformFixture(fixture, leagueCode, leagueName);
    if (!transformed.matchId || !transformed.date) return;

    const existing = bucket.get(transformed.matchId);
    if (!existing || transformed.status === "live" || existing.status !== "live") {
      bucket.set(transformed.matchId, transformed);
    }
  });
};

const syncMatches = async (matches, io, emitUpdates = false) => {
  let upserted = 0;
  let emitted = 0;

  for (const match of matches) {
    if (!match?.matchId || !match?.date) continue;

    const existing = await Match.findOne({ matchId: match.matchId }).lean();
    if (!isMeaningfulChange(existing, match)) {
      continue;
    }

    const saved = await upsertMatch(match);
    upserted += 1;

    if (emitUpdates && io) {
      io.emit("match:update", saved);
      emitted += 1;
    }
  }

  return { upserted, emitted };
};

const importLeagueMatches = async (leagueCode, io = null) => {
  try {
    const league = LEAGUES[leagueCode];
    if (!league) {
      return { success: false, message: "League not found", count: 0 };
    }

    if (!API_SPORTS_KEY) {
      return { success: false, message: "API_SPORTS_KEY not configured", count: 0 };
    }

    const fixtures = await fetchLeagueFixtures(leagueCode);
    const liveFixtures = await fetchLiveFixtures();
    const relevantLiveFixtures = liveFixtures.filter((fixture) => fixture?.league?.id === league.id);
    const bucket = new Map();

    mergeFixtures(fixtures, leagueCode, league.name, bucket);
    mergeFixtures(relevantLiveFixtures, leagueCode, league.name, bucket);

    const { upserted, emitted } = await syncMatches([...bucket.values()], io, Boolean(io));

    return {
      success: true,
      message: `Upserted ${upserted} matches for ${league.name}`,
      count: upserted,
      emitted,
      league: league.name
    };
  } catch (error) {
    console.error("importLeagueMatches error:", error);
    return { success: false, message: error.message, count: 0 };
  }
};

const importAllMatches = async (io = null) => {
  if (importAllInProgress) {
    return { success: true, message: "Import already running", count: 0 };
  }

  try {
    if (!API_SPORTS_KEY) {
      return { success: false, message: "API_SPORTS_KEY not configured", count: 0 };
    }

    importAllInProgress = true;
    const liveFixtures = await fetchLiveFixtures();
    let total = 0;
    let totalEmitted = 0;

    for (const [leagueCode, league] of Object.entries(LEAGUES)) {
      const fixtures = await fetchLeagueFixtures(leagueCode);
      const relevantLiveFixtures = liveFixtures.filter((fixture) => fixture?.league?.id === league.id);
      const bucket = new Map();

      mergeFixtures(fixtures, leagueCode, league.name, bucket);
      mergeFixtures(relevantLiveFixtures, leagueCode, league.name, bucket);

      const { upserted, emitted } = await syncMatches([...bucket.values()], io, Boolean(io));
      total += upserted;
      totalEmitted += emitted;

      console.log(`[scheduled-import] ${league.name}: upserted ${upserted}, emitted ${emitted}`);
    }

    return {
      success: true,
      message: `Upserted ${total} matches from API-Sports`,
      count: total,
      emitted: totalEmitted
    };
  } catch (error) {
    console.error("importAllMatches error:", error);
    return { success: false, message: error.message, count: 0 };
  } finally {
    importAllInProgress = false;
  }
};

const pollLiveMatchesAndEmitUpdates = async (io) => {
  if (livePollInProgress) {
    return { success: true, message: "Live polling already running", count: 0, emitted: 0 };
  }

  try {
    if (!API_SPORTS_KEY) {
      return { success: false, message: "API_SPORTS_KEY not configured", count: 0, emitted: 0 };
    }

    livePollInProgress = true;
    const liveFixtures = await fetchLiveFixtures();
    const transformedMatches = liveFixtures
      .map((fixture) => {
        const matchingLeague = Object.entries(LEAGUES).find(([, league]) => league.id === fixture?.league?.id);
        return transformFixture(
          fixture,
          matchingLeague?.[0] || null,
          matchingLeague?.[1]?.name || fixture?.league?.name || null
        );
      })
      .filter((match) => match.matchId && match.date && match.status === "live");

    const { upserted, emitted } = await syncMatches(transformedMatches, io, true);
    console.log(`[live-poll] checked ${transformedMatches.length}, upserted ${upserted}, emitted ${emitted}`);

    return {
      success: true,
      message: "Live matches polled",
      count: upserted,
      emitted
    };
  } catch (error) {
    console.error("pollLiveMatchesAndEmitUpdates error:", error);
    return { success: false, message: error.message, count: 0, emitted: 0 };
  } finally {
    livePollInProgress = false;
  }
};

const pollScheduledMatches = async (io) => {
  if (scheduledPollInProgress) {
    return { success: true, message: "Scheduled polling already running", count: 0, emitted: 0 };
  }

  try {
    scheduledPollInProgress = true;
    const result = await importAllMatches(io);
    console.log(`[scheduled-poll] upserted ${result.count || 0}, emitted ${result.emitted || 0}`);
    return result;
  } finally {
    scheduledPollInProgress = false;
  }
};

const getSupportedLeagues = () => Object.entries(LEAGUES).map(([code, league]) => ({
  code,
  id: league.id,
  name: league.name
}));

const findStoredMatchById = async (matchId) => Match.findOne({
  $or: [
    { matchId },
    { apiMatchId: matchId }
  ]
}).lean();

const mapEvent = (event) => ({
  id: `${event?.time?.elapsed || 0}-${event?.team?.id || 0}-${event?.player?.id || 0}-${event?.type || "event"}`,
  minute: event?.time?.elapsed ?? null,
  extraMinute: event?.time?.extra ?? null,
  team: {
    id: event?.team?.id ?? null,
    name: event?.team?.name || null,
    logo: event?.team?.logo || null
  },
  player: {
    id: event?.player?.id ?? null,
    name: event?.player?.name || null
  },
  assist: {
    id: event?.assist?.id ?? null,
    name: event?.assist?.name || null
  },
  type: event?.type || null,
  detail: event?.detail || null,
  comments: event?.comments || null
});

const mapStatistics = (teamStats) => ({
  team: {
    id: teamStats?.team?.id ?? null,
    name: teamStats?.team?.name || null,
    logo: teamStats?.team?.logo || null
  },
  statistics: Array.isArray(teamStats?.statistics)
    ? teamStats.statistics.map((stat) => ({
        type: stat?.type || null,
        value: stat?.value ?? null
      }))
    : []
});

const mapLineupPlayers = (items = []) => items.map((entry) => ({
  id: entry?.player?.id ?? null,
  name: entry?.player?.name || null,
  number: entry?.player?.number ?? null,
  position: entry?.player?.pos || null,
  grid: entry?.player?.grid || null
}));

const mapLineup = (lineup) => ({
  team: {
    id: lineup?.team?.id ?? null,
    name: lineup?.team?.name || null,
    logo: lineup?.team?.logo || null,
    colors: lineup?.team?.colors || null
  },
  formation: lineup?.formation || null,
  coach: {
    id: lineup?.coach?.id ?? null,
    name: lineup?.coach?.name || null,
    photo: lineup?.coach?.photo || null
  },
  startingXI: mapLineupPlayers(lineup?.startXI),
  substitutes: mapLineupPlayers(lineup?.substitutes)
});

const getMatchDetails = async (matchId) => {
  const fixture = await fetchFixtureById(matchId);
  if (fixture) {
    return transformFixture(fixture);
  }

  return findStoredMatchById(matchId);
};

const getMatchEvents = async (matchId) => {
  const events = await fetchFixtureEvents(matchId);
  return events.map(mapEvent);
};

const getMatchStatistics = async (matchId) => {
  const statistics = await fetchFixtureStatistics(matchId);
  return statistics.map(mapStatistics);
};

const getMatchLineups = async (matchId) => {
  const lineups = await fetchFixtureLineups(matchId);
  return lineups.map(mapLineup);
};

module.exports = {
  importAllMatches,
  importLeagueMatches,
  pollLiveMatchesAndEmitUpdates,
  pollScheduledMatches,
  getSupportedLeagues,
  getMatchDetails,
  getMatchEvents,
  getMatchStatistics,
  getMatchLineups,
  findStoredMatchById,
  LEAGUES,
  LIVE_STATUSES
};
