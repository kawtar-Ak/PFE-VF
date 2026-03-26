const jwt = require("jsonwebtoken");
const AuthenticatedUser = require("./UserModel");

const extractBearerToken = (headerValue = "") => {
  const [scheme, token] = String(headerValue).split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token.trim();
};

const requireAuth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req.headers?.authorization);

    if (!token) {
      return res.status(401).json({ error: "Authentification requise." });
    }

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret_123"
    );

    const user = await AuthenticatedUser.findById(payload?.id);
    if (!user || user.accountStatus !== "ACTIVE") {
      return res.status(401).json({ error: "Utilisateur invalide ou inactif." });
    }

    req.auth = {
      token,
      userId: String(user._id),
      user,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ error: "Session invalide ou expiree." });
  }
};

module.exports = {
  requireAuth,
};
