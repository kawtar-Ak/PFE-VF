import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { matchService } from "../../services/matchService";
import { favoritesService } from "../../services/favoritesService";
import TeamLogo from "../../components/TeamLogo";
import LeagueLogo from "../../components/LeagueLogo";
import { getMatchPhase } from "../../utils/matchStatus";
import { BRAND_COLORS } from "../../src/theme/colors";

const LIVE_ACCENT = "#e84a5f";
const LIVE_BADGE_BG = "#ffe3e8";

const LIVE_WINDOW_PAST_MS = 2 * 60 * 60 * 1000;
const LIVE_WINDOW_FUTURE_MS = 4 * 60 * 60 * 1000;

const isLiveStatus = (match) => getMatchPhase(match) === "live";

const isInLiveWindow = (matchDate) => {
  const date = new Date(matchDate);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = Date.now();
  return date.getTime() >= now - LIVE_WINDOW_PAST_MS && date.getTime() <= now + LIVE_WINDOW_FUTURE_MS;
};

const normalizeLiveMatches = (matches) => {
  const liveOnly = Array.isArray(matches)
    ? matches.filter((match) => isLiveStatus(match) && isInLiveWindow(match.date))
    : [];

  return liveOnly.sort((left, right) => new Date(left.date) - new Date(right.date));
};

