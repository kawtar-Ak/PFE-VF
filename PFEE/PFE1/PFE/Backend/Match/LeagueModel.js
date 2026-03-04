const mongoose = require("mongoose");

const LeagueSchema = new mongoose.Schema({
  leagueId: {
    type: Number,
    required: true,
    index: true
  },
  season: {
    type: Number,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  country: {
    type: String,
    default: null
  },
  logo: {
    type: String,
    default: null
  },
  flag: {
    type: String,
    default: null
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

LeagueSchema.index({ leagueId: 1, season: 1 }, { unique: true });

module.exports = mongoose.model("League", LeagueSchema);
