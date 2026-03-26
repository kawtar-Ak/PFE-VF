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
import LeagueLogo from '../../components/LeagueLogo';
import { getMatchPhase } from '../../utils/matchStatus';

const COLORS = {
  first: '#f4f7fc',
  second: '#dde6f2',
  third: '#10243e',
  fourth: '#1f3a5a',
  accent: '#e84a5f',
  white: '#FFFFFF',
  textDark: '#13263d',
  textSoft: '#5b6f86',
  borderLight: '#d5dfec',
  cardBg: '#ffffff',
  successBg: '#e3f7ec',
  successText: '#1f7a4d',
  liveBg: '#ffe3e8',
  liveText: '#b32f45',
};

const startOfDay = (value) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const buildCalendarDateRange = (anchorDate) => {
  const dates = [];
  const baseDate = startOfDay(anchorDate || new Date());

  for (let index = -3; index < 5; index += 1) {
    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + index);
    dates.push(nextDate);
  }

  return dates;
};

const sameCalendarDay = (leftValue, rightValue) => {
  const leftDate = startOfDay(leftValue);
  const rightDate = startOfDay(rightValue);

  return (
    leftDate.getDate() === rightDate.getDate() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getFullYear() === rightDate.getFullYear()
  );
};

const getClosestMatchDate = (matches, referenceDate) => {
  const referenceDay = startOfDay(referenceDate);
  const sortedDays = getAvailableMatchDays(matches);
  if (sortedDays.length === 0) {
    return referenceDay;
  }

  const exactMatch = sortedDays.find((day) => sameCalendarDay(day, referenceDay));
  if (exactMatch) {
    return exactMatch;
  }

  return sortedDays.reduce((closestDay, currentDay) => {
    const currentDistance = Math.abs(currentDay.getTime() - referenceDay.getTime());
    const closestDistance = Math.abs(closestDay.getTime() - referenceDay.getTime());

    if (currentDistance < closestDistance) {
      return currentDay;
    }

    // In case of tie, prefer the future date so upcoming matches stay visible.
    if (currentDistance === closestDistance && currentDay.getTime() > closestDay.getTime()) {
      return currentDay;
    }

    return closestDay;
  }, sortedDays[0]);
};

const getAvailableMatchDays = (matches) => {
  const uniqueDays = new Map();

  matches.forEach((match) => {
    const matchDate = new Date(match?.date);
    if (Number.isNaN(matchDate.getTime())) {
      return;
    }

    const day = startOfDay(matchDate);
    uniqueDays.set(day.getTime(), day);
  });

  return [...uniqueDays.values()].sort((left, right) => left - right);
};

const buildDateRange = (matches, anchorDate) => {
  const sortedDays = getAvailableMatchDays(matches);
  if (sortedDays.length === 0) {
    return buildCalendarDateRange(anchorDate);
  }

  const closestDate = getClosestMatchDate(matches, anchorDate);
  const centerIndex = Math.max(0, sortedDays.findIndex((day) => sameCalendarDay(day, closestDate)));
  const windowSize = 8;

  let startIndex = Math.max(0, centerIndex - 3);
  let endIndex = Math.min(sortedDays.length, startIndex + windowSize);

  if (endIndex - startIndex < windowSize) {
    startIndex = Math.max(0, endIndex - windowSize);
  }

  return sortedDays.slice(startIndex, endIndex);
};

