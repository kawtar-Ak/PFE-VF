const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const AuthenticatedUser = require("../User/UserModel");

const router = express.Router();

const EMAIL_REGEX = /^(?!.*\s)(?!\.)(?!.*\.\.)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const USERNAME_REGEX = /^(?=.{3,20}$)[A-Za-z0-9._]+$/;
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "tempmail.com",
  "yopmail.com",
  "trashmail.com"
]);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Trop de tentatives. Reessayez dans quelques minutes.",
    errors: {
      global: "Limite de tentatives atteinte."
    }
  }
});

const normalizeEmail = (value = "") => value.trim().toLowerCase();
const normalizeUsername = (value = "") => value.trim();

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getPasswordAnalysis = (password = "") => {
  const criteria = {
    length: password.length >= 10,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':",.<>/?\\|~`]/.test(password)
  };

  const passedCount = Object.values(criteria).filter(Boolean).length;
  let strength = "FAIBLE";

  if (passedCount === 5) {
    strength = "FORT";
  } else if (passedCount >= 3) {
    strength = "MOYEN";
  }

  const missing = [];

  if (!criteria.length) missing.push("Au moins 10 caracteres");
  if (!criteria.lowercase) missing.push("Au moins une lettre minuscule");
  if (!criteria.uppercase) missing.push("Au moins une lettre majuscule");
  if (!criteria.digit) missing.push("Au moins un chiffre");
  if (!criteria.special) missing.push("Au moins un caractere special");

  return {
    strength,
    passedCount,
    missing,
    criteria
  };
};

const validateEmail = (email) => {
  if (!email) {
    return "Adresse email requise.";
  }

  if (/\s/.test(email)) {
    return "L'adresse email ne doit pas contenir d'espaces.";
  }

  if (!EMAIL_REGEX.test(email)) {
    return "Adresse email invalide.";
  }

  const domain = email.split("@")[1];
  if (!domain || !domain.includes(".")) {
    return "Adresse email invalide.";
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return "Les adresses email temporaires ne sont pas autorisees.";
  }

  return null;
};

const validateUsername = (username) => {
  if (!username) {
    return "Nom d'utilisateur requis.";
  }

  if (/\s/.test(username)) {
    return "Le nom d'utilisateur ne doit pas contenir d'espaces.";
  }

  if (!USERNAME_REGEX.test(username)) {
    return "Utilisez 3 a 20 caracteres: lettres, chiffres, points ou underscores.";
  }

  return null;
};

const buildValidationResponse = ({ message, errors = {}, strength = null, missing = [] }) => ({
  message,
  errors,
  strength,
  missing
});

const buildGoogleUsername = async (name, email, userIdSeed = "") => {
  const baseSource = (name || email.split("@")[0] || "user")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._]/g, "")
    .replace(/^\.+|\.+$/g, "");

  let candidate = (baseSource || "user").slice(0, 20);
  if (candidate.length < 3) {
    candidate = `${candidate}user`.slice(0, 20);
  }

  let suffix = 0;
  let uniqueCandidate = candidate;

  while (await AuthenticatedUser.findOne({ username: uniqueCandidate })) {
    const seed = String(userIdSeed || Date.now()).replace(/\D/g, "");
    const addon = seed.slice(-4) || String(suffix + 1);
    const trimmedBase = candidate.slice(0, Math.max(3, 20 - addon.length - 1));
    uniqueCandidate = `${trimmedBase}_${addon}`.slice(0, 20);
    suffix += 1;
  }

  return uniqueCandidate;
};

const signUserToken = (user) => jwt.sign(
  { id: user._id, email: user.email, username: user.username },
  process.env.JWT_SECRET || "fallback_secret_123",
  { expiresIn: "7d" }
);

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || "captcha_secret_fallback_123";
const CAPTCHA_EXPIRATION_SECONDS = Number(process.env.CAPTCHA_EXPIRATION_SECONDS || 300);
const CAPTCHA_LENGTH = 5;

const generateCaptchaCode = (length = CAPTCHA_LENGTH) => {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < length; i += 1) {
    const randomIndex = crypto.randomInt(0, charset.length);
    code += charset[randomIndex];
  }

  return code;
};

const hashCaptchaAnswer = (answer) => crypto
  .createHash("sha256")
  .update(String(answer || "").trim().toUpperCase())
  .digest("hex");

const buildCaptchaChallenge = () => {
  const code = generateCaptchaCode();
  const answerHash = hashCaptchaAnswer(code);
  const captchaId = jwt.sign(
    { answerHash },
    CAPTCHA_SECRET,
    { expiresIn: CAPTCHA_EXPIRATION_SECONDS }
  );

  return {
    captchaId,
    challenge: code
  };
};

const validateCaptcha = (captchaId, captchaAnswer) => {
  if (!captchaId || !captchaAnswer) {
    return { ok: false, message: "Captcha requis." };
  }

  try {
    const payload = jwt.verify(captchaId, CAPTCHA_SECRET);
    const providedHash = hashCaptchaAnswer(captchaAnswer);

    if (payload?.answerHash !== providedHash) {
      return { ok: false, message: "Captcha invalide." };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, message: "Captcha expire ou invalide." };
  }
};

router.get("/captcha", authLimiter, (req, res) => {
  const captchaData = buildCaptchaChallenge();
  return res.status(200).json(captchaData);
});

