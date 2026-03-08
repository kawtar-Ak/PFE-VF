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
  pollScheduledMatches
} = require("./Match/importService.js");
const { initSocket } = require("./socket.js");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/PFE";
const LIVE_POLL_INTERVAL_MS = Number(process.env.LIVE_POLL_INTERVAL_MS || 60000);
const SCHEDULED_POLL_INTERVAL_MS = Number(
  process.env.SCHEDULED_POLL_INTERVAL_MS ||
  process.env.MATCH_IMPORT_INTERVAL_MS ||
  300000
);
const ALLOWED_ORIGINS = String(process.env.CORS_ORIGINS || "http://localhost:8081,http://localhost:19006,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = initSocket(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
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

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected to", MONGO_URI);
    console.log("Live poll interval (ms):", LIVE_POLL_INTERVAL_MS);
    console.log("Scheduled import interval (ms):", SCHEDULED_POLL_INTERVAL_MS);
    console.log("Importing matches from API-Sports...");

    importAllMatches(io).catch((error) => {
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

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
