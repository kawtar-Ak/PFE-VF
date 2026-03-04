import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { favoritesService } from '../../services/favoritesService';
import { matchService } from '../../services/matchService';
import TeamLogo from '../../components/TeamLogo';

export default function HomeScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const contentWidth = isWide ? 1120 : '100%';

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLeagues, setExpandedLeagues] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateRange, setDateRange] = useState([]);
  const [showAllLeagues, setShowAllLeagues] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLogged, setIsLogged] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const socketRef = useRef(null);

  useEffect(() => {
    generateDateRange();
    hydrateScreen();

    const unsubscribeFocus = navigation.addListener('focus', () => {
      refreshAuthAndFavorites();
    });

    const unsubscribeFavorites = favoritesService.subscribe(() => {
      refreshAuthAndFavorites();
    });

    return () => {
      unsubscribeFocus?.();
      unsubscribeFavorites?.();
    };
  }, [navigation]);

  useEffect(() => {
    const socket = matchService.createSocketConnection();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[socket] connected', socket.id);
    });

    socket.on('connect_error', (error) => {
      console.error('[socket] connect_error', error?.message || error);
    });

    socket.on('reconnect', (attempt) => {
      console.log('[socket] reconnected after', attempt, 'attempt(s)');
    });

    socket.on('match:update', (updatedMatch) => {
      setMatches((previousMatches) => {
        const nextMatches = matchService.mergeMatchIntoList(previousMatches, updatedMatch);

        setExpandedLeagues((previous) => {
          if (!updatedMatch?.league || previous[updatedMatch.league] !== undefined) {
            return previous;
          }

          return {
            ...previous,
            [updatedMatch.league]: true,
          };
        });

        return nextMatches;
      });
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('reconnect');
      socket.off('match:update');
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const hydrateScreen = async () => {
    await Promise.all([loadMatches(), refreshAuthAndFavorites()]);
  };

  const refreshAuthAndFavorites = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const logged = !!token;
    setIsLogged(logged);

    if (!logged) {
      setFavoriteIds(new Set());
      return;
    }

    const favorites = await favoritesService.getFavorites();
    setFavoriteIds(new Set((favorites || []).map((match) => match?._id).filter(Boolean)));
  };

  const generateDateRange = () => {
    const dates = [];
    const today = new Date();

    for (let index = -3; index < 5; index += 1) {
      const nextDate = new Date(today);
      nextDate.setDate(nextDate.getDate() + index);
      dates.push(nextDate);
    }

    setDateRange(dates);
  };

  const loadMatches = async (withImport = false) => {
    try {
      setLoading(true);

      if (withImport) {
        await matchService.importAllMatches();
      }

      const matchesData = await matchService.getAllMatches();
      const nextMatches = Array.isArray(matchesData) ? matchesData : [];
      setMatches(nextMatches);

      setExpandedLeagues((previous) => {
        const leagueMap = { ...previous };
        nextMatches.forEach((match) => {
          if (match?.league && leagueMap[match.league] === undefined) {
            leagueMap[match.league] = true;
          }
        });
        return leagueMap;
      });
    } catch (error) {
      console.error('Erreur chargement matchs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadMatches();
    refreshAuthAndFavorites();
  };

  const toggleLeague = (leagueName) => {
    setExpandedLeagues((previous) => ({
      ...previous,
      [leagueName]: !previous[leagueName],
    }));
  };

  const sameDay = (leftDate, rightDate) => {
    return (
      leftDate.getDate() === rightDate.getDate() &&
      leftDate.getMonth() === rightDate.getMonth() &&
      leftDate.getFullYear() === rightDate.getFullYear()
    );
  };

  const isToday = (date) => sameDay(date, new Date());
  const isSelected = (date) => sameDay(date, selectedDate);

  const formatDateDisplay = (date) => {
    const day = date.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase();
    const numericDay = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');

    if (isToday(date)) {
      return `${day}\nAUJ\n${numericDay}.${month}`;
    }

    return `${day}\n${numericDay}.${month}`;
  };

  const getMatchesForDate = (date) => {
    return matches.filter((match) => {
      const matchDate = new Date(match.date);
      return sameDay(matchDate, date);
    });
  };

  const filterMatches = (list) => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return list;
    }

    return list.filter((match) => {
      const homeTeam = String(match.homeTeam || '').toLowerCase();
      const awayTeam = String(match.awayTeam || '').toLowerCase();
      const league = String(match.league || '').toLowerCase();
      return homeTeam.includes(query) || awayTeam.includes(query) || league.includes(query);
    });
  };

  const filteredSections = useMemo(() => {
    const scopedMatches = showAllLeagues ? matches : getMatchesForDate(selectedDate);
    const searchedMatches = filterMatches(scopedMatches);
    const groupedMatches = {};

    searchedMatches.forEach((match) => {
      const league = match.league || 'Autre';
      if (!groupedMatches[league]) {
        groupedMatches[league] = [];
      }
      groupedMatches[league].push(match);
    });

    return Object.entries(groupedMatches)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([league, leagueMatches]) => ({
        title: league,
        data: expandedLeagues[league] === false ? [] : leagueMatches,
      }));
  }, [expandedLeagues, matches, searchQuery, selectedDate, showAllLeagues]);

  const scopedMatches = showAllLeagues ? matches : getMatchesForDate(selectedDate);
  const visibleMatchCount = filterMatches(scopedMatches).length;
  const totalMatchCount = matches.length;

  const closeSearch = () => {
    setSearchOpen(false);
    Keyboard.dismiss();
  };

  const handleProfilePress = async () => {
    const token = await AsyncStorage.getItem('userToken');

    if (!token) {
      navigation.getParent()?.navigate('Login', {
        redirectTo: 'Profile',
        message: 'Connectez-vous pour acceder a votre profil',
      });
      return;
    }

    navigation.getParent()?.navigate('Profile');
  };

  const handleToggleFavorite = async (match) => {
    if (!isLogged) {
      navigation.getParent()?.navigate('Login', {
        redirectTo: 'Home',
        message: 'Connectez-vous pour enregistrer des favoris',
      });
      return;
    }

    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (next.has(match._id)) next.delete(match._id);
      else next.add(match._id);
      return next;
    });

    const result = await favoritesService.toggleFavorite(match);
    if (!result?.ok) {
      refreshAuthAndFavorites();
    }
  };

  const goToDetails = (match) => {
    navigation.getParent()?.navigate('MatchDetails', { match });
  };

  const renderSectionHeader = ({ section: { title } }) => {
    const leagueMatches = filterMatches(scopedMatches).filter((match) => (match.league || 'Autre') === title).length;

    return (
      <TouchableOpacity style={styles.leagueHeader} onPress={() => toggleLeague(title)} activeOpacity={0.88}>
        <View style={styles.leagueHeaderLeft}>
          <Ionicons name={expandedLeagues[title] === false ? 'chevron-forward' : 'chevron-down'} size={18} color="#E8EEF8" />
          <Text style={styles.leagueTitle}>{title}</Text>
        </View>
        <Text style={styles.leagueCount}>{leagueMatches}</Text>
      </TouchableOpacity>
    );
  };

  const renderMatch = ({ item }) => {
    const matchDate = new Date(item.date);
    const timeLabel = matchDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const status = String(item.status || '').toUpperCase();
    const isLive = status === 'LIVE';
    const isFinished = status === 'FINISHED';
    const isFavorite = favoriteIds.has(item._id);

    let statusLabel = 'A VENIR';
    let badgeBackground = '#121C2E';
    let badgeColor = '#A9B6CC';
    let borderColor = '#2F6BFF';

    if (isLive) {
      statusLabel = 'LIVE';
      badgeBackground = '#3A1212';
      badgeColor = '#FF4D4D';
      borderColor = '#FF4D4D';
    } else if (isFinished) {
      statusLabel = 'TERMINE';
      badgeBackground = '#0E2E1A';
      badgeColor = '#34D399';
      borderColor = '#34D399';
    }

    return (
      <TouchableOpacity
        style={[styles.matchCard, { borderLeftColor: borderColor }]}
        activeOpacity={0.92}
        onPress={() => goToDetails(item)}
      >
        <View style={styles.matchTopRow}>
          <Text style={styles.matchTime}>{timeLabel}</Text>

          <View style={styles.matchActions}>
            <View style={[styles.badge, { backgroundColor: badgeBackground }]}>
              <Text style={[styles.badgeText, { color: badgeColor }]}>{statusLabel}</Text>
            </View>

            <TouchableOpacity
              style={styles.favoriteButton}
              activeOpacity={0.85}
              onPress={(event) => {
                event.stopPropagation();
                handleToggleFavorite(item);
              }}
            >
              <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={20} color={isFavorite ? '#FF4D4D' : '#A9B6CC'} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.matchContent}>
          <View style={styles.teamColumn}>
            <View style={[styles.teamRow, styles.teamRowHome]}>
              <TeamLogo uri={item.homeTeamLogo} size={24} />
              <Text style={[styles.teamName, styles.teamNameHome]} numberOfLines={1}>
                {item.homeTeam || 'Equipe locale'}
              </Text>
            </View>
          </View>

          <View style={styles.scoreColumn}>
            <Text style={[styles.score, isLive && styles.scoreLive]}>{isFinished || isLive ? item.homeScore ?? '-' : '-'}</Text>
            <Text style={styles.scoreSeparator}>-</Text>
            <Text style={[styles.score, isLive && styles.scoreLive]}>{isFinished || isLive ? item.awayScore ?? '-' : '-'}</Text>
          </View>

          <View style={styles.teamColumn}>
            <View style={[styles.teamRow, styles.teamRowAway]}>
              <Text style={[styles.teamName, styles.teamNameAway]} numberOfLines={1}>
                {item.awayTeam || 'Equipe visiteuse'}
              </Text>
              <TeamLogo uri={item.awayTeamLogo} size={24} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const stickyHeader = (
    <View style={styles.stickyWrap}>
      <View style={[styles.pageInner, { maxWidth: contentWidth }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateSelectorContent}
          keyboardShouldPersistTaps="handled"
        >
          {dateRange.map((date, index) => {
            const active = isSelected(date);
            return (
              <TouchableOpacity
                key={`${date.toISOString()}-${index}`}
                style={[styles.dateButton, active && styles.dateButtonActive]}
                onPress={() => setSelectedDate(date)}
                activeOpacity={0.9}
              >
                <Text style={[styles.dateText, active && styles.dateTextActive]}>{formatDateDisplay(date)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity style={styles.allGamesRow} onPress={() => setShowAllLeagues((value) => !value)} activeOpacity={0.88}>
          <View style={styles.allGamesLeft}>
            <Ionicons name="layers-outline" size={18} color="#E8EEF8" />
            <Text style={styles.allGamesTitle}>{showAllLeagues ? 'Tous les jours' : 'Jour selectionne'}</Text>
          </View>

          <View style={styles.countGroup}>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{visibleMatchCount}</Text>
            </View>
            <Text style={styles.totalCount}>{totalMatchCount}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={[styles.pageInner, { maxWidth: contentWidth }]}>
            <View style={styles.headerTop}>
              <View style={styles.headerLeft}>
                <Image source={require('../../img/result_0.jpeg')} style={styles.appLogo} resizeMode="cover" />
                <Text style={styles.headerTitle}>KICKLY</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF4D4D" />
          <Text style={styles.loadingText}>Chargement des matchs...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.pageInner, { maxWidth: contentWidth }]}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Image source={require('../../img/result_0.jpeg')} style={styles.appLogo} resizeMode="cover" />
              <Text style={styles.headerTitle}>KICKLY</Text>
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.headerButton} onPress={() => setSearchOpen((value) => !value)} activeOpacity={0.85}>
                <Ionicons name="search" size={19} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerButton} onPress={handleProfilePress} activeOpacity={0.85}>
                <Ionicons name="person" size={19} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {searchOpen ? (
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color="#A9B6CC" />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Equipe ou ligue"
                placeholderTextColor="#7F8AA3"
                returnKeyType="search"
              />
              <TouchableOpacity onPress={closeSearch} activeOpacity={0.85}>
                <Ionicons name="close-circle" size={20} color="#A9B6CC" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      <SectionList
        sections={filteredSections}
        keyExtractor={(item, index) => item._id || item.matchId?.toString() || item.apiMatchId?.toString() || `${item.homeTeam}-${item.awayTeam}-${index}`}
        renderItem={renderMatch}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={stickyHeader}
        stickyHeaderIndices={[0]}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF4D4D" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050B16',
  },
  list: {
    flex: 1,
  },
  pageInner: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
  },
  header: {
    backgroundColor: '#0B1220',
    borderBottomWidth: 1,
    borderBottomColor: '#15233A',
    paddingTop: Platform.OS === 'web' ? 10 : 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  appLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121C2E',
    borderWidth: 1,
    borderColor: '#15233A',
  },
  searchRow: {
    alignSelf: 'flex-end',
    width: '100%',
    maxWidth: 420,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#121C2E',
    borderWidth: 1,
    borderColor: '#15233A',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  stickyWrap: {
    backgroundColor: '#0B1220',
    borderBottomWidth: 1,
    borderBottomColor: '#15233A',
  },
  dateSelectorContent: {
    paddingVertical: 12,
    paddingRight: 8,
  },
  dateButton: {
    width: 92,
    height: 66,
    borderRadius: 16,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121C2E',
    borderWidth: 1,
    borderColor: '#15233A',
  },
  dateButtonActive: {
    backgroundColor: '#FF4D4D',
    borderColor: '#FF4D4D',
  },
  dateText: {
    color: '#A9B6CC',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 14,
  },
  dateTextActive: {
    color: '#FFFFFF',
  },
  allGamesRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#0F1828',
  },
  allGamesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allGamesTitle: {
    color: '#E8EEF8',
    fontSize: 15,
    fontWeight: '900',
  },
  countGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countPill: {
    minWidth: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FF4D4D',
    alignItems: 'center',
  },
  countPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  totalCount: {
    color: '#7F8AA3',
    fontSize: 13,
    fontWeight: '800',
  },
  listContent: {
    paddingBottom: 22,
  },
  leagueHeader: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0B1220',
    borderBottomWidth: 1,
    borderBottomColor: '#15233A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leagueHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  leagueTitle: {
    marginLeft: 8,
    color: '#E8EEF8',
    fontSize: 14,
    fontWeight: '900',
  },
  leagueCount: {
    color: '#7F8AA3',
    fontSize: 13,
    fontWeight: '800',
  },
  matchCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#15233A',
    borderLeftWidth: 4,
  },
  matchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  matchTime: {
    color: '#E8EEF8',
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
    borderColor: '#15233A',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  favoriteButton: {
    padding: 6,
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
    color: '#E8EEF8',
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
  scoreColumn: {
    minWidth: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    color: '#E8EEF8',
    fontSize: 18,
    fontWeight: '900',
  },
  scoreLive: {
    color: '#FF4D4D',
  },
  scoreSeparator: {
    marginHorizontal: 7,
    color: '#7F8AA3',
    fontSize: 12,
    fontWeight: '900',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#A9B6CC',
    fontSize: 15,
    fontWeight: '700',
  },
});