router.post("/register", authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password || "";

    const emailError = validateEmail(email);
    const usernameError = validateUsername(username);
    const passwordAnalysis = getPasswordAnalysis(password);
    const passwordError = passwordAnalysis.strength === "FAIBLE"
      ? "Mot de passe trop faible."
      : null;

    const errors = {};
    if (emailError) errors.email = emailError;
    if (usernameError) errors.username = usernameError;
    if (passwordError) errors.password = passwordError;

    if (Object.keys(errors).length > 0) {
      return res.status(400).json(buildValidationResponse({
        message: "Veuillez corriger les champs invalides.",
        errors,
        strength: passwordAnalysis.strength,
        missing: passwordAnalysis.missing
      }));
    }

    const existingUser = await AuthenticatedUser.findOne({ email });
    if (existingUser) {
      return res.status(409).json(buildValidationResponse({
        message: "Cette adresse email est deja utilisee.",
        errors: { email: "Cette adresse email est deja utilisee." },
        strength: passwordAnalysis.strength,
        missing: passwordAnalysis.missing
      }));
    }

    const existingUsername = await AuthenticatedUser.findOne({
      username: { $regex: `^${escapeRegex(username)}$`, $options: "i" }
    });

    if (existingUsername) {
      return res.status(409).json(buildValidationResponse({
        message: "Ce nom d'utilisateur est deja pris.",
        errors: { username: "Ce nom d'utilisateur est deja pris." },
        strength: passwordAnalysis.strength,
        missing: passwordAnalysis.missing
      }));
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new AuthenticatedUser({
      email,
      passwordHash,
      username,
      isGoogleUser: false
    });

    await newUser.save();

    const token = signUserToken(newUser);

    return res.status(201).json({
      message: "Utilisateur cree avec succes.",
      user: {
        id: newUser._id,
        email: newUser.email,
        username: newUser.username
      },
      token,
      strength: passwordAnalysis.strength,
      missing: []
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json(buildValidationResponse({
      message: "Erreur serveur.",
      errors: { global: error.message || "Erreur interne." }
    }));
  }
});

router.post("/login", authLimiter, async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body?.email);
  const password = req.body?.password || "";
  const captchaId = req.body?.captchaId;
  const captchaAnswer = req.body?.captchaAnswer;

  if (!normalizedEmail || !password) {
    return res.status(400).json(buildValidationResponse({
      message: "Email et mot de passe requis.",
      errors: {
        email: !normalizedEmail ? "Adresse email requise." : undefined,
        password: !password ? "Mot de passe requis." : undefined
      }
    }));
  }

  const captchaValidation = validateCaptcha(captchaId, captchaAnswer);
  if (!captchaValidation.ok) {
    return res.status(400).json(buildValidationResponse({
      message: captchaValidation.message,
      errors: {
        captcha: captchaValidation.message
      }
    }));
  }

  if (validateEmail(normalizedEmail)) {
    return res.status(400).json(buildValidationResponse({
      message: "Adresse email invalide.",
      errors: {
        email: "Adresse email invalide."
      }
    }));
  }

  try {
    const user = await AuthenticatedUser.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: "i" }
    });

    if (!user) {
      return res.status(401).json(buildValidationResponse({
        message: "Identifiants invalides.",
        errors: {
          credentials: "Email ou mot de passe incorrect."
        }
      }));
    }

    if (user.accountStatus !== "ACTIVE") {
      return res.status(403).json(buildValidationResponse({
        message: "Compte indisponible.",
        errors: {
          credentials: "Connexion impossible pour ce compte."
        }
      }));
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash || "");
    if (!isMatch) {
      return res.status(401).json(buildValidationResponse({
        message: "Identifiants invalides.",
        errors: {
          credentials: "Email ou mot de passe incorrect."
        }
      }));
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signUserToken(user);

    return res.status(200).json({
      message: "Connexion reussie.",
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        accountStatus: user.accountStatus || "ACTIVE"
      }
    });
  } catch (err) {
    console.error("Erreur login:", err);
    return res.status(500).json(buildValidationResponse({
      message: "Erreur serveur.",
      errors: {
        global: "Erreur interne."
      }
    }));
  }
});

router.post("/google-login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const name = normalizeUsername(req.body?.name);
  const googleId = req.body?.googleId;
  const photoUrl = req.body?.photoUrl || null;

  const emailError = validateEmail(email);

  if (!email || !name || !googleId || emailError) {
    return res.status(400).json(buildValidationResponse({
      message: "Donnees Google incompletes.",
      errors: {
        email: emailError || (!email ? "Adresse email requise." : undefined),
        username: !name ? "Nom requis." : undefined,
        global: !googleId ? "Identifiant Google manquant." : undefined
      }
    }));
  }

  try {
    let user = await AuthenticatedUser.findOne({ email });

    if (!user) {
      const generatedUsername = await buildGoogleUsername(name, email, googleId);
      const randomPassword = Math.random().toString(36).slice(-12);
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      user = new AuthenticatedUser({
        email,
        username: generatedUsername,
        passwordHash,
        isGoogleUser: true,
        picture: photoUrl
      });

      await user.save();
    } else {
      if (user.accountStatus !== "ACTIVE") {
        return res.status(403).json(buildValidationResponse({
          message: "Compte indisponible.",
          errors: {
            credentials: "Connexion impossible pour ce compte."
          }
        }));
      }

      user.isGoogleUser = true;
      user.picture = photoUrl || user.picture;
      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });
    }

    const token = signUserToken(user);

    return res.status(200).json({
      message: "Connexion via Google reussie.",
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        picture: user.picture,
        isGoogleUser: user.isGoogleUser,
        accountStatus: user.accountStatus || "ACTIVE"
      }
    });
  } catch (error) {
    console.error("Google login error:", error);
    return res.status(500).json(buildValidationResponse({
      message: "Erreur serveur lors de l'authentification Google.",
      errors: {
        global: "Erreur interne."
      }
    }));
  }
});

module.exports = router;
