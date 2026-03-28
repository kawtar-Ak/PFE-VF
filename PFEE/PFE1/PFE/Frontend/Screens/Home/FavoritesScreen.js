import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { favoritesService } from '../../services/favoritesService';
import LeagueLogo from '../../components/LeagueLogo';
import TeamLogo from '../../components/TeamLogo';
import { getMatchPhase } from '../../utils/matchStatus';
import { useAppTheme } from '../../src/theme/AppThemeContext';

export default function FavoritesScreen({ navigation }) {
  const { palette: C } = useAppTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLeagues, setExpandedLeagues] = useState({});

  useEffect(() => {
    loadFavorites();
    const unsubscribeFocus = navigation.addListener('focus', () => loadFavorites());
    const unsubscribeFavorites = favoritesService.subscribe(() => loadFavorites());
    return () => {
      unsubscribeFocus?.();
      unsubscribeFavorites?.();
    };
  }, [navigation]);

  const loadFavorites = async () => {
    try {
      const items = await favoritesService.getFavorites();
      const nextFavorites = Array.isArray(items) ? items : [];
      setFavorites(nextFavorites);
      setExpandedLeagues((previous) => {
        const next = { ...previous };
        nextFavorites.forEach((match) => {
          if (match?.league && next[match.league] === undefined) {
            next[match.league] = true;
          }
        });
        return next;
      });
    } catch (error) {
      console.error('Erreur chargement favoris:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadFavorites();
  };

  const sections = Object.entries(
    favorites.reduce((accumulator, match) => {
      const league = match.league || 'Autre';
      if (!accumulator[league]) accumulator[league] = [];
      accumulator[league].push(match);
      return accumulator;
    }, {})
  )
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([league, matches]) => ({
      title: league,
      leagueMeta: matches[0] || { league },
      data: expandedLeagues[league] === false ? [] : matches,
    }));

  const renderSectionHeader = ({ section: { title, leagueMeta } }) => {
    const leagueCount = favorites.filter((match) => (match.league || 'Autre') === title).length;
    return (
      <TouchableOpacity
        style={styles.leagueHeader}
        onPress={() => navigation.getParent()?.navigate('LeagueCompetition', { league: title, leagueMeta: leagueMeta || { league: title } })}
        onLongPress={() => setExpandedLeagues((previous) => ({ ...previous, [title]: !previous[title] }))}
        activeOpacity={0.88}
      >
        <View style={styles.leagueHeaderLeft}>
          <LeagueLogo source={leagueMeta} size={20} style={styles.leagueHeaderLogo} />
          <View style={styles.flex1}>
            <Text style={styles.leagueTitle}>{title}</Text>
            <Text style={styles.leagueSub}>Mes favoris</Text>
          </View>
        </View>
        <View style={styles.leagueHeaderRight}>
          <Text style={styles.leagueCount}>{leagueCount}</Text>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderMatch = ({ item }) => {
    const matchDate = new Date(item.date);
    const timeLabel = matchDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const phase = getMatchPhase(item);
    const isLive = phase === 'live';
    const isFinished = phase === 'finished';
    const statusLabel = isLive ? 'LIVE' : isFinished ? 'TERMINE' : 'A VENIR';

    return (
      <TouchableOpacity
        style={styles.matchCard}
        activeOpacity={0.92}
        onPress={() => navigation.getParent()?.navigate('MatchDetails', { match: item })}
      >
        <View style={styles.matchTopRow}>
          <View style={styles.timePill}>
            <Ionicons name="time-outline" size={13} color={C.muted} />
            <Text style={styles.matchTime}>{timeLabel}</Text>
          </View>
          <View style={styles.matchActions}>
            <View style={[styles.badge, isLive ? styles.badgeLive : isFinished ? styles.badgeFinished : styles.badgeScheduled]}>
              <Text style={[styles.badgeText, isLive ? styles.badgeLiveText : isFinished ? styles.badgeFinishedText : styles.badgeScheduledText]}>
                {statusLabel}
              </Text>
            </View>
            <TouchableOpacity onPress={() => favoritesService.removeFavorite(item._id)} activeOpacity={0.85} style={styles.favoriteButton}>
              <Ionicons name="star" size={20} color={C.accent} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.matchContent}>
          <View style={styles.teamColumn}>
            <View style={[styles.teamRow, styles.teamRowHome]}>
              <TeamLogo uri={item.homeTeamLogo} size={34} />
              <Text style={[styles.teamName, styles.teamNameHome]} numberOfLines={1}>{item.homeTeam || 'Equipe locale'}</Text>
            </View>
          </View>

          <View style={styles.scoreRow}>
            <Text style={[styles.score, isLive && styles.scoreLive]}>{isFinished || isLive ? item.homeScore ?? '-' : '-'}</Text>
            <Text style={styles.scoreSeparator}>:</Text>
            <Text style={[styles.score, isLive && styles.scoreLive]}>{isFinished || isLive ? item.awayScore ?? '-' : '-'}</Text>
          </View>

          <View style={styles.teamColumn}>
            <View style={[styles.teamRow, styles.teamRowAway]}>
              <Text style={[styles.teamName, styles.teamNameAway]} numberOfLines={1}>{item.awayTeam || 'Equipe visiteuse'}</Text>
              <TeamLogo uri={item.awayTeamLogo} size={34} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.loadingText}>Chargement des favoris...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Watchlist</Text>
        <View style={styles.heroRow}>
          <Ionicons name="star" size={22} color={C.accent} />
          <Text style={styles.headerTitle}>Favoris</Text>
        </View>
        <Text style={styles.headerCount}>{favorites.length} match(s) suivis</Text>
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="star-outline" size={48} color={C.muted} />
          <Text style={styles.emptyTitle}>Aucun favori</Text>
          <Text style={styles.emptyText}>Ajoute un match depuis l&apos;accueil pour le retrouver ici.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => item._id || `${item.homeTeam}-${item.awayTeam}-${index}`}
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
  hero: { paddingTop: 12, paddingBottom: 14, paddingHorizontal: 16 },
  heroEyebrow: { color: C.accent, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '900' },
  headerCount: { marginTop: 6, color: C.muted, fontSize: 13, fontWeight: '700' },
  listContent: { paddingBottom: 22 },
  leagueHeader: {
    marginTop: 8,
    marginHorizontal: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.panelAlt,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leagueHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  leagueHeaderLogo: { marginRight: 10, backgroundColor: C.panel, borderWidth: 0 },
  leagueTitle: { color: C.text, fontSize: 14, fontWeight: '900' },
  leagueSub: { marginTop: 2, color: C.muted, fontSize: 11, fontWeight: '700' },
  leagueHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leagueCount: { color: C.accent, fontSize: 13, fontWeight: '800' },
  matchCard: {
    marginHorizontal: 14,
    marginTop: 10,
    padding: 16,
    borderRadius: 20,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
  },
  matchTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: C.panelAlt,
  },
  matchTime: { color: C.text, fontSize: 14, fontWeight: '900' },
  matchActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '900' },
  badgeLive: { backgroundColor: C.live },
  badgeLiveText: { color: C.white },
  badgeFinished: { backgroundColor: 'rgba(54, 209, 124, 0.15)' },
  badgeFinishedText: { color: C.success },
  badgeScheduled: { backgroundColor: C.panelAlt },
  badgeScheduledText: { color: C.muted },
  favoriteButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.panelAlt, alignItems: 'center', justifyContent: 'center' },
  matchContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  teamColumn: { flex: 1 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamRowHome: { justifyContent: 'flex-start' },
  teamRowAway: { justifyContent: 'flex-end' },
  teamName: { color: C.text, fontSize: 14, fontWeight: '800' },
  teamNameHome: { textAlign: 'left', flex: 1 },
  teamNameAway: { textAlign: 'right', flex: 1 },
  scoreRow: { minWidth: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  score: { color: C.text, fontSize: 18, fontWeight: '900' },
  scoreLive: { color: C.accent },
  scoreSeparator: { marginHorizontal: 7, color: C.muted, fontSize: 12, fontWeight: '900' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyTitle: { marginTop: 12, color: C.text, fontSize: 20, fontWeight: '900' },
  emptyText: { marginTop: 8, color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  loadingText: { marginTop: 12, color: C.muted, fontSize: 15, fontWeight: '700' },
  flex1: { flex: 1 },
});