export default function HomeScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const contentWidth = isWide ? 1120 : '100%';
  const useStaticDateRow = width >= 900;

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
  const [matchesError, setMatchesError] = useState('');
  const socketRef = useRef(null);

  useEffect(() => {
    setDateRange(buildCalendarDateRange(new Date()));
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
    let lastConnectErrorAt = 0;

    socket.on('connect', () => {
      console.log('[socket] connected', socket.id);
    });

    socket.on('connect_error', (error) => {
      const now = Date.now();
      if (now - lastConnectErrorAt > 15000) {
        lastConnectErrorAt = now;
        console.warn('[socket] backend indisponible:', error?.message || error);
      }
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

  const loadMatches = async (withImport = false) => {
    try {
      setLoading(true);
      setMatchesError('');

      if (withImport) {
        await matchService.importAllMatches();
      }

      const { matches: matchesData, error } = await matchService.getAllMatchesState();
      setMatchesError(error);

      if (error) {
        return;
      }

      const nextMatches = Array.isArray(matchesData) ? matchesData : [];
      setMatches(nextMatches);

      const closestAvailableDate = getClosestMatchDate(nextMatches, selectedDate);
      if (!sameCalendarDay(closestAvailableDate, selectedDate)) {
        setSelectedDate(closestAvailableDate);
        setDateRange(buildDateRange(nextMatches, closestAvailableDate));
      } else {
        setDateRange(buildDateRange(nextMatches, selectedDate));
      }

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
      setMatchesError('Impossible de charger les matchs pour le moment.');
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
    return sameCalendarDay(leftDate, rightDate);
  };

  const isToday = (date) => sameDay(date, new Date());
  const isSelected = (date) => sameDay(date, selectedDate);

  const formatDateDisplay = (date) => {
    const day = date.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase().replace('.', '');
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
        leagueMeta: leagueMatches[0] || { league },
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

  const handleLoginPress = () => {
    navigation.getParent()?.navigate('Login', {
      redirectTo: 'Home',
      message: 'Connectez-vous pour continuer',
    });
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

  const openLeagueCompetition = (league, leagueMeta) => {
    navigation.getParent()?.navigate('LeagueCompetition', {
      league,
      leagueMeta: leagueMeta || { league },
    });
  };

  const renderSectionHeader = ({ section: { title, leagueMeta } }) => {
    const leagueMatches = filterMatches(scopedMatches).filter(
      (match) => (match.league || 'Autre') === title
    ).length;

    return (
      <TouchableOpacity
        style={styles.leagueHeader}
        onPress={() => openLeagueCompetition(title, leagueMeta)}
        onLongPress={() => toggleLeague(title)}
        activeOpacity={0.9}
      >
        <View style={styles.leagueHeaderLeft}>
          <View style={styles.chevronWrap}>
            <Ionicons name="chevron-forward" size={17} color={COLORS.third} />
          </View>

          <LeagueLogo source={leagueMeta} size={22} style={styles.leagueHeaderLogo} />

          <Text style={styles.leagueTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>

        <View style={styles.leagueCountWrap}>
          <Text style={styles.leagueCount}>{leagueMatches}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMatch = ({ item }) => {
    const matchDate = new Date(item.date);
    const timeLabel = matchDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const phase = getMatchPhase(item);
    const isLive = phase === 'live';
    const isFinished = phase === 'finished';
    const isScheduled = !isLive && !isFinished;
    const isFavorite = favoriteIds.has(item._id);
    const matchMeta = [
      item?.round || null,
      item?.stadium || item?.venue || null,
      item?.city || null,
    ].filter(Boolean).join(' • ');

    let statusLabel = 'A VENIR';
    let badgeContainerStyle = [styles.badge, styles.badgeScheduled];
    let badgeTextStyle = [styles.badgeText, styles.badgeScheduledText];
    let scoreTextStyle = styles.score;

    if (isLive) {
      statusLabel = 'LIVE';
      badgeContainerStyle = [styles.badge, styles.badgeLive];
      badgeTextStyle = [styles.badgeText, styles.badgeLiveText];
      scoreTextStyle = [styles.score, styles.scoreLive];
    } else if (isFinished) {
      statusLabel = 'TERMINE';
      badgeContainerStyle = [styles.badge, styles.badgeFinished];
      badgeTextStyle = [styles.badgeText, styles.badgeFinishedText];
    }

    return (
      <TouchableOpacity
        style={styles.matchCard}
        activeOpacity={0.93}
        onPress={() => goToDetails(item)}
      >
        <View style={styles.matchTopRow}>
          <View style={styles.timePill}>
            <Ionicons name="time-outline" size={14} color={COLORS.textSoft} />
            <Text style={styles.matchTime}>{timeLabel}</Text>
          </View>

          <View style={styles.matchActions}>
            <View style={badgeContainerStyle}>
              <Text style={badgeTextStyle}>{statusLabel}</Text>
            </View>

            <TouchableOpacity
              style={styles.favoriteButton}
              activeOpacity={0.85}
              onPress={(event) => {
                event.stopPropagation();
                handleToggleFavorite(item);
              }}
            >
              <Ionicons
                name={isFavorite ? 'star' : 'star-outline'}
                size={20}
                color={isFavorite ? COLORS.accent : COLORS.textSoft}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.matchContent}>
          <View style={styles.teamColumn}>
            <View style={[styles.teamRow, styles.teamRowHome]}>
              <TeamLogo uri={item.homeTeamLogo} size={34} />
              <Text style={[styles.teamName, styles.teamNameHome]} numberOfLines={1}>
                {item.homeTeam || 'Equipe locale'}
              </Text>
            </View>
          </View>

          <View style={styles.scoreColumn}>
            {isScheduled ? (
              <Text style={styles.scoreScheduledLabel}>VS</Text>
            ) : (
              <View style={styles.scoreRowInline}>
                <Text style={scoreTextStyle}>
                  {item.homeScore ?? '-'}
                </Text>
                <Text style={styles.scoreSeparator}>-</Text>
                <Text style={scoreTextStyle}>
                  {item.awayScore ?? '-'}
                </Text>
              </View>
            )}
            {!!matchMeta && (
              <Text style={styles.matchMetaText} numberOfLines={2}>
                {matchMeta}
              </Text>
            )}
          </View>

          <View style={styles.teamColumn}>
            <View style={[styles.teamRow, styles.teamRowAway]}>
              <Text style={[styles.teamName, styles.teamNameAway]} numberOfLines={1}>
                {item.awayTeam || 'Equipe visiteuse'}
              </Text>
              <TeamLogo uri={item.awayTeamLogo} size={34} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const stickyHeader = (
    <View style={styles.stickyWrap}>
      <View style={styles.pageInnerFull}>
        {useStaticDateRow ? (
          <View style={styles.dateSelectorRowStatic}>
            {dateRange.map((date, index) => {
              const active = isSelected(date);

              return (
                <TouchableOpacity
                  key={`${date.toISOString()}-${index}`}
                  style={[styles.dateButton, styles.dateButtonExpanded, active && styles.dateButtonActive]}
                  onPress={() => setSelectedDate(date)}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.dateText, active && styles.dateTextActive]}>
                    {formatDateDisplay(date)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
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
                  <Text style={[styles.dateText, active && styles.dateTextActive]}>
                    {formatDateDisplay(date)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <TouchableOpacity
          style={styles.allGamesRow}
          onPress={() => setShowAllLeagues((value) => !value)}
          activeOpacity={0.9}
        >
          <View style={styles.allGamesLeft}>
            <View style={styles.allGamesIconWrap}>
              <Ionicons name="layers-outline" size={18} color={COLORS.third} />
            </View>

            <View style={styles.allGamesTextWrap}>
              <Text style={styles.allGamesTitle}>
                {showAllLeagues ? 'Tous les jours' : 'Jour selectionne'}
              </Text>
              <Text style={styles.allGamesSubtitle}>
                {showAllLeagues ? 'Vue globale des matchs' : 'Affichage par date'}
              </Text>
            </View>
          </View>

          <View style={styles.countGroup}>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{visibleMatchCount}</Text>
            </View>
            <Text style={styles.totalCount}>/ {totalMatchCount}</Text>
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
                <Image
                  source={require('../../img/result_0.jpeg')}
                  style={styles.appLogo}
                  resizeMode="cover"
                />
                <Text style={styles.headerTitle}>KICKLY</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
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
              <Image
                source={require('../../img/result_0.jpeg')}
                style={styles.appLogo}
                resizeMode="cover"
              />
              <Text style={styles.headerTitle}>KICKLY</Text>
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setSearchOpen((value) => !value)}
                activeOpacity={0.85}
              >
                <Ionicons name="search" size={19} color={COLORS.white} />
              </TouchableOpacity>

              {isLogged ? (
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleProfilePress}
                  activeOpacity={0.85}
                >
                  <Ionicons name="person" size={19} color={COLORS.white} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.loginCta}
                  onPress={handleLoginPress}
                  activeOpacity={0.88}
                >
                  <Text style={styles.loginCtaText}>Se connecter</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {searchOpen ? (
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color={COLORS.textSoft} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Equipe ou ligue"
                placeholderTextColor={COLORS.textSoft}
                returnKeyType="search"
              />
              <TouchableOpacity onPress={closeSearch} activeOpacity={0.85}>
                <Ionicons name="close-circle" size={20} color={COLORS.textSoft} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      <SectionList
        sections={filteredSections}
        keyExtractor={(item, index) =>
          item._id ||
          item.matchId?.toString() ||
          item.apiMatchId?.toString() ||
          `${item.homeTeam}-${item.awayTeam}-${index}`
        }
        renderItem={renderMatch}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={stickyHeader}
        stickyHeaderIndices={[0]}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons
              name={matchesError ? 'alert-circle-outline' : 'football-outline'}
              size={40}
              color={matchesError ? COLORS.accent : COLORS.textSoft}
            />
            <Text style={styles.emptyTitle}>
              {matchesError ? 'Backend indisponible' : 'Aucun match trouve'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {matchesError || 'Essaie une autre date ou une autre recherche.'}
            </Text>
            {matchesError ? (
              <TouchableOpacity
                style={styles.emptyRetryButton}
                onPress={() => loadMatches()}
                activeOpacity={0.88}
              >
                <Text style={styles.emptyRetryText}>Reessayer</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />

      {matchesError && matches.length > 0 ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color="#B3263D" />
          <Text style={styles.errorText}>{matchesError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadMatches()}>
            <Text style={styles.retryText}>Reessayer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.first,
  },

  list: {
    flex: 1,
  },

  pageInner: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 12,
  },
  pageInnerFull: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 0,
  },

  header: {
    backgroundColor: COLORS.third,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    paddingHorizontal: 0,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.fourth,
  },

  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  appLogo: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },

  headerTitle: {
    marginLeft: 12,
    color: COLORS.white,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0.4,
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
    backgroundColor: COLORS.fourth,
  },

  loginCta: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },

  loginCtaText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '900',
  },

  searchRow: {
    width: '100%',
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.second,
  },

  searchInput: {
    flex: 1,
    color: COLORS.third,
    fontSize: 14,
    fontWeight: '700',
  },

  stickyWrap: {
    backgroundColor: COLORS.first,
    paddingTop: 10,
    paddingBottom: 2,
  },

  dateSelectorContent: {
    paddingVertical: 8,
    paddingRight: 8,
  },
  dateSelectorRowStatic: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginHorizontal: 0,
  },

  dateButton: {
    width: 96,
    height: 82,
    borderRadius: 20,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.second,
    shadowColor: COLORS.third,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  dateButtonExpanded: {
    flex: 1,
    minWidth: 0,
    width: undefined,
    marginRight: 0,
    borderRadius: 0,
  },

  dateButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },

  dateText: {
    color: COLORS.third,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 17,
  },

  dateTextActive: {
    color: COLORS.white,
  },

  allGamesRow: {
    marginTop: 10,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.second,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: COLORS.third,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },

  allGamesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  allGamesTextWrap: {
    flex: 1,
  },

  allGamesIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.first,
    borderWidth: 1,
    borderColor: COLORS.second,
  },

  allGamesTitle: {
    color: COLORS.third,
    fontSize: 17,
    fontWeight: '900',
  },

  allGamesSubtitle: {
    marginTop: 3,
    color: COLORS.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },

  countGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  countPill: {
    minWidth: 54,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  countPillText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '900',
  },

  totalCount: {
    color: COLORS.textSoft,
    fontSize: 14,
    fontWeight: '800',
  },

  listContent: {
    paddingBottom: 28,
  },

  leagueHeader: {
    marginTop: 14,
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#edf3fb',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.second,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: COLORS.third,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },

  leagueHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  chevronWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.second,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  leagueHeaderLogo: {
    marginRight: 10,
    backgroundColor: COLORS.white,
    borderWidth: 0,
  },

  leagueTitle: {
    flex: 1,
    color: COLORS.third,
    fontSize: 15,
    fontWeight: '900',
  },

  leagueCountWrap: {
    minWidth: 42,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLORS.fourth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  leagueCount: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '900',
  },

  matchCard: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.third,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },

  matchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.first,
    borderWidth: 1,
    borderColor: COLORS.second,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },

  matchTime: {
    color: COLORS.third,
    fontSize: 12,
    fontWeight: '900',
  },

  matchActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  badgeText: {
    fontSize: 11,
    fontWeight: '900',
  },

  badgeLive: {
    backgroundColor: COLORS.liveBg,
  },

  badgeLiveText: {
    color: COLORS.liveText,
  },

  badgeFinished: {
    backgroundColor: COLORS.successBg,
  },

  badgeFinishedText: {
    color: COLORS.successText,
  },

  badgeScheduled: {
    backgroundColor: COLORS.first,
  },

  badgeScheduledText: {
    color: COLORS.fourth,
  },

  favoriteButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.first,
    borderWidth: 1,
    borderColor: COLORS.second,
  },

  matchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
    color: COLORS.third,
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
    minWidth: 86,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scoreRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  matchMetaText: {
    marginTop: 6,
    color: COLORS.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 15,
    maxWidth: 180,
  },

  score: {
    color: COLORS.third,
    fontSize: 22,
    fontWeight: '900',
  },

  scoreScheduledLabel: {
    color: COLORS.textSoft,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  scoreLive: {
    color: COLORS.accent,
  },

  scoreSeparator: {
    marginHorizontal: 8,
    color: COLORS.textSoft,
    fontSize: 16,
    fontWeight: '900',
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.first,
  },

  loadingText: {
    marginTop: 12,
    color: COLORS.third,
    fontSize: 15,
    fontWeight: '700',
  },

  emptyWrap: {
    paddingHorizontal: 20,
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyTitle: {
    marginTop: 12,
    color: COLORS.third,
    fontSize: 18,
    fontWeight: '900',
  },

  emptySubtitle: {
    marginTop: 6,
    color: COLORS.textSoft,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },

  emptyRetryButton: {
    marginTop: 14,
    borderRadius: 999,
    backgroundColor: '#ffd8c9',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  emptyRetryText: {
    color: COLORS.third,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  errorBox: {
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f5c2c2',
    backgroundColor: '#fff1f1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  errorText: {
    flex: 1,
    color: '#B3263D',
    fontSize: 12,
    fontWeight: '700',
  },

  retryButton: {
    borderRadius: 999,
    backgroundColor: '#ffd8c9',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  retryText: {
    color: COLORS.third,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});

