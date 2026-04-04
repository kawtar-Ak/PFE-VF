import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { matchService } from '../../services/matchService';
import { favoritesService } from '../../services/favoritesService';
import TeamLogo from '../../components/TeamLogo';
import LeagueLogo from '../../components/LeagueLogo';
import { getMatchPhase } from '../../utils/matchStatus';
import { useAppTheme } from '../../src/theme/AppThemeContext';

const isLiveStatus = (match) => getMatchPhase(match) === 'live';

const normalizeLiveMatches = (matches) =>
  (Array.isArray(matches) ? matches.filter((match) => isLiveStatus(match)) : [])
    .sort((left, right) => new Date(left.date) - new Date(right.date));

export default function LiveScreen({ navigation }) {
  const { palette: C } = useAppTheme();
  const styles = useMemo(() => createStyles(C), [C]);
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
      console.error('Erreur chargement favoris:', error);
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
      console.error('Erreur lors du chargement des matches:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLiveMatches();
    loadFavorites();
    const unsubFav = favoritesService.subscribe(() => loadFavorites());
    return () => unsubFav?.();
  }, []);

  useEffect(() => {
    const refreshIntervalMs = matches.length > 0 ? 30 * 1000 : 60 * 1000;
    const interval = setInterval(() => loadLiveMatches(), refreshIntervalMs);
    return () => clearInterval(interval);
  }, [matches.length]);

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([loadLiveMatches(), loadFavorites()]).finally(() => setRefreshing(false));
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
      const league = match.league || 'Autre';
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
        <LeagueLogo source={leagueMeta} size={22} style={styles.leagueHeaderLogo} />
        <View style={styles.leagueTextWrap}>
          <Text style={styles.leagueTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.leagueCaption}>Live competition</Text>
        </View>
      </View>
      <View style={styles.leagueHeaderRight}>
        <Text style={styles.leagueCount}>
          {matches.filter((match) => (match.league || 'Autre') === title).length}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={C.muted} />
      </View>
    </TouchableOpacity>
  );

  const renderMatch = ({ item }) => {
    const matchDate = new Date(item.date);
    const timeStr = matchDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const isFavorite = favorites.some((fav) => fav?._id === item._id);

    return (
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => navigation?.getParent?.()?.navigate('MatchDetails', { match: item })}
        style={styles.matchCard}
      >
        <View style={styles.matchHeader}>
          <View style={styles.timePill}>
            <Ionicons name="time-outline" size={13} color={C.muted} />
            <Text style={styles.matchTime}>{timeStr}</Text>
          </View>

          <View style={styles.matchRightSection}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>

            <TouchableOpacity
              onPress={async () => {
                await favoritesService.toggleFavorite(item);
                await loadFavorites();
              }}
              style={styles.favoriteButton}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isFavorite ? 'star' : 'star-outline'}
                size={20}
                color={isFavorite ? C.accent : C.muted}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.matchContent}>
          <View style={styles.teamSection}>
            <View style={[styles.teamRow, styles.teamRowHome]}>
              <TeamLogo uri={item.homeTeamLogo} size={34} />
              <Text style={[styles.teamName, styles.teamNameHome]} numberOfLines={1}>{item.homeTeam}</Text>
            </View>
          </View>

          <View style={styles.scoreSection}>
            <Text style={styles.score}>{item.homeScore ?? '-'}</Text>
            <Text style={styles.scoreSeparator}>:</Text>
            <Text style={styles.score}>{item.awayScore ?? '-'}</Text>
          </View>

          <View style={styles.teamSection}>
            <View style={[styles.teamRow, styles.teamRowAway]}>
              <Text style={[styles.teamName, styles.teamNameAway]} numberOfLines={1}>{item.awayTeam}</Text>
              <TeamLogo uri={item.awayTeamLogo} size={34} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loadingText}>Chargement des matches en direct...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Stadium Live</Text>
        <View style={styles.heroTitleRow}>
          <Text style={styles.title}>Matches en direct</Text>
          {matches.length > 0 ? <View style={styles.heroPulse} /> : null}
        </View>
        <Text style={styles.heroSubtitle}>Tous les matchs chauds regroupes dans une vue immersive.</Text>
      </View>

      {matches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="radio-outline" size={48} color={C.muted} />
          <Text style={styles.emptyText}>Aucun match en direct</Text>
        </View>
      ) : (
        <SectionList
          sections={grouped}
          keyExtractor={(item, index) => item._id || item.apiMatchId?.toString() || `${item.homeTeam}-${item.awayTeam}-${index}`}
          renderItem={renderMatch}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} />}
        />
      )}
    </View>
  );
}

const createStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  hero: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: C.bg,
  },
  heroEyebrow: { color: C.accent, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '900', color: C.text },
  heroPulse: { width: 10, height: 10, borderRadius: 999, backgroundColor: C.live },
  heroSubtitle: { marginTop: 6, color: C.muted, fontSize: 13, fontWeight: '700' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: C.muted, fontSize: 16 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { marginTop: 12, color: C.muted, fontSize: 16, fontWeight: '700' },
  listContent: { paddingBottom: 24 },
  leagueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.panelAlt,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  leagueHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  leagueHeaderLogo: { backgroundColor: C.panel, borderWidth: 0, marginRight: 10 },
  leagueTextWrap: { flex: 1 },
  leagueTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  leagueCaption: { marginTop: 2, color: C.muted, fontSize: 11, fontWeight: '700' },
  leagueHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leagueCount: { fontSize: 13, color: C.accent, fontWeight: '800' },
  matchCard: {
    backgroundColor: C.panel,
    borderRadius: 22,
    padding: 14,
    marginHorizontal: 14,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.panelAlt,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  matchRightSection: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  favoriteButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.panelAlt,
  },
  matchTime: { fontSize: 13, fontWeight: '700', color: C.text },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
    backgroundColor: C.live,
  },
  liveDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: C.white },
  liveText: { fontSize: 11, fontWeight: '900', color: C.white },
  matchContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  teamSection: { flex: 1 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamRowHome: { justifyContent: 'flex-start' },
  teamRowAway: { justifyContent: 'flex-end' },
  teamName: { fontSize: 13, fontWeight: '800', color: C.text },
  teamNameHome: { textAlign: 'left', flex: 1 },
  teamNameAway: { textAlign: 'right', flex: 1 },
  scoreSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minWidth: 72 },
  score: { fontSize: 22, fontWeight: '900', color: C.accent },
  scoreSeparator: { fontSize: 14, color: C.muted, marginHorizontal: 8, fontWeight: '900' },
});
