const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchImpl }) => fetchImpl(...args));

const Match = require("./MatchModel");
const Team = require("./TeamModel");
const League = require("./LeagueModel");
const { notifyUsersForMatchUpdate } = require("../Notification/notificationService");

const API_SPORTS_BASE_URL = String(
  process.env.APISPORTS_BASE_URL ||
  process.env.API_SPORTS_BASE_URL ||
  "https://v3.football.api-sports.io"
).replace(/\/+$/, "");
const API_SPORTS_KEY = process.env.APISPORTS_KEY || process.env.API_SPORTS_KEY;
const IMPORT_TIMEZONE = process.env.MATCH_TIMEZONE || "Europe/Paris";

const readBooleanEnv = (name, fallback = false) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const readNumberEnv = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeDayWindow = (value) => Math.max(0, Math.trunc(Number(value) || 0));

const IMPORT_PAST_DAYS = sanitizeDayWindow(readNumberEnv("MATCH_IMPORT_PAST_DAYS", 1));
const IMPORT_FUTURE_DAYS = sanitizeDayWindow(readNumberEnv("MATCH_IMPORT_FUTURE_DAYS", 3));
const REFRESH_PAST_DAYS = sanitizeDayWindow(readNumberEnv("MATCH_REFRESH_PAST_DAYS", 0));
const REFRESH_FUTURE_DAYS = sanitizeDayWindow(readNumberEnv("MATCH_REFRESH_FUTURE_DAYS", IMPORT_FUTURE_DAYS));
const API_SPORTS_RATE_LIMIT_BACKOFF_MS = Math.max(
  15 * 1000,
  readNumberEnv("APISPORTS_RATE_LIMIT_BACKOFF_MS", 75 * 1000)
);
const API_SPORTS_OFFLINE_MODE = readBooleanEnv("APISPORTS_OFFLINE_MODE", false);

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
let apiSportsBlockedUntil = 0;
let apiSportsLastError = null;
const detailHydrationInFlight = new Map();

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
const normalizeText = (value) => String(value || "").trim();
const hasText = (value) => normalizeText(value) !== "";
const hasMeaningfulTeamName = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized !== "" && normalized !== "unknown";
};
const hasMeaningfulLeagueName = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized !== "" && normalized !== "unknown league";
};

const getNextUtcMidnight = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 5);
};

const applyApiSportsBlock = (message, fallbackDurationMs = API_SPORTS_RATE_LIMIT_BACKOFF_MS) => {
  const lowered = String(message || "").toLowerCase();

  if (!lowered) {
    return false;
  }

  let blockedUntil = 0;

  if (
    lowered.includes("reached the request limit") ||
    lowered.includes("per day") ||
    lowered.includes("daily limit")
  ) {
    blockedUntil = getNextUtcMidnight();
  } else if (
    lowered.includes("rate limit") ||
    lowered.includes("too many requests") ||
    lowered.includes("per minute") ||
    lowered.includes("requests per minute")
  ) {
    blockedUntil = Date.now() + fallbackDurationMs;
  }

  if (!blockedUntil) {
    return false;
  }

  apiSportsBlockedUntil = Math.max(apiSportsBlockedUntil, blockedUntil);
  return true;
};

const getDateWindow = (options = {}) => {
  const pastDays = sanitizeDayWindow(options.pastDays ?? IMPORT_PAST_DAYS);
  const futureDays = sanitizeDayWindow(options.futureDays ?? IMPORT_FUTURE_DAYS);
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - pastDays);

  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + futureDays);

  return {
    from: formatDate(from),
    to: formatDate(to)
  };
};

