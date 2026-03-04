const mongoose = require("mongoose");

const TeamScoreSchema = new mongoose.Schema({
  home: {
    type: Number,
    default: null
  },
  away: {
    type: Number,
    default: null
  }
}, { _id: false });

const MatchSchema = new mongoose.Schema({
  matchId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  apiMatchId: {
    type: Number,
    index: true
  },
  league: {
    type: String,
    required: true
  },
  leagueId: {
    type: Number,
    default: null
  },
  leagueCode: {
    type: String,
    default: null
  },
  leagueLogo: {
    type: String,
    default: null
  },
  country: {
    type: String,
    default: null
  },
  countryFlag: {
    type: String,
    default: null
  },
  season: {
    type: Number,
    default: null
  },
  round: {
    type: String,
    default: null
  },
  stadium: {
    type: String,
    default: null
  },
  venue: {
    type: String,
    default: null
  },
  city: {
    type: String,
    default: null
  },
  referee: {
    type: String,
    default: null
  },
  homeTeam: {
    type: String,
    required: true
  },
  homeTeamId: {
    type: Number,
    default: null
  },
  homeTeamLogo: {
    type: String,
    default: null
  },
  awayTeam: {
    type: String,
    required: true
  },
  awayTeamId: {
    type: Number,
    default: null
  },
  awayTeamLogo: {
    type: String,
    default: null
  },
  score: {
    type: TeamScoreSchema,
    default: () => ({})
  },
  homeScore: {
    type: Number,
    default: null
  },
  awayScore: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    enum: ["scheduled", "live", "finished"],
    default: "scheduled",
    index: true
  },
  statusShort: {
    type: String,
    default: null,
    index: true
  },
  minute: {
    type: Number,
    default: null
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Match", MatchSchema);