export default function LiveScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [expandedLeagues, setExpandedLeagues] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFavorites = async () => {
    try {
      const favs = await favoritesService.getFavorites();
      setFavorites(Array.isArray(favs) ? favs : []);
    } catch (error) {
      console.error("Erreur chargement favoris:", error);
    }
  };

  const loadLiveMatches = async () => {
    try {
      const liveMatches = await matchService.getLiveMatches();
      const nextMatches = normalizeLiveMatches(liveMatches);

      setMatches(nextMatches);
      setExpandedLeagues((previous) => {
        const nextExpanded = { ...previous };

        nextMatches.forEach((match) => {
          if (match?.league && nextExpanded[match.league] === undefined) {
            nextExpanded[match.league] = true;
          }
        });

        return nextExpanded;
      });
    } catch (error) {
      console.error("Erreur lors du chargement des matches:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLiveMatches();
    loadFavorites();

    const unsubFav = favoritesService.subscribe(() => {
      loadFavorites();
    });

    return () => {
      unsubFav?.();
    };
  }, []);

  useEffect(() => {
    const refreshIntervalMs = matches.length > 0 ? 30 * 1000 : 60 * 1000;
    const interval = setInterval(() => {
      loadLiveMatches();
    }, refreshIntervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [matches.length]);

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([loadLiveMatches(), loadFavorites()]).finally(() => {
      setRefreshing(false);
    });
  };

  const toggleLeague = (leagueName) => {
    setExpandedLeagues((previous) => ({
      ...previous,
      [leagueName]: !previous[leagueName],
    }));
  };

  const openLeagueCompetition = (league, leagueMeta) => {
    navigation?.getParent?.()?.navigate('LeagueCompetition', {
      league,
      leagueMeta: leagueMeta || { league },
    });
  };

  const grouped = useMemo(() => {
    const byLeague = {};

    matches.forEach((match) => {
      const league = match.league || "Autre";
      if (!byLeague[league]) byLeague[league] = [];
      byLeague[league].push(match);
    });

    return Object.entries(byLeague)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([league, leagueMatches]) => ({
        title: league,
        leagueMeta: leagueMatches[0] || { league },
        data: expandedLeagues[league] === false ? [] : leagueMatches,
      }));
  }, [expandedLeagues, matches]);

  const renderSectionHeader = ({ section: { title, leagueMeta } }) => (
    <TouchableOpacity
      style={styles.leagueHeader}
      onPress={() => openLeagueCompetition(title, leagueMeta)}
      onLongPress={() => toggleLeague(title)}
      activeOpacity={0.9}
    >
      <View style={styles.leagueHeaderLeft}>
        <Ionicons
          name="chevron-forward"
          size={20}
          color="#10243e"
        />
        <LeagueLogo source={leagueMeta} size={18} style={styles.leagueHeaderLogo} />
        <Text style={styles.leagueTitle} numberOfLines={1}>{title}</Text>
      </View>
      <Text style={styles.leagueCount}>
        {matches.filter((match) => (match.league || "Autre") === title).length}
      </Text>
    </TouchableOpacity>
  );

  const renderMatch = ({ item }) => {
    const matchDate = new Date(item.date);
    const timeStr = matchDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const isFavorite = favorites.some((fav) => fav?._id === item._id);

    const handleToggleFavorite = async () => {
      await favoritesService.toggleFavorite(item);
      await loadFavorites();
    };

    const goToDetails = () => {
      navigation?.getParent?.()?.navigate("MatchDetails", { match: item });
    };

    return (
      <TouchableOpacity activeOpacity={0.92} onPress={goToDetails} style={styles.matchCard}>
        <View style={styles.matchHeader}>
          <Text style={styles.matchTime}>{timeStr}</Text>

          <View style={styles.matchRightSection}>
            <View style={styles.liveBadge}>
              <Text style={styles.livePulse}>o</Text>
              <Text style={styles.liveText}>LIVE</Text>
            </View>

            <TouchableOpacity onPress={handleToggleFavorite} style={styles.favoriteButton} activeOpacity={0.85}>
              <Ionicons
                name={isFavorite ? "star" : "star-outline"}
                size={20}
                color={isFavorite ? LIVE_ACCENT : "#64748b"}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.matchContent}>
          <View style={styles.teamSection}>
            <View style={[styles.teamRow, styles.teamRowHome]}>
              <TeamLogo uri={item.homeTeamLogo} size={28} />
              <Text style={[styles.teamName, styles.teamNameHome]} numberOfLines={1}>{item.homeTeam}</Text>
            </View>
          </View>

          <View style={styles.scoreSection}>
            <Text style={[styles.score, styles.scoreLive]}>{item.homeScore ?? "-"}</Text>
            <Text style={styles.scoreSeparator}>-</Text>
            <Text style={[styles.score, styles.scoreLive]}>{item.awayScore ?? "-"}</Text>
          </View>

          <View style={styles.teamSection}>
            <View style={[styles.teamRow, styles.teamRowAway]}>
              <Text style={[styles.teamName, styles.teamNameAway]} numberOfLines={1}>{item.awayTeam}</Text>
              <TeamLogo uri={item.awayTeamLogo} size={28} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Matches en direct</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={LIVE_ACCENT} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>Matches en direct</Text>
          {matches.length > 0 ? <Text style={styles.liveDot}>o</Text> : null}
        </View>
      </View>

      {matches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="radio-outline" size={48} color="#64748b" />
          <Text style={styles.emptyText}>Aucun match en direct</Text>
        </View>
      ) : (
        <SectionList
          sections={grouped}
          keyExtractor={(item, index) => item._id || item.apiMatchId?.toString() || `${item.homeTeam}-${item.awayTeam}-${index}`}
          renderItem={renderMatch}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={LIVE_ACCENT} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7fc" },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#10243e",
    borderBottomWidth: 1,
    borderBottomColor: "#1f3a5a",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: "bold", color: "#ffffff" },
  liveDot: { color: LIVE_ACCENT, fontSize: 18, marginTop: 2 },

  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#5b6f86", fontSize: 16 },

  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { marginTop: 12, color: "#5b6f86", fontSize: 16 },

  listContent: { paddingVertical: 8 },

  leagueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#edf3fb",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d5dfec",
  },
  leagueHeaderLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 8 },
  leagueHeaderLogo: { backgroundColor: "#ffffff", borderWidth: 0 },
  leagueTitle: { fontSize: 15, fontWeight: "700", color: "#10243e", flex: 1 },
  leagueCount: {
    fontSize: 12,
    color: "#ffffff",
    backgroundColor: LIVE_ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontWeight: "700",
  },

  matchCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 10,
    marginVertical: 6,
    borderLeftWidth: 4,
    borderLeftColor: LIVE_ACCENT,
    borderWidth: 1,
    borderColor: "#d5dfec",
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  matchRightSection: { flexDirection: "row", alignItems: "center", gap: 8 },
  favoriteButton: { padding: 4 },
  matchTime: { fontSize: 14, fontWeight: "700", color: "#10243e" },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "#f5b6c1",
    backgroundColor: LIVE_BADGE_BG,
  },
  livePulse: { fontSize: 14, color: LIVE_ACCENT },
  liveText: { fontSize: 12, fontWeight: "900", color: LIVE_ACCENT },

  matchContent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  teamSection: { flex: 1 },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamRowHome: { justifyContent: "flex-start" },
  teamRowAway: { justifyContent: "flex-end" },
  teamName: { fontSize: 12, fontWeight: "700", color: "#10243e" },
  teamNameHome: { textAlign: "left", flex: 1 },
  teamNameAway: { textAlign: "right", flex: 1 },

  scoreSection: { flexDirection: "row", alignItems: "center", justifyContent: "center", minWidth: 72 },
  score: { fontSize: 18, fontWeight: "900" },
  scoreLive: { color: LIVE_ACCENT },
  scoreSeparator: { fontSize: 12, color: "#64748b", marginHorizontal: 8, fontWeight: "900" },
});