const getDateListFromWindow = (options = {}) => {
  const { from, to } = getDateWindow(options);
  const dates = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const limit = new Date(`${to}T00:00:00.000Z`);

  while (cursor <= limit) {
    dates.push(formatDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

const mapStatus = (shortStatus = "") => {
  if (LIVE_STATUSES.has(shortStatus)) return "live";
  if (FINISHED_STATUSES.has(shortStatus)) return "finished";
  return "scheduled";
};

const requestApiSports = async (path, params = {}) => {
  if (!API_SPORTS_KEY) {
    apiSportsLastError = { config: "APISPORTS_KEY not configured" };
    console.warn("APISPORTS_KEY not configured.");
    return [];
  }

  if (API_SPORTS_OFFLINE_MODE) {
    apiSportsLastError = {
      offlineMode: true,
      message: "API-Sports disabled; serving cached MongoDB data only"
    };
    return [];
  }

  if (apiSportsBlockedUntil > Date.now()) {
    apiSportsLastError = {
      blocked: true,
      blockedUntil: apiSportsBlockedUntil
    };
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
      apiSportsLastError = {
        httpStatus: response.status,
        httpStatusText: response.statusText,
        body: body.slice(0, 500)
      };

      if (response.status === 429) {
        applyApiSportsBlock(body || response.statusText || "429");
      }

      console.error(`API-Sports error ${response.status}: ${response.statusText} ${body}`);
      return [];
    }

    const payload = await response.json();
    if (payload?.errors && Object.keys(payload.errors).length > 0) {
      const errorMessage = Object.values(payload.errors)
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" | ");
      const blocked = applyApiSportsBlock(errorMessage);
      apiSportsLastError = {
        ...payload.errors,
        blocked,
        blockedUntil: apiSportsBlockedUntil || null
      };

      if (blocked) {
        console.warn(
          "API-Sports request limit reached. Backing off until",
          new Date(apiSportsBlockedUntil).toISOString()
        );
      }

      console.error("API-Sports payload errors:", payload.errors);
      return [];
    }

    apiSportsLastError = null;
    return Array.isArray(payload?.response) ? payload.response : [];
  } catch (error) {
    apiSportsLastError = { network: error.message };
    console.error("API-Sports request failed:", error.message);
    return [];
  }
};

const fetchLeagueFixtures = async (leagueCode, options = {}) => {
  const league = LEAGUES[leagueCode];
  if (!league) return [];

  const season = getCurrentSeason();
  const { from, to } = getDateWindow(options);

  return requestApiSports("/fixtures", {
    league: league.id,
    season,
    from,
    to,
    timezone: IMPORT_TIMEZONE
  });
};

const fetchFixturesByDate = async (date) => requestApiSports("/fixtures", {
  date,
  timezone: IMPORT_TIMEZONE
});

const fetchWindowFixtures = async (options = {}) => {
  const dates = getDateListFromWindow(options);
  const today = formatDate(new Date());
  const prioritizedDates = [
    today,
    ...dates.filter((date) => date > today),
    ...dates.filter((date) => date < today).reverse()
  ].filter((date, index, list) => list.indexOf(date) === index);
  const fixtures = [];

  for (const date of prioritizedDates) {
    const dayFixtures = await fetchFixturesByDate(date);
    fixtures.push(...dayFixtures);

    if (apiSportsBlockedUntil > Date.now()) {
      break;
    }
  }

  return fixtures;
};

const fetchLiveFixtures = async () => requestApiSports("/fixtures", {
  live: "all",
  timezone: IMPORT_TIMEZONE
});

const fetchFixtureById = async (fixtureId) => {
  const [fixture] = await requestApiSports("/fixtures", { id: fixtureId, timezone: IMPORT_TIMEZONE });
  return fixture || null;
};

const fetchFixtureEvents = async (fixtureId) => requestApiSports("/fixtures/events", { fixture: fixtureId });
const fetchFixtureStatistics = async (fixtureId) => requestApiSports("/fixtures/statistics", { fixture: fixtureId });
const fetchFixtureLineups = async (fixtureId) => requestApiSports("/fixtures/lineups", { fixture: fixtureId });
const fetchFixturePlayers = async (fixtureId) => requestApiSports("/fixtures/players", { fixture: fixtureId });
const fetchLeagueStandings = async (leagueId, season = getCurrentSeason()) => requestApiSports("/standings", {
  league: leagueId,
  season
});

const transformFixture = (fixture, fallbackLeagueCode = null, fallbackLeagueName = null) => {
  const fixtureId = fixture?.fixture?.id;
  const shortStatus = fixture?.fixture?.status?.short || null;
  const venueName = fixture?.fixture?.venue?.name || null;

  return {
    fixtureId,
    leagueCode: fallbackLeagueCode,
    league: {
      leagueId: fixture?.league?.id ?? null,
      season: fixture?.league?.season ?? getCurrentSeason(),
      name: fixture?.league?.name || fallbackLeagueName || "Unknown League",
      country: fixture?.league?.country || null,
      logo: fixture?.league?.logo || null,
      flag: fixture?.league?.flag || null
    },
    homeTeam: {
      teamId: fixture?.teams?.home?.id ?? null,
      name: fixture?.teams?.home?.name || "Unknown",
      logo: fixture?.teams?.home?.logo || null
    },
    awayTeam: {
      teamId: fixture?.teams?.away?.id ?? null,
      name: fixture?.teams?.away?.name || "Unknown",
      logo: fixture?.teams?.away?.logo || null
    },
    date: fixture?.fixture?.date ? new Date(fixture.fixture.date) : null,
    status: mapStatus(shortStatus),
    statusShort: shortStatus,
    minute: fixture?.fixture?.status?.elapsed ?? null,
    referee: fixture?.fixture?.referee || null,
    round: fixture?.league?.round || null,
    stadium: venueName,
    city: fixture?.fixture?.venue?.city || null,
    goals: {
      home: fixture?.goals?.home ?? null,
      away: fixture?.goals?.away ?? null
    }
  };
};

const mapEventForStorage = (event) => ({
  eventId: `${event?.time?.elapsed || 0}-${event?.team?.id || 0}-${event?.player?.id || 0}-${event?.type || "event"}-${event?.detail || ""}`,
  minute: event?.time?.elapsed ?? null,
  extraMinute: event?.time?.extra ?? null,
  teamId: event?.team?.id ?? null,
  teamName: event?.team?.name || null,
  playerId: event?.player?.id ?? null,
  playerName: event?.player?.name || null,
  assistId: event?.assist?.id ?? null,
  assistName: event?.assist?.name || null,
  type: event?.type || null,
  detail: event?.detail || null,
  comments: event?.comments || null
});

const dedupeEventsById = (events = []) => {
  const seen = new Set();
  const output = [];

  for (const event of events) {
    const eventId = String(event?.eventId || "");
    if (!eventId || seen.has(eventId)) continue;
    seen.add(eventId);
    output.push(event);
  }

  return output;
};

const fixtureHasMissingLogos = (fixturePayload) => (
  !hasText(fixturePayload?.league?.logo) ||
  !hasText(fixturePayload?.homeTeam?.logo) ||
  !hasText(fixturePayload?.awayTeam?.logo)
);

const isDynamicChange = (existing, nextPayload) => {
  if (!existing) return true;

  return (
    existing.status !== nextPayload.status ||
    existing.statusShort !== nextPayload.statusShort ||
    existing.minute !== nextPayload.minute ||
    existing.homeScore !== nextPayload.homeScore ||
    existing.awayScore !== nextPayload.awayScore ||
    String(existing.date) !== String(nextPayload.date) ||
    existing.referee !== nextPayload.referee ||
    existing.round !== nextPayload.round ||
    existing.stadium !== nextPayload.stadium ||
    existing.city !== nextPayload.city
  );
};

const hasCoreDynamicChange = (existing, incoming) => {
  if (!existing) return true;

  return (
    existing.status !== incoming.status ||
    existing.statusShort !== incoming.statusShort ||
    existing.minute !== incoming.minute ||
    existing.homeScore !== (incoming.goals?.home ?? null) ||
    existing.awayScore !== (incoming.goals?.away ?? null) ||
    String(existing.date) !== String(incoming.date) ||
    existing.referee !== incoming.referee ||
    existing.round !== incoming.round ||
    existing.stadium !== incoming.stadium ||
    existing.city !== incoming.city
  );
};

const upsertTeam = async (teamPayload) => {
  if (!teamPayload?.teamId) return null;

  const existing = await Team.findOne({ teamId: teamPayload.teamId }).lean();
  const nextName = hasMeaningfulTeamName(teamPayload.name)
    ? normalizeText(teamPayload.name)
    : (existing?.name || `Team ${teamPayload.teamId}`);
  const nextLogo = hasText(teamPayload.logo)
    ? normalizeText(teamPayload.logo)
    : (existing?.logo || null);

  return Team.findOneAndUpdate(
    { teamId: teamPayload.teamId },
    {
      $set: {
        name: nextName,
        logo: nextLogo,
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    },
    { upsert: true, new: true, lean: true }
  );
};

const upsertLeague = async (leaguePayload) => {
  if (!leaguePayload?.leagueId || !leaguePayload?.season) return null;

  const existing = await League.findOne({
    leagueId: leaguePayload.leagueId,
    season: leaguePayload.season
  }).lean();
  const nextName = hasMeaningfulLeagueName(leaguePayload.name)
    ? normalizeText(leaguePayload.name)
    : (existing?.name || `League ${leaguePayload.leagueId}`);
  const nextCountry = hasText(leaguePayload.country)
    ? normalizeText(leaguePayload.country)
    : (existing?.country || null);
  const nextLogo = hasText(leaguePayload.logo)
    ? normalizeText(leaguePayload.logo)
    : (existing?.logo || null);
  const nextFlag = hasText(leaguePayload.flag)
    ? normalizeText(leaguePayload.flag)
    : (existing?.flag || null);

  return League.findOneAndUpdate(
    {
      leagueId: leaguePayload.leagueId,
      season: leaguePayload.season
    },
    {
      $set: {
        name: nextName,
        country: nextCountry,
        logo: nextLogo,
        flag: nextFlag,
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    },
    { upsert: true, new: true, lean: true }
  );
};

const mergeFixtures = (fixtures, leagueCode, leagueName, bucket) => {
  fixtures.forEach((fixture) => {
    const transformed = transformFixture(fixture, leagueCode, leagueName);
    if (!transformed.fixtureId || !transformed.date) return;

    const existing = bucket.get(transformed.fixtureId);
    if (!existing || transformed.status === "live" || existing.status !== "live") {
      bucket.set(transformed.fixtureId, transformed);
    }
  });
};

const finalizeStaleLiveMatches = async (activeLiveFixtureIds = []) => {
  const safeIds = activeLiveFixtureIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));

  const staleThreshold = new Date(Date.now() - (12 * 60 * 60 * 1000));
  const query = {
    status: "live",
    date: { $lt: staleThreshold }
  };

  if (safeIds.length > 0) {
    query.fixtureId = { $nin: safeIds };
  }

  const result = await Match.updateMany(query, {
    $set: {
      status: "finished",
      statusShort: "FT",
      minute: null,
      updatedAt: new Date()
    }
  });

  return result?.modifiedCount || 0;
};

const syncMatches = async (matches, io, options = {}) => {
  const emitUpdates = Boolean(options.emitUpdates);
  const includeLiveEvents = Boolean(options.includeLiveEvents);
  const includeLiveDetails = Boolean(options.includeLiveDetails);
  const includeFinishedDetails = Boolean(options.includeFinishedDetails);

  let upserted = 0;
  let emitted = 0;

  const teamCache = new Map();
  const leagueCache = new Map();

  for (const rawIncoming of matches) {
    let incoming = rawIncoming;
    if (!incoming?.fixtureId || !incoming?.date) continue;

    if (fixtureHasMissingLogos(incoming)) {
      const enrichedFixture = await fetchFixtureById(incoming.fixtureId);
      if (enrichedFixture) {
        incoming = transformFixture(
          enrichedFixture,
          incoming.leagueCode || null,
          incoming.league?.name || null
        );
      }
    }

    const homeTeamKey = incoming.homeTeam?.teamId;
    const awayTeamKey = incoming.awayTeam?.teamId;
    const leagueKey = `${incoming.league?.leagueId || ""}-${incoming.league?.season || ""}`;

    let homeTeamDoc = homeTeamKey ? teamCache.get(homeTeamKey) : null;
    if (!homeTeamDoc && homeTeamKey) {
      homeTeamDoc = await upsertTeam(incoming.homeTeam);
      if (homeTeamDoc) teamCache.set(homeTeamKey, homeTeamDoc);
    }

    let awayTeamDoc = awayTeamKey ? teamCache.get(awayTeamKey) : null;
    if (!awayTeamDoc && awayTeamKey) {
      awayTeamDoc = await upsertTeam(incoming.awayTeam);
      if (awayTeamDoc) teamCache.set(awayTeamKey, awayTeamDoc);
    }

    let leagueDoc = leagueCache.get(leagueKey);
    if (!leagueDoc && incoming.league?.leagueId && incoming.league?.season) {
      leagueDoc = await upsertLeague(incoming.league);
      if (leagueDoc) leagueCache.set(leagueKey, leagueDoc);
    }

    if (!homeTeamDoc?._id || !awayTeamDoc?._id || !leagueDoc?._id) {
      continue;
    }

    const existing = await Match.findOne({
      $or: [
        { fixtureId: incoming.fixtureId },
        { matchId: incoming.fixtureId },
        { apiMatchId: incoming.fixtureId }
      ]
    }).lean();

    const hasStoredEvents = Array.isArray(existing?.events) && existing.events.length > 0;
    const hasStoredStatistics = Array.isArray(existing?.statistics) && existing.statistics.length > 0;
    const hasStoredLineups = Array.isArray(existing?.lineups) && existing.lineups.length > 0;
    const hasStoredPlayers = Array.isArray(existing?.players) && existing.players.length > 0;
    const coreChanged = hasCoreDynamicChange(existing, incoming);
    const needsFinishedHydration = incoming.status === "finished" && includeFinishedDetails && (
      !hasStoredEvents || !hasStoredStatistics || !hasStoredLineups || !hasStoredPlayers || existing?.status !== "finished"
    );
    // For live matches, avoid repeated API calls when nothing changed.
    const shouldHydrateLiveEvents = includeLiveEvents && incoming.status === "live" && (coreChanged || !hasStoredEvents);
    const shouldHydrateLiveSupplementalDetails = includeLiveDetails && incoming.status === "live" && (
      coreChanged || !hasStoredStatistics || !hasStoredLineups || !hasStoredPlayers
    );
    const shouldHydrateDetails = shouldHydrateLiveEvents || shouldHydrateLiveSupplementalDetails || needsFinishedHydration;

    let events = [];
    let statistics = [];
    let lineups = [];
    let players = [];

    if (shouldHydrateLiveEvents || needsFinishedHydration) {
      const liveEvents = await fetchFixtureEvents(incoming.fixtureId);
      events = dedupeEventsById(liveEvents.map(mapEventForStorage));
    }

    if (shouldHydrateLiveSupplementalDetails || needsFinishedHydration) {
      const fetchedStatistics = await fetchFixtureStatistics(incoming.fixtureId);
      const fetchedLineups = await fetchFixtureLineups(incoming.fixtureId);
      const fetchedPlayers = await fetchFixturePlayers(incoming.fixtureId);
      statistics = fetchedStatistics.map(mapStatistics);
      lineups = fetchedLineups.map(mapLineup);
      players = fetchedPlayers.map(mapFixturePlayers);
    }

    const payload = {
      fixtureId: incoming.fixtureId,
      matchId: incoming.fixtureId,
      apiMatchId: incoming.fixtureId,
      date: incoming.date,
      status: incoming.status,
      statusShort: incoming.statusShort,
      minute: incoming.minute,
      referee: incoming.referee,
      round: incoming.round,
      stadium: incoming.stadium,
      city: incoming.city,
      homeTeamRef: homeTeamDoc._id,
      awayTeamRef: awayTeamDoc._id,
      leagueRef: leagueDoc._id,
      goals: incoming.goals,
      score: incoming.goals,
      homeScore: incoming.goals?.home ?? null,
      awayScore: incoming.goals?.away ?? null,
      // Important: never wipe stored events when current poll has none.
      events: events.length > 0 ? events : (Array.isArray(existing?.events) ? existing.events : []),
      // Same principle: keep previously stored arrays when provider returns nothing.
      statistics: statistics.length > 0 ? statistics : (Array.isArray(existing?.statistics) ? existing.statistics : []),
      lineups: lineups.length > 0 ? lineups : (Array.isArray(existing?.lineups) ? existing.lineups : []),
      players: players.length > 0 ? players : (Array.isArray(existing?.players) ? existing.players : []),
      updatedAt: new Date()
    };

    if (!isDynamicChange(existing, payload) && !shouldHydrateDetails) {
      continue;
    }

    const saved = await Match.findOneAndUpdate(
      {
        $or: [
          { fixtureId: incoming.fixtureId },
          { matchId: incoming.fixtureId },
          { apiMatchId: incoming.fixtureId }
        ]
      },
      {
        $set: payload,
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, lean: true }
    );

    upserted += 1;

    if (emitUpdates && io) {
      const hydratedMatch = await findStoredMatchById(incoming.fixtureId);
      io.emit("match:update", hydratedMatch || saved);
      emitted += 1;
    }

    try {
      await notifyUsersForMatchUpdate({
        previousMatch: existing,
        currentMatch: {
          fixtureId: incoming.fixtureId,
          matchId: incoming.fixtureId,
          apiMatchId: incoming.fixtureId,
          status: payload.status,
          statusShort: payload.statusShort,
          date: payload.date,
          homeScore: payload.homeScore,
          awayScore: payload.awayScore,
          homeTeam: incoming.homeTeam?.name,
          awayTeam: incoming.awayTeam?.name,
        }
      });
    } catch (notificationError) {
      console.error("Favorite notification dispatch failed:", notificationError);
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
      return { success: false, message: "APISPORTS_KEY not configured", count: 0 };
    }

    const fixtures = await fetchLeagueFixtures(leagueCode);
    const liveFixtures = await fetchLiveFixtures();
    const relevantLiveFixtures = liveFixtures.filter((fixture) => fixture?.league?.id === league.id);
    const bucket = new Map();

    mergeFixtures(fixtures, leagueCode, league.name, bucket);
    mergeFixtures(relevantLiveFixtures, leagueCode, league.name, bucket);

    const { upserted, emitted } = await syncMatches([...bucket.values()], io, {
      emitUpdates: Boolean(io),
      includeLiveEvents: true,
      includeLiveDetails: true,
      includeFinishedDetails: false
    });

    return {
      success: upserted > 0 || !apiSportsLastError,
      message: upserted > 0
        ? `Upserted ${upserted} matches for ${league.name}`
        : (apiSportsLastError
          ? `API-Sports did not return usable fixtures for ${league.name}`
          : `No fixtures found for ${league.name} in the current window`),
      count: upserted,
      emitted,
      league: league.name,
      providerError: apiSportsLastError
    };
  } catch (error) {
    console.error("importLeagueMatches error:", error);
    return { success: false, message: error.message, count: 0 };
  }
};

const importAllMatches = async (io = null, options = {}) => {
  if (importAllInProgress) {
    return { success: true, message: "Import already running", count: 0 };
  }

  try {
    if (!API_SPORTS_KEY) {
      return { success: false, message: "APISPORTS_KEY not configured", count: 0 };
    }

      importAllInProgress = true;
      apiSportsLastError = null;
      const windowOptions = {
        pastDays: options.pastDays ?? IMPORT_PAST_DAYS,
        futureDays: options.futureDays ?? IMPORT_FUTURE_DAYS
      };
      const liveFixtures = await fetchLiveFixtures();
      const scheduledFixtures = await fetchWindowFixtures(windowOptions);
      const bucket = new Map();

    mergeFixtures(scheduledFixtures, null, null, bucket);
    mergeFixtures(liveFixtures, null, null, bucket);

    const { upserted, emitted } = await syncMatches([...bucket.values()], io, {
      emitUpdates: Boolean(io),
      includeLiveEvents: false,
      includeLiveDetails: true,
      includeFinishedDetails: false
    });
    const staleLiveFixed = await finalizeStaleLiveMatches(
      liveFixtures.map((fixture) => fixture?.fixture?.id)
    );

    return {
        success: upserted > 0 || staleLiveFixed > 0 || !apiSportsLastError,
        message: upserted > 0
          ? `Upserted ${upserted} matches from API-Sports`
          : (apiSportsLastError
            ? "API-Sports did not return usable fixtures for the current date window"
            : "No fixtures found in the configured date window"),
        count: upserted,
        emitted,
        staleLiveFixed,
        window: getDateWindow(windowOptions),
        providerError: apiSportsLastError
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
      return { success: false, message: "APISPORTS_KEY not configured", count: 0, emitted: 0 };
    }

    livePollInProgress = true;
    apiSportsLastError = null;
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
      .filter((match) => match.fixtureId && match.date && match.status === "live");

    const { upserted, emitted } = await syncMatches(transformedMatches, io, {
      emitUpdates: true,
      includeLiveEvents: true,
      includeLiveDetails: true,
      includeFinishedDetails: false
    });
    const staleLiveFixed = await finalizeStaleLiveMatches(
      liveFixtures.map((fixture) => fixture?.fixture?.id)
    );
    console.log(`[live-poll] checked ${transformedMatches.length}, upserted ${upserted}, emitted ${emitted}`);

    return {
      success: transformedMatches.length > 0 || staleLiveFixed > 0 || !apiSportsLastError,
      message: transformedMatches.length > 0
        ? "Live matches polled"
        : (apiSportsLastError
          ? "Live polling failed against API-Sports"
          : "No live matches returned by provider"),
      count: upserted,
      emitted,
      staleLiveFixed,
      providerError: apiSportsLastError
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
    const result = await importAllMatches(io, {
      pastDays: REFRESH_PAST_DAYS,
      futureDays: REFRESH_FUTURE_DAYS
    });
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

const serializeMatch = (matchDoc, options = {}) => {
  if (!matchDoc) return null;

  const includeDetails = Boolean(options.includeDetails);

  const homeTeam = matchDoc.homeTeamRef || {};
  const awayTeam = matchDoc.awayTeamRef || {};
  const league = matchDoc.leagueRef || {};

  return {
    _id: matchDoc._id,
    fixtureId: matchDoc.fixtureId,
    matchId: matchDoc.fixtureId,
    apiMatchId: matchDoc.fixtureId,
    date: matchDoc.date,
    status: matchDoc.status,
    statusShort: matchDoc.statusShort,
    minute: matchDoc.minute,
    homeTeamId: homeTeam.teamId || null,
    homeTeam: homeTeam.name || "Unknown",
    homeTeamLogo: homeTeam.logo || null,
    awayTeamId: awayTeam.teamId || null,
    awayTeam: awayTeam.name || "Unknown",
    awayTeamLogo: awayTeam.logo || null,
    leagueId: league.leagueId || null,
    league: league.name || "Unknown League",
    leagueLogo: league.logo || null,
    country: league.country || null,
    countryFlag: league.flag || null,
    season: league.season || null,
    round: matchDoc.round || null,
    stadium: matchDoc.stadium || null,
    venue: matchDoc.stadium || null,
    city: matchDoc.city || null,
    referee: matchDoc.referee || null,
    score: matchDoc.score || { home: null, away: null },
    goals: matchDoc.goals || { home: null, away: null },
    homeScore: matchDoc.homeScore ?? matchDoc.goals?.home ?? null,
    awayScore: matchDoc.awayScore ?? matchDoc.goals?.away ?? null,
    events: includeDetails && Array.isArray(matchDoc.events) ? matchDoc.events : [],
    statistics: includeDetails && Array.isArray(matchDoc.statistics) ? matchDoc.statistics : [],
    lineups: includeDetails && Array.isArray(matchDoc.lineups) ? matchDoc.lineups : [],
    players: includeDetails && Array.isArray(matchDoc.players) ? matchDoc.players : [],
    updatedAt: matchDoc.updatedAt
  };
};

const buildMatchQueryById = (fixtureId) => ({
  $or: [
    { fixtureId },
    { matchId: fixtureId },
    { apiMatchId: fixtureId }
  ]
});

const hydrateStoredMatchDetails = async (fixtureId, options = {}) => {
  const safeFixtureId = Number(fixtureId);
  if (!Number.isInteger(safeFixtureId)) {
    return { stored: null, events: [], statistics: [], lineups: [], players: [], updated: false };
  }

  const hydrationKey = `${safeFixtureId}:${options.force === true ? "force" : "default"}`;
  if (detailHydrationInFlight.has(hydrationKey)) {
    return detailHydrationInFlight.get(hydrationKey);
  }

  const hydrationPromise = (async () => {
    const existing = await Match.findOne(buildMatchQueryById(safeFixtureId))
      .select({ events: 1, statistics: 1, lineups: 1, players: 1 })
      .lean();

    if (!existing) {
      return { stored: null, events: [], statistics: [], lineups: [], players: [], updated: false };
    }

    const shouldFetchEvents = options.force === true || !Array.isArray(existing.events) || existing.events.length === 0;
    const shouldFetchStatistics = options.force === true || !Array.isArray(existing.statistics) || existing.statistics.length === 0;
    const shouldFetchLineups = options.force === true || !Array.isArray(existing.lineups) || existing.lineups.length === 0;
    const shouldFetchPlayers = options.force === true || !Array.isArray(existing.players) || existing.players.length === 0;

    if (!shouldFetchEvents && !shouldFetchStatistics && !shouldFetchLineups && !shouldFetchPlayers) {
      return {
        stored: existing,
        events: existing.events || [],
        statistics: existing.statistics || [],
        lineups: existing.lineups || [],
        players: existing.players || [],
        updated: false
      };
    }

    const [eventsResponse, statisticsResponse, lineupsResponse, playersResponse] = await Promise.all([
      shouldFetchEvents ? fetchFixtureEvents(safeFixtureId) : Promise.resolve(null),
      shouldFetchStatistics ? fetchFixtureStatistics(safeFixtureId) : Promise.resolve(null),
      shouldFetchLineups ? fetchFixtureLineups(safeFixtureId) : Promise.resolve(null),
      shouldFetchPlayers ? fetchFixturePlayers(safeFixtureId) : Promise.resolve(null)
    ]);

    const nextEvents = Array.isArray(eventsResponse)
      ? dedupeEventsById(eventsResponse.map(mapEventForStorage))
      : null;
    const nextStatistics = Array.isArray(statisticsResponse)
      ? statisticsResponse.map(mapStatistics)
      : null;
    const nextLineups = Array.isArray(lineupsResponse)
      ? lineupsResponse.map(mapLineup)
      : null;
    const nextPlayers = Array.isArray(playersResponse)
      ? playersResponse.map(mapFixturePlayers)
      : null;

    const updatePayload = {};

    if (Array.isArray(nextEvents) && nextEvents.length > 0) {
      updatePayload.events = nextEvents;
    }

    if (Array.isArray(nextStatistics) && nextStatistics.length > 0) {
      updatePayload.statistics = nextStatistics;
    }

    if (Array.isArray(nextLineups) && nextLineups.length > 0) {
      updatePayload.lineups = nextLineups;
    }

    if (Array.isArray(nextPlayers) && nextPlayers.length > 0) {
      updatePayload.players = nextPlayers;
    }

    if (Object.keys(updatePayload).length > 0) {
      updatePayload.updatedAt = new Date();
      await Match.findOneAndUpdate(
        buildMatchQueryById(safeFixtureId),
        { $set: updatePayload },
        { new: false }
      );
    }

    const stored = await Match.findOne(buildMatchQueryById(safeFixtureId))
      .select({ events: 1, statistics: 1, lineups: 1, players: 1 })
      .lean();

    return {
      stored,
      events: stored?.events || [],
      statistics: stored?.statistics || [],
      lineups: stored?.lineups || [],
      players: stored?.players || [],
      updated: Object.keys(updatePayload).length > 0
    };
  })().finally(() => {
    detailHydrationInFlight.delete(hydrationKey);
  });

  detailHydrationInFlight.set(hydrationKey, hydrationPromise);
  return hydrationPromise;
};

const findStoredMatchById = async (fixtureId) => {
  const match = await Match.findOne(buildMatchQueryById(fixtureId))
    .populate("homeTeamRef")
    .populate("awayTeamRef")
    .populate("leagueRef")
    .lean();

  return serializeMatch(match, { includeDetails: true });
};

const getMatchDetails = async (fixtureId) => {
  const fixture = await fetchFixtureById(fixtureId);
  if (fixture) {
    const transformed = transformFixture(fixture);
    await syncMatches([transformed], null, {
      emitUpdates: false,
      includeLiveEvents: true,
      includeLiveDetails: true,
      includeFinishedDetails: true
    });
  }

  await hydrateStoredMatchDetails(fixtureId, { force: false });
  const stored = await findStoredMatchById(fixtureId);
  if (stored) return stored;

  return findStoredMatchById(fixtureId);
};

const mapEventResponse = (event) => ({
  id: `${event?.time?.elapsed || 0}-${event?.team?.id || 0}-${event?.player?.id || 0}-${event?.type || "event"}-${event?.detail || ""}`,
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

const getMatchEvents = async (fixtureId) => {
  const hydrated = await hydrateStoredMatchDetails(fixtureId, { force: false });
  if (Array.isArray(hydrated?.events) && hydrated.events.length > 0) {
    return hydrated.events.map((event) => ({
      id: event?.eventId || `${event?.minute || 0}-${event?.teamId || 0}-${event?.playerId || 0}-${event?.type || "event"}`,
      minute: event?.minute ?? null,
      extraMinute: event?.extraMinute ?? null,
      team: {
        id: event?.teamId ?? null,
        name: event?.teamName || null,
        logo: null
      },
      player: {
        id: event?.playerId ?? null,
        name: event?.playerName || null
      },
      assist: {
        id: event?.assistId ?? null,
        name: event?.assistName || null
      },
      type: event?.type || null,
      detail: event?.detail || null,
      comments: event?.comments || null
    }));
  }

  return [];
};

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

const getMatchStatistics = async (fixtureId) => {
  const hydrated = await hydrateStoredMatchDetails(fixtureId, { force: false });
  return Array.isArray(hydrated?.statistics) ? hydrated.statistics : [];
};

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

const mapPlayerDetails = (player) => ({
  id: player?.player?.id ?? null,
  name: player?.player?.name || null,
  photo: player?.player?.photo || null
});

const mapPlayerStatisticsBlock = (stats = {}) => ({
  games: {
    minutes: stats?.games?.minutes ?? null,
    number: stats?.games?.number ?? null,
    position: stats?.games?.position || null,
    rating: stats?.games?.rating ?? null,
    captain: stats?.games?.captain ?? false,
    substitute: stats?.games?.substitute ?? false
  },
  offsides: stats?.offsides ?? null,
  shots: {
    total: stats?.shots?.total ?? null,
    on: stats?.shots?.on ?? null
  },
  goals: {
    total: stats?.goals?.total ?? null,
    conceded: stats?.goals?.conceded ?? null,
    assists: stats?.goals?.assists ?? null,
    saves: stats?.goals?.saves ?? null
  },
  passes: {
    total: stats?.passes?.total ?? null,
    key: stats?.passes?.key ?? null,
    accuracy: stats?.passes?.accuracy ?? null
  },
  tackles: {
    total: stats?.tackles?.total ?? null,
    blocks: stats?.tackles?.blocks ?? null,
    interceptions: stats?.tackles?.interceptions ?? null
  },
  duels: {
    total: stats?.duels?.total ?? null,
    won: stats?.duels?.won ?? null
  },
  dribbles: {
    attempts: stats?.dribbles?.attempts ?? null,
    success: stats?.dribbles?.success ?? null,
    past: stats?.dribbles?.past ?? null
  },
  fouls: {
    drawn: stats?.fouls?.drawn ?? null,
    committed: stats?.fouls?.committed ?? null
  },
  cards: {
    yellow: stats?.cards?.yellow ?? null,
    red: stats?.cards?.red ?? null
  },
  penalty: {
    won: stats?.penalty?.won ?? null,
    committed: stats?.penalty?.commited ?? stats?.penalty?.committed ?? null,
    scored: stats?.penalty?.scored ?? null,
    missed: stats?.penalty?.missed ?? null,
    saved: stats?.penalty?.saved ?? null
  }
});

const mapFixturePlayers = (teamEntry) => ({
  team: {
    id: teamEntry?.team?.id ?? null,
    name: teamEntry?.team?.name || null,
    logo: teamEntry?.team?.logo || null,
    colors: teamEntry?.team?.colors || null
  },
  players: Array.isArray(teamEntry?.players)
    ? teamEntry.players.map((player) => {
        const stats = Array.isArray(player?.statistics) ? player.statistics[0] || {} : {};
        return {
          player: mapPlayerDetails(player),
          statistics: mapPlayerStatisticsBlock(stats)
        };
      })
    : []
});

const getMatchLineups = async (fixtureId) => {
  const hydrated = await hydrateStoredMatchDetails(fixtureId, { force: false });
  return Array.isArray(hydrated?.lineups) ? hydrated.lineups : [];
};

const getMatchPlayers = async (fixtureId) => {
  const hydrated = await hydrateStoredMatchDetails(fixtureId, { force: false });
  return Array.isArray(hydrated?.players) ? hydrated.players : [];
};

const resolveLeagueIdByName = (leagueName) => {
  const target = String(leagueName || '').trim().toLowerCase();
  if (!target) return null;

  const match = Object.values(LEAGUES).find((league) => String(league.name || '').toLowerCase() === target);
  return match?.id || null;
};

const getLeagueStandings = async (leagueId, season = getCurrentSeason()) => {
  if (!leagueId) return [];

  const response = await fetchLeagueStandings(leagueId, season);
  const leaguePayload = response?.[0]?.league;
  const groupedStandings = Array.isArray(leaguePayload?.standings) ? leaguePayload.standings : [];

  return groupedStandings.flat().map((entry) => ({
    rank: entry?.rank ?? null,
    points: entry?.points ?? null,
    goalsDiff: entry?.goalsDiff ?? null,
    form: entry?.form || '',
    team: {
      id: entry?.team?.id ?? null,
      name: entry?.team?.name || null,
      logo: entry?.team?.logo || null,
    },
    all: {
      played: entry?.all?.played ?? null,
      win: entry?.all?.win ?? null,
      draw: entry?.all?.draw ?? null,
      lose: entry?.all?.lose ?? null,
      goals: {
        for: entry?.all?.goals?.for ?? null,
        against: entry?.all?.goals?.against ?? null,
      },
    },
    group: entry?.group || null,
    description: entry?.description || null,
  }));
};

const listMatches = async (query = {}, options = {}) => {
  const matches = await Match.find(query)
    .populate("homeTeamRef")
    .populate("awayTeamRef")
    .populate("leagueRef")
    .sort({ date: 1 })
    .lean();

  return matches.map((match) => serializeMatch(match, options));
};

const hydrateFinishedMatchesDetails = async (limit = 20) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const candidates = await Match.find({
    status: "finished",
    $or: [
      { "events.0": { $exists: false } },
      { "statistics.0": { $exists: false } },
      { "lineups.0": { $exists: false } },
      { "players.0": { $exists: false } }
    ]
  })
    .sort({ date: -1 })
    .limit(safeLimit)
    .select({ fixtureId: 1 })
    .lean();

  let processed = 0;
  let updated = 0;

  for (const item of candidates) {
    const fixtureId = item?.fixtureId;
    if (!fixtureId) continue;

    const [events, statistics, lineups, players] = await Promise.all([
      getMatchEvents(fixtureId),
      getMatchStatistics(fixtureId),
      getMatchLineups(fixtureId),
      getMatchPlayers(fixtureId)
    ]);

    processed += 1;
    if ((events?.length || 0) > 0 || (statistics?.length || 0) > 0 || (lineups?.length || 0) > 0 || (players?.length || 0) > 0) {
      updated += 1;
    }
  }

  return {
    success: true,
    processed,
    updated,
    remaining: await Match.countDocuments({
      status: "finished",
      $or: [
        { "events.0": { $exists: false } },
        { "statistics.0": { $exists: false } },
        { "lineups.0": { $exists: false } },
        { "players.0": { $exists: false } }
      ]
    })
  };
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
  getMatchPlayers,
  getLeagueStandings,
  resolveLeagueIdByName,
  findStoredMatchById,
  listMatches,
  hydrateFinishedMatchesDetails,
  getApiSportsStatus: () => ({
    offlineMode: API_SPORTS_OFFLINE_MODE,
    blocked: apiSportsBlockedUntil > Date.now(),
    blockedUntil: apiSportsBlockedUntil || null,
    lastError: apiSportsLastError,
  }),
  REFRESH_PAST_DAYS,
  REFRESH_FUTURE_DAYS,
  LEAGUES,
  LIVE_STATUSES
};
