require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const userRoutes = require("./User/UserRoute.js");
const matchRoutes = require("./Match/MatchRoute.js");
const newsRoutes = require("./News/newsRoute");
const {
  importAllMatches,
  pollLiveMatchesAndEmitUpdates,
  pollScheduledMatches,
  REFRESH_PAST_DAYS,
  REFRESH_FUTURE_DAYS
} = require("./Match/importService.js");
const { initSocket } = require("./socket.js");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/PFE";
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
const LIVE_POLL_INTERVAL_MS = Number(process.env.LIVE_POLL_INTERVAL_MS || 60000);
const SCHEDULED_POLL_INTERVAL_MS = Number(
  process.env.SCHEDULED_POLL_INTERVAL_MS ||
  process.env.MATCH_IMPORT_INTERVAL_MS ||
  300000
);
const API_SPORTS_BACKGROUND_SYNC_ENABLED = readBooleanEnv("APISPORTS_BACKGROUND_SYNC_ENABLED", true);
const API_SPORTS_OFFLINE_MODE = readBooleanEnv("APISPORTS_OFFLINE_MODE", false);
const ALLOWED_ORIGINS = String(
  process.env.CORS_ORIGINS ||
  "http://localhost:8081,http://localhost:19006,http://localhost:3000,http://127.0.0.1:8081,http://127.0.0.1:19006,http://127.0.0.1:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = initSocket(server);

const isPrivateIpv4Host = (hostname = "") => {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  const match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
};

const isAllowedOrigin = (origin) => {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    const hostname = String(parsed.hostname || "").trim();

    if (!/^https?:$/.test(parsed.protocol)) {
      return false;
    }

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      isPrivateIpv4Host(hostname)
    );
  } catch (error) {
    return false;
  }
};

const isExistingKicklyServerRunning = async (port) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(2000)
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json().catch(() => null);
    return payload?.status === "Server is running";
  } catch (error) {
    return false;
  }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: false,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.set("trust proxy", 1);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Trop de requetes. Reessayez dans quelques minutes."
  }
});

app.use(globalLimiter);

app.use("/api/user", userRoutes);
app.use("/api/match", matchRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/news", newsRoutes);

app.get("/", (req, res) => {
  res.json({ status: "Server is running" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use by another process.`);
    process.exit(1);
    return;
  }

  console.error("Server error:", error);
  process.exit(1);
});

const startServer = async () => {
  if (await isExistingKicklyServerRunning(PORT)) {
    console.log(`Backend already running on port ${PORT}.`);
    return;
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    mongoose
      .connect(MONGO_URI)
      .then(() => {
        console.log("MongoDB connected to", MONGO_URI);
        console.log("Live poll interval (ms):", LIVE_POLL_INTERVAL_MS);
        console.log("Scheduled import interval (ms):", SCHEDULED_POLL_INTERVAL_MS);
        console.log("Refresh window (days):", {
          past: REFRESH_PAST_DAYS,
          future: REFRESH_FUTURE_DAYS
        });

        if (API_SPORTS_OFFLINE_MODE) {
          console.log("API-Sports offline mode enabled. Serving cached MongoDB data only.");
          return;
        }

        if (!API_SPORTS_BACKGROUND_SYNC_ENABLED) {
          console.log("API-Sports background sync disabled. Automatic imports and polling are paused.");
          return;
        }

        console.log("Refreshing current and upcoming matches from API-Sports...");
        importAllMatches(io, {
          pastDays: REFRESH_PAST_DAYS,
          futureDays: REFRESH_FUTURE_DAYS
        }).catch((error) => {
          console.error("Initial match import failed:", error);
        });

        setInterval(() => {
          pollLiveMatchesAndEmitUpdates(io).catch((error) => {
            console.error("Live polling failed:", error);
          });
        }, LIVE_POLL_INTERVAL_MS);

        setInterval(() => {
          pollScheduledMatches(io).catch((error) => {
            console.error("Scheduled polling failed:", error);
          });
        }, SCHEDULED_POLL_INTERVAL_MS);
      })
      .catch((err) => {
        console.error("MongoDB connection error:", err);
        process.exit(1);
      });
  });
};

startServer().catch((error) => {
  console.error("Startup error:", error);
  process.exit(1);
});
