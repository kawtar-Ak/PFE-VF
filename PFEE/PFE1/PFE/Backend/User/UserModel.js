const mongoose = require("mongoose");

const EMAIL_REGEX = /^(?!.*\s)(?!\.)(?!.*\.\.)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const USERNAME_REGEX = /^(?=.{3,20}$)[A-Za-z0-9._]+$/;

const NotificationSettingsSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: true
  },
  preMatch: {
    type: Boolean,
    default: true
  },
  matchStart: {
    type: Boolean,
    default: true
  },
  scoreChange: {
    type: Boolean,
    default: true
  },
  matchEnd: {
    type: Boolean,
    default: true
  },
  reminderMinutesBefore: {
    type: Number,
    default: 30,
    min: 5,
    max: 120
  }
}, { _id: false });

const PushTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    default: null
  },
  deviceName: {
    type: String,
    default: null
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  },
  active: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const FavoriteMatchSchema = new mongoose.Schema({
  fixtureId: {
    type: Number,
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  notifications: {
    preMatchSentAt: {
      type: Date,
      default: null
    },
    startedSentAt: {
      type: Date,
      default: null
    },
    finishedSentAt: {
      type: Date,
      default: null
    },
    lastScoreSignature: {
      type: String,
      default: null
    },
    lastScoreSentAt: {
      type: Date,
      default: null
    }
  }
}, { _id: false });

const AuthenticatedUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, "Email requis."],
    unique: true,
    index: true,
    trim: true,
    lowercase: true,
    match: [EMAIL_REGEX, "Adresse email invalide."]
  },

  passwordHash: {
    type: String,
    required: false
  },

  username: {
    type: String,
    required: [true, "Nom d'utilisateur requis."],
    unique: true,
    index: true,
    trim: true,
    minlength: [3, "Le nom d'utilisateur doit contenir au moins 3 caracteres."],
    maxlength: [20, "Le nom d'utilisateur ne doit pas depasser 20 caracteres."],
    match: [USERNAME_REGEX, "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, points et underscores."]
  },

  isGoogleUser: {
    type: Boolean,
    default: false
  },

  picture: {
    type: String,
    default: null
  },

  registrationDate: {
    type: Date,
    default: Date.now
  },

  lastLogin: {
    type: Date,
    default: null
  },

  accountStatus: {
    type: String,
    enum: ["ACTIVE", "SUSPENDED", "DELETED"],
    default: "ACTIVE"
  },

  preferences: {
    type: Object,
    default: {}
  },

  favoriteTeams: {
    type: [String],
    default: []
  },

  leaguesFollowed: {
    type: [String],
    default: []
  },

  notificationSettings: {
    type: NotificationSettingsSchema,
    default: () => ({})
  },

  pushTokens: {
    type: [PushTokenSchema],
    default: []
  },

  favoriteMatches: {
    type: [FavoriteMatchSchema],
    default: []
  }
}, {
  timestamps: true
});

AuthenticatedUserSchema.index({ "favoriteMatches.fixtureId": 1 });

module.exports = mongoose.model("AuthenticatedUser", AuthenticatedUserSchema);
