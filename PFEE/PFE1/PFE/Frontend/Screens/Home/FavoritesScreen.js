import React, { useEffect, useState } from 'react';
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

export default function FavoritesScreen({ navigation }) {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLeagues, setExpandedLeagues] = useState({});

  useEffect(() => {
    loadFavorites();

    const unsubscribeFocus = navigation.addListener('focus', () => {
      loadFavorites();
    });

    const unsubscribeFavorites = favoritesService.subscribe(() => {
      loadFavorites();
    });

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

  const toggleLeague = (leagueName) => {
    setExpandedLeagues((previous) => ({
      ...previous,
      [leagueName]: !previous[leagueName],
    }));
  };

  const openLeagueCompetition = (league, leagueMeta) => {
    navigation.getParent()?.navigate('LeagueCompetition', {
      league,
      leagueMeta: leagueMeta || { league },
    });
  };

  const removeFavorite = async (matchId) => {
    await favoritesService.removeFavorite(matchId);
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
        onPress={() => openLeagueCompetition(title, leagueMeta)}
        onLongPress={() => toggleLeague(title)}
        activeOpacity={0.88}
      >
        <View style={styles.leagueHeaderLeft}>
          <Ionicons name="chevron-forward" size={18} color="#10243e" />
          <LeagueLogo source={leagueMeta} size={18} style={styles.leagueHeaderLogo} />
          <Text style={styles.leagueTitle}>{title}</Text>
        </View>
        <Text style={styles.leagueCount}>{leagueCount}</Text>
      </TouchableOpacity>
    );
  };

  const renderMatch = ({ item }) => {
    const matchDate = new Date(item.date);
    const timeLabel = matchDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const phase = getMatchPhase(item);
    const isLive = phase === 'live';
    const isFinished = phase === 'finished';

    let statusLabel = 'A VENIR';
    let borderColor = '#2F6BFF';
    let badgeBackground = '#E2E8F0';
    let badgeColor = '#475569';

    if (isLive) {
      statusLabel = 'LIVE';
      borderColor = '#FF4D4D';
      badgeBackground = '#FEE2E2';
      badgeColor = '#FF4D4D';
    } else if (isFinished) {
      statusLabel = 'TERMINE';
      borderColor = '#34D399';
      badgeBackground = '#DCFCE7';
      badgeColor = '#34D399';
    }

    return (
      <TouchableOpacity
        style={[styles.matchCard, { borderLeftColor: borderColor }]}
        activeOpacity={0.92}
        onPress={() => navigation.getParent()?.navigate('MatchDetails', { match: item })}
      >
        <View style={styles.matchTopRow}>
          <Text style={styles.matchTime}>{timeLabel}</Text>
          <View style={styles.matchActions}>
            <View style={[styles.badge, { backgroundColor: badgeBackground }]}>
              <Text style={[styles.badgeText, { color: badgeColor }]}>{statusLabel}</Text>
            </View>
            <TouchableOpacity onPress={() => removeFavorite(item._id)} activeOpacity={0.85}>
              <Ionicons name="star" size={20} color="#FF4D4D" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.matchContent}>
          <View style={styles.teamColumn}>
            <View style={[styles.teamRow, styles.teamRowHome]}>
              <TeamLogo uri={item.homeTeamLogo} size={30} />
              <Text style={[styles.teamName, styles.teamNameHome]} numberOfLines={1}>
                {item.homeTeam || 'Equipe locale'}
              </Text>
            </View>
          </View>
          <View style={styles.scoreRow}>
            <Text style={[styles.score, isLive && styles.scoreLive]}>{isFinished || isLive ? item.homeScore ?? '-' : '-'}</Text>
            <Text style={styles.scoreSeparator}>-</Text>
            <Text style={[styles.score, isLive && styles.scoreLive]}>{isFinished || isLive ? item.awayScore ?? '-' : '-'}</Text>
          </View>
          <View style={styles.teamColumn}>
            <View style={[styles.teamRow, styles.teamRowAway]}>
              <Text style={[styles.teamName, styles.teamNameAway]} numberOfLines={1}>
                {item.awayTeam || 'Equipe visiteuse'}
              </Text>
              <TeamLogo uri={item.awayTeamLogo} size={30} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF4D4D" />
        <Text style={styles.loadingText}>Chargement des favoris...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Ionicons name="star" size={22} color="#0F172A" />
            <Text style={styles.headerTitle}>Favoris</Text>
          </View>
          <Text style={styles.headerCount}>{favorites.length}</Text>
        </View>
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="star-outline" size={48} color="#64748B" />
          <Text style={styles.emptyTitle}>Aucun favori</Text>
          <Text style={styles.emptyText}>Ajoutez un match depuis l'ecran principal pour le retrouver ici.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => item._id || `${item.homeTeam}-${item.awayTeam}-${index}`}
          renderItem={renderMatch}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF4D4D" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    marginLeft: 10,
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
  },
  headerCount: {
    color: '#FF4D4D',
    fontSize: 14,
    fontWeight: '900',
  },
  listContent: {
    paddingBottom: 22,
  },
  leagueHeader: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#edf3fb',
    borderBottomWidth: 1,
    borderBottomColor: '#d5dfec',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leagueHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  leagueHeaderLogo: {
    marginLeft: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
  },
  leagueTitle: {
    marginLeft: 8,
    color: '#10243e',
    fontSize: 14,
    fontWeight: '900',
  },
  leagueCount: {
    color: '#10243e',
    fontSize: 13,
    fontWeight: '800',
  },
  matchCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
  },
  matchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  matchTime: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
  },
  matchActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  matchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  teamColumn: {
    flex: 1,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamRowHome: {
    justifyContent: 'flex-start',
  },
  teamRowAway: {
    justifyContent: 'flex-end',
  },
  teamName: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  teamNameHome: {
    textAlign: 'left',
    flex: 1,
  },
  teamNameAway: {
    textAlign: 'right',
    flex: 1,
  },
  scoreRow: {
    minWidth: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '900',
  },
  scoreLive: {
    color: '#FF4D4D',
  },
  scoreSeparator: {
    marginHorizontal: 7,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '900',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyTitle: {
    marginTop: 12,
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
  },
  emptyText: {
    marginTop: 8,
    color: '#64748B',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    color: '#475569',
    fontSize: 15,
    fontWeight: '700',
  },
});

