const express = require("express");
const router = express.Router();
const Match = require("../Match/MatchModel");
const {
  importAllMatches,
  importLeagueMatches,
  pollLiveMatchesAndEmitUpdates,
  getSupportedLeagues,
  getMatchDetails,
  getMatchEvents,
  getMatchStatistics,
  getMatchLineups,
  LIVE_STATUSES
} = require("../Match/importService");

const parseMatchId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const scoreMatchQuality = (match) => {
  const hasHomeLogo = Boolean(match?.homeTeamLogo);
  const hasAwayLogo = Boolean(match?.awayTeamLogo);
  const hasStatusShort = Boolean(match?.statusShort);
  const hasMatchId = Boolean(match?.matchId);
  const updatedAt = match?.updatedAt ? new Date(match.updatedAt).getTime() : 0;

  let score = 0;
  if (hasHomeLogo) score += 4;
  if (hasAwayLogo) score += 4;
  if (hasStatusShort) score += 2;
  if (hasMatchId) score += 1;

  return { score, updatedAt };
};

const dedupeMatches = (matches) => {
  const bestByKey = new Map();

  matches.forEach((match) => {
    const key = match?.matchId || match?.apiMatchId || String(match?._id);
    const currentBest = bestByKey.get(key);

    if (!currentBest) {
      bestByKey.set(key, match);
      return;
    }

    const nextQuality = scoreMatchQuality(match);
    const bestQuality = scoreMatchQuality(currentBest);

    if (
      nextQuality.score > bestQuality.score ||
      (nextQuality.score === bestQuality.score && nextQuality.updatedAt > bestQuality.updatedAt)
    ) {
      bestByKey.set(key, match);
    }
  });

  return [...bestByKey.values()].sort((left, right) => new Date(left.date) - new Date(right.date));
};

// GET all matches
router.get("/", async (req, res) => {
  try {
    const matches = await Match.find().sort({ date: 1 }).lean();
    res.status(200).json({ matches: dedupeMatches(matches) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET live matches only
router.get("/live", async (req, res) => {
  try {
    const matches = await Match.find({
      status: "live",
      statusShort: { $in: [...LIVE_STATUSES] }
    }).sort({ date: 1 }).lean();

    res.status(200).json({ matches: dedupeMatches(matches) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET matches by date
router.get("/by-date", async (req, res) => {
  try {
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ error: "Query param 'date' must be in YYYY-MM-DD format" });
    }

    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const matches = await Match.find({
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).sort({ date: 1 }).lean();

    res.status(200).json({ matches: dedupeMatches(matches) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET matches by league
router.get("/league/:league", async (req, res) => {
  try {
    const matches = await Match.find({ league: req.params.league }).sort({ date: 1 }).lean();
    res.status(200).json({ matches: dedupeMatches(matches) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET supported leagues
router.get("/import/leagues", async (req, res) => {
  try {
    const leagues = getSupportedLeagues();
    res.status(200).json({ leagues });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import all matches
router.post("/import/all", async (req, res) => {
  try {
    const result = await importAllMatches();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST poll live and emit updates
router.post("/import/live/poll", async (req, res) => {
  try {
    const result = await pollLiveMatchesAndEmitUpdates();
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import specific league
router.post("/import/:leagueCode", async (req, res) => {
  try {
    const result = await importLeagueMatches(req.params.leagueCode);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id/events", async (req, res) => {
  try {
    const matchId = parseMatchId(req.params.id);
    if (!matchId) {
      return res.status(400).json({ error: "Invalid match id" });
    }

    const events = await getMatchEvents(matchId);
    res.status(200).json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id/statistics", async (req, res) => {
  try {
    const matchId = parseMatchId(req.params.id);
    if (!matchId) {
      return res.status(400).json({ error: "Invalid match id" });
    }

    const statistics = await getMatchStatistics(matchId);
    res.status(200).json({ statistics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id/lineups", async (req, res) => {
  try {
    const matchId = parseMatchId(req.params.id);
    if (!matchId) {
      return res.status(400).json({ error: "Invalid match id" });
    }

    const lineups = await getMatchLineups(matchId);
    res.status(200).json({ lineups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const matchId = parseMatchId(req.params.id);
    if (!matchId) {
      return res.status(400).json({ error: "Invalid match id" });
    }

    const match = await getMatchDetails(matchId);
    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    res.status(200).json({ match });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
