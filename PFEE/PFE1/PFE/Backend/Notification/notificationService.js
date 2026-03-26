const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchImpl }) => fetchImpl(...args));

const AuthenticatedUser = require("../User/UserModel");

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

const sanitizePushToken = (value) => String(value || "").trim();

const chunkMessages = (items = [], size = 100) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const buildScoreSignature = (match) => `${match?.homeScore ?? "-"}-${match?.awayScore ?? "-"}`;

const buildNotificationPayloads = ({ previousMatch, currentMatch, favoriteMatch, settings }) => {
  const payloads = [];
  const reminderMinutesBefore = Math.max(5, Number(settings?.reminderMinutesBefore) || 30);
  const matchDate = currentMatch?.date ? new Date(currentMatch.date) : null;
  const now = new Date();
  const scoreSignature = buildScoreSignature(currentMatch);
  const homeTeam = currentMatch?.homeTeam || "Equipe domicile";
  const awayTeam = currentMatch?.awayTeam || "Equipe exterieure";

  if (
    settings?.preMatch &&
    currentMatch?.status === "scheduled" &&
    matchDate &&
    matchDate > now &&
    matchDate.getTime() - now.getTime() <= reminderMinutesBefore * 60 * 1000 &&
    !favoriteMatch?.notifications?.preMatchSentAt
  ) {
    payloads.push({
      type: "preMatch",
      title: "Match favori bientot",
      body: `${homeTeam} - ${awayTeam} commence dans moins de ${reminderMinutesBefore} minutes.`,
      data: {
        fixtureId: currentMatch?.fixtureId,
        type: "preMatch",
      },
      update: {
        "favoriteMatches.$.notifications.preMatchSentAt": now,
      },
    });
  }

  if (
    settings?.matchStart &&
    currentMatch?.status === "live" &&
    previousMatch?.status !== "live" &&
    !favoriteMatch?.notifications?.startedSentAt
  ) {
    payloads.push({
      type: "matchStart",
      title: "Votre match favori a commence",
      body: `${homeTeam} - ${awayTeam} est maintenant en direct.`,
      data: {
        fixtureId: currentMatch?.fixtureId,
        type: "matchStart",
      },
      update: {
        "favoriteMatches.$.notifications.startedSentAt": now,
      },
    });
  }

  const previousScoreSignature = buildScoreSignature(previousMatch || {});
  if (
    settings?.scoreChange &&
    currentMatch?.status === "live" &&
    previousScoreSignature !== scoreSignature &&
    scoreSignature !== favoriteMatch?.notifications?.lastScoreSignature &&
    scoreSignature !== "-:-" &&
    scoreSignature !== "--"
  ) {
    payloads.push({
      type: "scoreChange",
      title: "Score mis a jour",
      body: `${homeTeam} ${currentMatch?.homeScore ?? "-"} - ${currentMatch?.awayScore ?? "-"} ${awayTeam}`,
      data: {
        fixtureId: currentMatch?.fixtureId,
        type: "scoreChange",
      },
      update: {
        "favoriteMatches.$.notifications.lastScoreSignature": scoreSignature,
        "favoriteMatches.$.notifications.lastScoreSentAt": now,
      },
    });
  }

  if (
    settings?.matchEnd &&
    currentMatch?.status === "finished" &&
    previousMatch?.status !== "finished" &&
    !favoriteMatch?.notifications?.finishedSentAt
  ) {
    payloads.push({
      type: "matchEnd",
      title: "Match termine",
      body: `${homeTeam} ${currentMatch?.homeScore ?? "-"} - ${currentMatch?.awayScore ?? "-"} ${awayTeam}`,
      data: {
        fixtureId: currentMatch?.fixtureId,
        type: "matchEnd",
      },
      update: {
        "favoriteMatches.$.notifications.finishedSentAt": now,
      },
    });
  }

  return payloads;
};

const postExpoMessages = async (messages) => {
  if (!messages.length) {
    return;
  }

  for (const chunk of chunkMessages(messages)) {
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error("Expo push error:", response.status, body);
      }
    } catch (error) {
      console.error("Expo push request failed:", error.message);
    }
  }
};

const notifyUsersForMatchUpdate = async ({ previousMatch, currentMatch }) => {
  const fixtureId = Number(currentMatch?.fixtureId || currentMatch?.matchId || currentMatch?.apiMatchId);
  if (!isPositiveInteger(fixtureId)) {
    return { sent: 0, users: 0 };
  }

  const users = await AuthenticatedUser.find({
    "favoriteMatches.fixtureId": fixtureId,
    "pushTokens.active": true,
  }).lean();

  if (!users.length) {
    return { sent: 0, users: 0 };
  }

  const outboundMessages = [];
  const userUpdates = [];

  users.forEach((user) => {
    const settings = {
      enabled: user?.notificationSettings?.enabled !== false,
      preMatch: user?.notificationSettings?.preMatch !== false,
      matchStart: user?.notificationSettings?.matchStart !== false,
      scoreChange: user?.notificationSettings?.scoreChange !== false,
      matchEnd: user?.notificationSettings?.matchEnd !== false,
      reminderMinutesBefore: user?.notificationSettings?.reminderMinutesBefore || 30,
    };

    if (!settings.enabled) {
      return;
    }

    const favoriteMatch = Array.isArray(user?.favoriteMatches)
      ? user.favoriteMatches.find((entry) => entry?.fixtureId === fixtureId)
      : null;

    if (!favoriteMatch) {
      return;
    }

    const userPayloads = buildNotificationPayloads({
      previousMatch,
      currentMatch,
      favoriteMatch,
      settings,
    });

    if (!userPayloads.length) {
      return;
    }

    const activeTokens = Array.isArray(user?.pushTokens)
      ? user.pushTokens
          .filter((tokenEntry) => tokenEntry?.active)
          .map((tokenEntry) => sanitizePushToken(tokenEntry?.token))
          .filter(Boolean)
      : [];

    if (!activeTokens.length) {
      return;
    }

    userPayloads.forEach((payload) => {
      activeTokens.forEach((token) => {
        outboundMessages.push({
          to: token,
          sound: "default",
          title: payload.title,
          body: payload.body,
          data: payload.data,
        });
      });

      userUpdates.push({
        userId: user._id,
        update: payload.update,
      });
    });
  });

  await postExpoMessages(outboundMessages);

  for (const item of userUpdates) {
    await AuthenticatedUser.updateOne(
      {
        _id: item.userId,
        "favoriteMatches.fixtureId": fixtureId,
      },
      {
        $set: item.update,
      }
    );
  }

  return {
    sent: outboundMessages.length,
    users: new Set(userUpdates.map((item) => String(item.userId))).size,
  };
};

module.exports = {
  notifyUsersForMatchUpdate,
};
