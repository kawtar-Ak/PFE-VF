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

const MatchEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true
  },
  minute: {
    type: Number,
    default: null
  },
  extraMinute: {
    type: Number,
    default: null
  },
  teamId: {
    type: Number,
    default: null
  },
  teamName: {
    type: String,
    default: null
  },
  playerId: {
    type: Number,
    default: null
  },
  playerName: {
    type: String,
    default: null
  },
  assistId: {
    type: Number,
    default: null
  },
  assistName: {
    type: String,
    default: null
  },
  type: {
    type: String,
    default: null
  },
  detail: {
    type: String,
    default: null
  },
  comments: {
    type: String,
    default: null
  }
}, { _id: false });

const MatchSchema = new mongoose.Schema({
  fixtureId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  matchId: {
    type: Number,
    index: true
  },
  apiMatchId: {
    type: Number,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
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
  referee: {
    type: String,
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
  city: {
    type: String,
    default: null
  },
  homeTeamRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
    required: true,
    index: true
  },
  awayTeamRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
    required: true,
    index: true
  },
  leagueRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "League",
    required: true,
    index: true
  },
  goals: {
    type: TeamScoreSchema,
    default: () => ({})
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
  events: {
    type: [MatchEventSchema],
    default: []
  },
  statistics: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  lineups: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
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

MatchSchema.index({ status: 1, date: 1 });
MatchSchema.index({ leagueRef: 1, date: 1 });
MatchSchema.index({ homeTeamRef: 1, date: 1 });
MatchSchema.index({ awayTeamRef: 1, date: 1 });
MatchSchema.index({ updatedAt: -1 });

module.exports = mongoose.model("Match", MatchSchema);
