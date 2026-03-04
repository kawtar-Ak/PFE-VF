const express = require("express");
const router = express.Router();
const Match = require("./MatchModel");
const Team = require("./TeamModel");
const League = require("./LeagueModel");
const {
  importAllMatches,
  importLeagueMatches,
  pollLiveMatchesAndEmitUpdates,
  getSupportedLeagues,
  getMatchDetails,
  getMatchEvents,
  getMatchStatistics,
  getMatchLineups,
  listMatches,
  LIVE_STATUSES
} = require("../Match/importService");

const parseMatchId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

// GET DB integrity/health summary
router.get("/health/db", async (req, res) => {
  try {
    const [matchCount, teamCount, leagueCount] = await Promise.all([
      Match.countDocuments(),
      Team.countDocuments(),
      League.countDocuments()
    ]);

    const [missingHomeRef, missingAwayRef, missingLeagueRef] = await Promise.all([
      Match.countDocuments({ homeTeamRef: { $exists: false } }),
      Match.countDocuments({ awayTeamRef: { $exists: false } }),
      Match.countDocuments({ leagueRef: { $exists: false } })
    ]);

    const danglingHomeLookup = await Match.aggregate([
      { $match: { homeTeamRef: { $type: "objectId" } } },
      { $lookup: { from: "teams", localField: "homeTeamRef", foreignField: "_id", as: "homeTeamJoin" } },
      { $match: { homeTeamJoin: { $size: 0 } } },
      { $count: "count" }
    ]);

    const danglingAwayLookup = await Match.aggregate([
      { $match: { awayTeamRef: { $type: "objectId" } } },
      { $lookup: { from: "teams", localField: "awayTeamRef", foreignField: "_id", as: "awayTeamJoin" } },
      { $match: { awayTeamJoin: { $size: 0 } } },
      { $count: "count" }
    ]);

    const danglingLeagueLookup = await Match.aggregate([
      { $match: { leagueRef: { $type: "objectId" } } },
      { $lookup: { from: "leagues", localField: "leagueRef", foreignField: "_id", as: "leagueJoin" } },
      { $match: { leagueJoin: { $size: 0 } } },
      { $count: "count" }
    ]);

    const danglingHomeRef = danglingHomeLookup[0]?.count || 0;
    const danglingAwayRef = danglingAwayLookup[0]?.count || 0;
    const danglingLeagueRef = danglingLeagueLookup[0]?.count || 0;

    const issues =
      missingHomeRef +
      missingAwayRef +
      missingLeagueRef +
      danglingHomeRef +
      danglingAwayRef +
      danglingLeagueRef;

    res.status(200).json({
      ok: issues === 0,
      counts: {
        matches: matchCount,
        teams: teamCount,
        leagues: leagueCount
      },
      integrity: {
        missingRefs: {
          homeTeamRef: missingHomeRef,
          awayTeamRef: missingAwayRef,
          leagueRef: missingLeagueRef
        },
        danglingRefs: {
          homeTeamRef: danglingHomeRef,
          awayTeamRef: danglingAwayRef,
          leagueRef: danglingLeagueRef
        }
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET all matches
router.get("/", async (req, res) => {
  try {
    const matches = await listMatches();
    res.status(200).json({ matches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET live matches only
router.get("/live", async (req, res) => {
  try {
    const matches = await listMatches({
      status: "live",
      statusShort: { $in: [...LIVE_STATUSES] }
    });

    res.status(200).json({ matches });
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

    const matches = await listMatches({
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });

    res.status(200).json({ matches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET matches by league
router.get("/league/:league", async (req, res) => {
  try {
    const allMatches = await listMatches();
    const matches = allMatches.filter((match) => match.league === req.params.league);
    res.status(200).json({ matches });
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
