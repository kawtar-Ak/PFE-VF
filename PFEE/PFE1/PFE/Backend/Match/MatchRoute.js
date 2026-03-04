const express = require("express");
const router = express.Router();
const Match = require("../Match/MatchModel");
const {
  importAllMatches,
  importLeagueMatches,
  pollLiveMatchesAndEmitUpdates,
  getSupportedLeagues
} = require("../Match/importService");

// GET all matches
router.get("/", async (req, res) => {
  try {
    const matches = await Match.find().sort({ date: 1 });
    res.status(200).json({ matches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET live matches only
router.get("/live", async (req, res) => {
  try {
    const matches = await Match.find({ status: "live" }).sort({ date: 1 });
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

    const matches = await Match.find({
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).sort({ date: 1 });

    res.status(200).json({ matches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET matches by league
router.get("/league/:league", async (req, res) => {
  try {
    const matches = await Match.find({ league: req.params.league }).sort({ date: 1 });
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

module.exports = router;
