import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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

import TeamLogo from '../../components/TeamLogo';
import LeagueLogo from '../../components/LeagueLogo';
import { favoritesService } from '../../services/favoritesService';
import { matchService } from '../../services/matchService';
import { useAppTheme } from '../../src/theme/AppThemeContext';
import { getMatchPhase } from '../../utils/matchStatus';

const APP_BADGE_IMAGE = require('../../img/result_0.jpeg');

const startOfDay = (value) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const sameDay = (left, right) => {
  const l = startOfDay(left);
  const r = startOfDay(right);
  return l.getDate() === r.getDate() && l.getMonth() === r.getMonth() && l.getFullYear() === r.getFullYear();
};

const buildCalendarRange = (anchor) => {
  const out = [];
  const base = startOfDay(anchor || new Date());
  for (let index = -3; index < 5; index += 1) {
    const next = new Date(base);
    next.setDate(next.getDate() + index);
    out.push(next);
  }
  return out;
};

const collectMatchDays = (matches) => {
  const map = new Map();
  matches.forEach((match) => {
    const date = new Date(match?.date);
    if (!Number.isNaN(date.getTime())) {
      map.set(startOfDay(date).getTime(), startOfDay(date));
    }
  });
  return [...map.values()].sort((a, b) => a - b);
};

const getClosestMatchDay = (matches, reference) => {
  const currentDay = startOfDay(reference);
  const days = collectMatchDays(matches);
  if (!days.length) return currentDay;
  const exact = days.find((day) => sameDay(day, currentDay));
  if (exact) return exact;
  return days.reduce((best, day) => {
    const candidateDelta = Math.abs(day - currentDay);
    const bestDelta = Math.abs(best - currentDay);
    if (candidateDelta < bestDelta) return day;
    if (candidateDelta === bestDelta && day > best) return day;
    return best;
  }, days[0]);
};

const buildDateRange = (matches, anchor) => {
  const days = collectMatchDays(matches);
  if (!days.length) return buildCalendarRange(anchor);
  const closest = getClosestMatchDay(matches, anchor);
  const centerIndex = Math.max(0, days.findIndex((day) => sameDay(day, closest)));
  let start = Math.max(0, centerIndex - 3);
  let end = Math.min(days.length, start + 8);
  if (end - start < 8) start = Math.max(0, end - 8);
  return days.slice(start, end);
};

const formatShortDate = (date, today) => {
  const weekday = date.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase().replace('.', '');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return today ? `${weekday}\nAUJ\n${day}.${month}` : `${weekday}\n${day}.${month}`;
};

const formatMatchTime = (value) => new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const createPalette = (basePalette, isDark) => (
  isDark
    ? {
        ...basePalette,
        accentSoft: 'rgba(200, 255, 54, 0.18)',
        heroBase: '#08110d',
        heroSurface: 'rgba(9, 16, 12, 0.68)',
        heroGlass: 'rgba(15, 24, 18, 0.54)',
        heroBorder: 'rgba(255, 255, 255, 0.08)',
        heroTopFade: 'rgba(4, 7, 6, 0.28)',
        heroBottomFade: 'rgba(4, 7, 6, 0.84)',
        heroGlow: 'rgba(200, 255, 54, 0.16)',
        actionBg: 'rgba(16, 26, 19, 0.72)',
        actionBorder: 'rgba(255, 255, 255, 0.08)',
        searchBg: 'rgba(16, 26, 19, 0.88)',
        brandChip: 'rgba(17, 27, 20, 0.86)',
      }
    : {
        ...basePalette,
        accentSoft: 'rgba(47, 159, 232, 0.14)',
        heroBase: '#2d64c8',
        heroSurface: 'rgba(16, 46, 101, 0.34)',
        heroGlass: 'rgba(255, 255, 255, 0.18)',
        heroBorder: 'rgba(255, 255, 255, 0.18)',
        heroTopFade: 'rgba(255, 255, 255, 0.08)',
        heroBottomFade: 'rgba(8, 28, 66, 0.50)',
        heroGlow: 'rgba(114, 189, 255, 0.26)',
        actionBg: 'rgba(255, 255, 255, 0.84)',
        actionBorder: 'rgba(19, 35, 63, 0.08)',
        searchBg: '#ffffff',
        brandChip: 'rgba(255, 255, 255, 0.84)',
      }
);

export default function HomeScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const { isDark, palette: themePalette, toggleTheme } = useAppTheme();
  const palette = useMemo(() => createPalette(themePalette, isDark), [themePalette, isDark]);
  const isWide = width >= 960;
  const isNarrow = width < 520;
  const useStaticDateRow = width >= 900;
  const isCompact = width < 390;
  const styles = useMemo(() => createStyles(palette, { isWide, isNarrow, isCompact }), [palette, isWide, isNarrow, isCompact]);

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLeagues, setExpandedLeagues] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dates, setDates] = useState([]);
  const [showAllLeagues, setShowAllLeagues] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLogged, setIsLogged] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [matchesError, setMatchesError] = useState('');
  const socketRef = useRef(null);
  const refreshAuthAndFavoritesRef = useRef(async () => {});
  const loadMatchesRef = useRef(async () => {});
  const heroDrift = useRef(new Animated.Value(0)).current;
  const heroPulse = useRef(new Animated.Value(0)).current;
  const heroSweep = useRef(new Animated.Value(0)).current;

  // This effect intentionally runs on screen mount/focus wiring only.
  // Match loading is triggered here without re-running on every render.
  useEffect(() => {
    const initialize = async () => {
      setDates(buildCalendarRange(new Date()));
      await Promise.all([
        loadMatchesRef.current?.(),
        refreshAuthAndFavoritesRef.current?.(),
      ]);
    };

    initialize();

    const focusSubscription = navigation.addListener('focus', () => {
      refreshAuthAndFavoritesRef.current?.();
    });
    const favoritesSubscription = favoritesService.subscribe(() => {
      refreshAuthAndFavoritesRef.current?.();
    });

    return () => {
      focusSubscription?.();
      favoritesSubscription?.();
    };
  }, [navigation]);

  useEffect(() => {
    const socket = matchService.createSocketConnection();
    socketRef.current = socket;
    let lastLoggedAt = 0;
    socket.on('connect', () => console.log('[socket] connected', socket.id));
    socket.on('connect_error', (error) => {
      const now = Date.now();
      if (now - lastLoggedAt > 15000) {
        lastLoggedAt = now;
        console.warn('[socket] backend indisponible:', error?.message || error);
      }
    });
    socket.on('reconnect', (attempts) => console.log('[socket] reconnected after', attempts, 'attempt(s)'));
    socket.on('match:update', (updatedMatch) => {
      setMatches((previous) => {
        const next = matchService.mergeMatchIntoList(previous, updatedMatch);
        setExpandedLeagues((current) => (!updatedMatch?.league || current[updatedMatch.league] !== undefined ? current : { ...current, [updatedMatch.league]: true }));
        return next;
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

  useEffect(() => {
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroDrift, {
          toValue: 1,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(heroDrift, {
          toValue: 0,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroPulse, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(heroPulse, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const sweepLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroSweep, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(heroSweep, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    driftLoop.start();
    pulseLoop.start();
    sweepLoop.start();

    return () => {
      driftLoop.stop();
      pulseLoop.stop();
      sweepLoop.stop();
    };
  }, [heroDrift, heroPulse, heroSweep]);

  const animatedPrimaryGlowStyle = {
    transform: [
      {
        translateX: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -28],
        }),
      },
      {
        translateY: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 18],
        }),
      },
      {
        scale: heroPulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.12],
        }),
      },
    ],
    opacity: heroPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.7, 1],
    }),
  };

  const animatedSecondaryGlowStyle = {
    transform: [
      {
        translateX: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 16],
        }),
      },
      {
        translateY: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -14],
        }),
      },
      {
        rotate: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: ['-12deg', '-7deg'],
        }),
      },
    ],
    opacity: heroPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.45, 0.72],
    }),
  };

  const animatedScanlineStyle = {
    transform: [
      {
        translateY: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [-14, 14],
        }),
      },
    ],
    opacity: heroPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.28, 0.56],
    }),
  };

  const animatedGlowOrbStyle = {
    transform: [
      {
        scale: heroPulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.08],
        }),
      },
      {
        translateY: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 10],
        }),
      },
    ],
    opacity: heroPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 0.9],
    }),
  };

  const animatedSweepStyle = {
    transform: [
      {
        translateX: heroSweep.interpolate({
          inputRange: [0, 1],
          outputRange: [-260, 420],
        }),
      },
      {
        rotate: '-14deg',
      },
    ],
    opacity: heroSweep.interpolate({
      inputRange: [0, 0.15, 0.55, 1],
      outputRange: [0, 0.12, 0.2, 0],
    }),
  };

  const animatedLiveRingStyle = {
    transform: [
      {
        scale: heroPulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1.18],
        }),
      },
    ],
    opacity: heroPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.18, 0.42],
    }),
  };

  const animatedParticleOne = {
    transform: [
      {
        translateY: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -12],
        }),
      },
      {
        translateX: heroPulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 8],
        }),
      },
    ],
    opacity: heroPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.75],
    }),
  };

  const animatedParticleTwo = {
    transform: [
      {
        translateY: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 14],
        }),
      },
      {
        translateX: heroPulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -10],
        }),
      },
    ],
    opacity: heroPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.22, 0.58],
    }),
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
      if (withImport) await matchService.importAllMatches();
      const { matches: matchesData, error } = await matchService.getAllMatchesState();
      setMatchesError(error);
      if (error) return;
      const nextMatches = Array.isArray(matchesData) ? matchesData : [];
      setMatches(nextMatches);
      const nearestDay = getClosestMatchDay(nextMatches, selectedDate);
      if (!sameDay(nearestDay, selectedDate)) {
        setSelectedDate(nearestDay);
        setDates(buildDateRange(nextMatches, nearestDay));
      } else {
        setDates(buildDateRange(nextMatches, selectedDate));
      }
      setExpandedLeagues((current) => {
        const map = { ...current };
        nextMatches.forEach((match) => {
          if (match?.league && map[match.league] === undefined) map[match.league] = true;
        });
        return map;
      });
    } catch (error) {
      console.error('Erreur chargement matchs:', error);
      setMatchesError('Impossible de charger les matchs pour le moment.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  refreshAuthAndFavoritesRef.current = refreshAuthAndFavorites;
  loadMatchesRef.current = loadMatches;

  const handleRefresh = () => {
    setRefreshing(true);
    loadMatches();
    refreshAuthAndFavorites();
  };

  const isToday = (date) => sameDay(date, new Date());
  const isSelected = (date) => sameDay(date, selectedDate);
  const getMatchesForDate = (date) => matches.filter((match) => sameDay(new Date(match.date), date));
  const filterMatches = (list) => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) return list;
    return list.filter((match) => String(match.homeTeam || '').toLowerCase().includes(normalized) || String(match.awayTeam || '').toLowerCase().includes(normalized) || String(match.league || '').toLowerCase().includes(normalized));
  };

  const scopedMatches = showAllLeagues ? matches : getMatchesForDate(selectedDate);
  const filteredScopedMatches = filterMatches(scopedMatches);
  const visibleMatchCount = filteredScopedMatches.length;
  const totalMatchCount = matches.length;

  const filteredSections = useMemo(() => {
    const grouped = {};
    filteredScopedMatches.forEach((match) => {
      const league = match.league || 'Autre';
      if (!grouped[league]) grouped[league] = [];
      grouped[league].push(match);
    });
    return Object.entries(grouped).sort((left, right) => left[0].localeCompare(right[0])).map(([league, leagueMatches]) => ({ title: league, leagueMeta: leagueMatches[0] || { league }, data: expandedLeagues[league] === false ? [] : leagueMatches }));
  }, [expandedLeagues, filteredScopedMatches]);

  const featuredMatch = useMemo(() => {
    if (!filteredScopedMatches.length) return null;
    const priority = { live: 0, scheduled: 1, finished: 2 };
    return [...filteredScopedMatches].sort((left, right) => {
      const phaseDelta = (priority[getMatchPhase(left)] ?? 9) - (priority[getMatchPhase(right)] ?? 9);
      return phaseDelta !== 0 ? phaseDelta : new Date(left.date) - new Date(right.date);
    })[0];
  }, [filteredScopedMatches]);

  const leagueHighlights = useMemo(() => {
    const map = new Map();
    matches.forEach((match) => {
      const league = match?.league || 'Autre';
      if (!map.has(league)) map.set(league, match);
    });
    return [...map.entries()].slice(0, 5).map(([league, leagueMeta]) => ({ league, leagueMeta }));
  }, [matches]);

  const closeSearch = () => {
    setSearchOpen(false);
    Keyboard.dismiss();
  };

  const handleProfilePress = async () => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      navigation.getParent()?.navigate('Login', { redirectTo: 'Profile', message: 'Connectez-vous pour acceder a votre profil' });
      return;
    }
    navigation.getParent()?.navigate('Profile');
  };

  const handleLoginPress = () => navigation.getParent()?.navigate('Login', { redirectTo: 'Home', message: 'Connectez-vous pour continuer' });
  const handleToggleFavorite = async (match) => {
    if (!isLogged) {
      navigation.getParent()?.navigate('Login', { redirectTo: 'Home', message: 'Connectez-vous pour enregistrer des favoris' });
      return;
    }
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(match._id)) next.delete(match._id); else next.add(match._id);
      return next;
    });
    const result = await favoritesService.toggleFavorite(match);
    if (!result?.ok) refreshAuthAndFavorites();
  };

  const goToDetails = (match) => navigation.getParent()?.navigate('MatchDetails', { match });
  const openLeagueCompetition = (league, leagueMeta) => navigation.getParent()?.navigate('LeagueCompetition', { league, leagueMeta: leagueMeta || { league } });

  const renderSectionHeader = ({ section: { title, leagueMeta } }) => {
    const leagueMatches = filteredScopedMatches.filter((match) => (match.league || 'Autre') === title).length;
    return (
      <TouchableOpacity style={styles.leagueHeader} onPress={() => openLeagueCompetition(title, leagueMeta)} onLongPress={() => setExpandedLeagues((current) => ({ ...current, [title]: !current[title] }))} activeOpacity={0.9}>
        <View style={styles.leagueLeft}>
          <LeagueLogo source={leagueMeta} size={22} style={styles.leagueLogo} />
          <View style={styles.flex1}>
            <Text style={styles.leagueTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.leagueSub}>Competition</Text>
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.leagueCount}>{leagueMatches}</Text>
          <Ionicons name="chevron-forward" size={16} color={palette.muted} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderMatch = ({ item }) => {
    const matchDate = new Date(item.date);
    const timeLabel = formatMatchTime(matchDate);
    const phase = getMatchPhase(item);
    const isLive = phase === 'live';
    const isFinished = phase === 'finished';
    const isScheduled = !isLive && !isFinished;
    const isFavorite = favoriteIds.has(item._id);
    const meta = [item?.round || null, item?.stadium || item?.venue || null, item?.city || null].filter(Boolean).join(' • ');
    let badgeBox = [styles.badge, styles.badgeScheduled];
    let badgeText = [styles.badgeText, styles.badgeScheduledText];
    let scoreText = styles.score;
    let status = 'A VENIR';
    if (isLive) {
      status = 'LIVE';
      badgeBox = [styles.badge, styles.badgeLive];
      badgeText = [styles.badgeText, styles.badgeLiveText];
      scoreText = [styles.score, styles.scoreLive];
    } else if (isFinished) {
      status = 'TERMINE';
      badgeBox = [styles.badge, styles.badgeFinished];
      badgeText = [styles.badgeText, styles.badgeFinishedText];
    }
    return (
      <TouchableOpacity style={styles.matchCard} activeOpacity={0.93} onPress={() => goToDetails(item)}>
        <View style={[styles.row, styles.between, styles.mb14]}>
          <View style={styles.timePill}>
            <Ionicons name="time-outline" size={13} color={palette.muted} />
            <Text style={styles.matchTime}>{timeLabel}</Text>
          </View>
          <View style={styles.row}>
            <View style={badgeBox}><Text style={badgeText}>{status}</Text></View>
            <TouchableOpacity style={styles.favoriteButton} activeOpacity={0.85} onPress={(event) => { event.stopPropagation(); handleToggleFavorite(item); }}>
              <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={19} color={isFavorite ? palette.accent : palette.muted} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.row, styles.between, styles.center]}>
          <View style={styles.teamSide}>
            <TeamLogo uri={item.homeTeamLogo} size={38} />
            <Text style={styles.teamName} numberOfLines={2}>{item.homeTeam || 'Equipe locale'}</Text>
          </View>
          <View style={styles.scoreCol}>
            {isScheduled ? <Text style={styles.scoreScheduled}>VS</Text> : <View style={styles.row}><Text style={scoreText}>{item.homeScore ?? '-'}</Text><Text style={styles.scoreSep}>:</Text><Text style={scoreText}>{item.awayScore ?? '-'}</Text></View>}
          </View>
          <View style={[styles.teamSide, styles.teamSideRight]}>
            <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={2}>{item.awayTeam || 'Equipe visiteuse'}</Text>
            <TeamLogo uri={item.awayTeamLogo} size={38} />
          </View>
        </View>
        {!!meta ? (
          <View style={styles.matchMetaRow}>
            <Ionicons name="location-outline" size={12} color={palette.muted} />
            <Text style={styles.matchMetaText} numberOfLines={1}>{meta}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const hero = (() => {
    if (!featuredMatch) {
      return (
        <View style={styles.hero}>
          <View style={styles.heroBackdrop} />
          <Animated.View style={[styles.heroSweep, animatedSweepStyle]} />
          <Animated.View style={[styles.heroMeshPrimary, animatedPrimaryGlowStyle]} />
          <Animated.View style={[styles.heroMeshSecondary, animatedSecondaryGlowStyle]} />
          <Animated.View style={[styles.heroParticle, styles.heroParticleOne, animatedParticleOne]} />
          <Animated.View style={[styles.heroParticle, styles.heroParticleTwo, animatedParticleTwo]} />
          <View style={styles.heroPitchLineVertical} />
          <Animated.View style={[styles.heroPitchLineHorizontal, animatedScanlineStyle]} />
          <Animated.View style={[styles.heroGlowOrb, animatedGlowOrbStyle]} />
          <View style={styles.heroTopShade} />
          <View style={styles.heroBottomShade} />
          <View style={styles.heroTopBar}>
            <View style={styles.heroLeaguePill}>
              <Ionicons name="flash-outline" size={14} color={palette.accent} />
              <Text style={styles.heroLeagueText}>KICKLY Match Center</Text>
            </View>
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.heroEyebrow}>Featured Matchday</Text>
            <Text style={styles.heroTitle}>Every live score, match pulse and football story in one place.</Text>
            <Text style={styles.heroSubtitle}>Une vue premium pour suivre les matchs chauds, les favoris et les infos du jour sans bruit visuel.</Text>
            <View style={styles.heroCardShell}>
              <View style={styles.heroCenterBlock}>
                <Text style={styles.heroScoreLabel}>No featured game yet</Text>
                <Text style={styles.heroScoreValue}>Matchday loading</Text>
                <Text style={styles.heroRound}>Actualise pour afficher le top event du moment.</Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    const matchDate = new Date(featuredMatch.date);
    const phase = getMatchPhase(featuredMatch);
    const isLive = phase === 'live';
    const isFinished = phase === 'finished';
    const scoreValue = isLive || isFinished ? `${featuredMatch.homeScore ?? '-'}  :  ${featuredMatch.awayScore ?? '-'}` : formatMatchTime(matchDate);
    const scoreLabel = isLive ? 'Live score' : isFinished ? 'Full time' : 'Kick off';
    const heroStatus = isLive ? 'LIVE' : isFinished ? 'RESULT' : 'TOP MATCH';
    const metaPrimary = featuredMatch.round || 'Match du jour';
    const metaSecondary = [featuredMatch.stadium || featuredMatch.venue, featuredMatch.city].filter(Boolean).join(' • ');

    return (
      <TouchableOpacity style={styles.hero} activeOpacity={0.95} onPress={() => goToDetails(featuredMatch)}>
        <View style={styles.heroBackdrop} />
        <Animated.View style={[styles.heroSweep, animatedSweepStyle]} />
        <Animated.View style={[styles.heroMeshPrimary, animatedPrimaryGlowStyle]} />
        <Animated.View style={[styles.heroMeshSecondary, animatedSecondaryGlowStyle]} />
        <Animated.View style={[styles.heroParticle, styles.heroParticleOne, animatedParticleOne]} />
        <Animated.View style={[styles.heroParticle, styles.heroParticleTwo, animatedParticleTwo]} />
        <View style={styles.heroPitchLineVertical} />
        <Animated.View style={[styles.heroPitchLineHorizontal, animatedScanlineStyle]} />
        <Animated.View style={[styles.heroGlowOrb, animatedGlowOrbStyle]} />
        <View style={styles.heroTopShade} />
        <View style={styles.heroBottomShade} />
        <View style={styles.heroTopBar}>
          <View style={styles.heroLeaguePill}>
            <LeagueLogo source={featuredMatch} size={16} />
            <Text style={styles.heroLeagueText} numberOfLines={1}>{featuredMatch.league || 'Elite Football'}</Text>
          </View>
          <View style={[styles.heroStatusPill, isLive ? styles.heroStatusLive : styles.heroStatusMuted]}>
            {isLive ? <Animated.View style={[styles.heroStatusRing, animatedLiveRingStyle]} /> : null}
            {isLive ? <View style={styles.heroStatusDot} /> : null}
            <Text style={styles.heroStatusText}>{heroStatus}</Text>
          </View>
        </View>
        <View style={styles.heroContent}>
          <Text style={styles.heroEyebrow}>Live Spotlight</Text>
          <Text style={styles.heroTitle} numberOfLines={2}>{featuredMatch.homeTeam || 'Equipe locale'} vs {featuredMatch.awayTeam || 'Equipe visiteuse'}</Text>
          <View style={styles.heroAccentLine} />
          <Text style={styles.heroSubtitle}>{isLive ? 'Le match fort du moment, suivi en direct avec score, details et favoris.' : 'Une carte premium pour suivre le meilleur rendez-vous football du jour.'}</Text>
          <View style={styles.heroCardShell}>
            <View style={styles.heroTeamBlock}>
              <View style={styles.heroTeamBadge}><TeamLogo uri={featuredMatch.homeTeamLogo} size={isCompact ? 42 : 50} /></View>
              <Text style={styles.heroTeamName} numberOfLines={2}>{featuredMatch.homeTeam || 'Equipe locale'}</Text>
            </View>
            <View style={styles.heroCenterBlock}>
              <Text style={styles.heroScoreLabel}>{scoreLabel}</Text>
              <Text style={styles.heroScoreValue}>{scoreValue}</Text>
              <Text style={styles.heroRound} numberOfLines={1}>{metaPrimary}</Text>
            </View>
            <View style={styles.heroTeamBlock}>
              <View style={styles.heroTeamBadge}><TeamLogo uri={featuredMatch.awayTeamLogo} size={isCompact ? 42 : 50} /></View>
              <Text style={styles.heroTeamName} numberOfLines={2}>{featuredMatch.awayTeam || 'Equipe visiteuse'}</Text>
            </View>
          </View>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaPill}>
              <Ionicons name="time-outline" size={14} color={palette.accent} />
              <Text style={styles.heroMetaText}>{isLive || isFinished ? formatMatchTime(matchDate) : `${formatMatchTime(matchDate)} kickoff`}</Text>
            </View>
            {metaSecondary ? <View style={styles.heroMetaPill}><Ionicons name="location-outline" size={14} color={palette.accent} /><Text style={styles.heroMetaText} numberOfLines={1}>{metaSecondary}</Text></View> : null}
            <View style={styles.heroMetaPill}><Ionicons name="arrow-forward-outline" size={14} color={palette.accent} /><Text style={styles.heroMetaText}>Open match center</Text></View>
          </View>
        </View>
      </TouchableOpacity>
    );
  })();

  const listHeader = (
    <View style={styles.listHeader}>
      {hero}
      <View style={styles.mb18}>
        <View style={[styles.row, styles.between, styles.mb12]}>
          <Text style={styles.sectionTitle}>Football</Text>
          <Text style={styles.sectionAction}>Top leagues</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
          {leagueHighlights.map(({ league, leagueMeta }) => (
            <TouchableOpacity key={league} style={styles.chip} activeOpacity={0.88} onPress={() => openLeagueCompetition(league, leagueMeta)}>
              <LeagueLogo source={leagueMeta} size={18} />
              <Text style={styles.chipText} numberOfLines={1}>{league}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <View>
        {useStaticDateRow ? (
          <View style={styles.dateRowStatic}>
            {dates.map((date, index) => {
              const active = isSelected(date);
              return <TouchableOpacity key={`${date.toISOString()}-${index}`} style={[styles.dateBtn, styles.dateBtnExpanded, active && styles.dateBtnActive]} onPress={() => setSelectedDate(date)} activeOpacity={0.9}><Text style={[styles.dateText, active && styles.dateTextActive]}>{formatShortDate(date, isToday(date))}</Text></TouchableOpacity>;
            })}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dateRow}>
            {dates.map((date, index) => {
              const active = isSelected(date);
              return <TouchableOpacity key={`${date.toISOString()}-${index}`} style={[styles.dateBtn, active && styles.dateBtnActive]} onPress={() => setSelectedDate(date)} activeOpacity={0.9}><Text style={[styles.dateText, active && styles.dateTextActive]}>{formatShortDate(date, isToday(date))}</Text></TouchableOpacity>;
            })}
          </ScrollView>
        )}
        <TouchableOpacity style={styles.allGames} onPress={() => setShowAllLeagues((current) => !current)} activeOpacity={0.9}>
          <View style={[styles.row, styles.flex1]}>
            <View style={styles.allIcon}><Ionicons name="layers-outline" size={18} color={palette.accent} /></View>
            <View style={styles.flex1}>
              <Text style={styles.allTitle}>{showAllLeagues ? 'Tous les matchs' : 'Selection du jour'}</Text>
              <Text style={styles.allSub}>{showAllLeagues ? 'Vue globale des competitions' : 'Affichage par date'}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.countPill}><Text style={styles.countPillText}>{visibleMatchCount}</Text></View>
            <Text style={styles.totalCount}>/ {totalMatchCount}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading && !refreshing) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={palette.accent} /><Text style={styles.loadingText}>Chargement des matchs...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.headerInner, { maxWidth: isWide ? 1120 : '100%' }]}>
          <View style={styles.headerTop}>
            <View style={styles.headerIdentity}>
              <View style={styles.logoShell}>
                <Image source={APP_BADGE_IMAGE} style={styles.appLogo} resizeMode="cover" />
                <View style={styles.logoGlow} />
                <View style={styles.logoInnerRing} />
              </View>
              <View style={styles.headerTitleWrap}>
                <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>KICKLY</Text>
                <View style={styles.headerMetaRow}>
                  <View style={styles.headerMetaAccent} />
                  <Text style={styles.headerSubtitle} numberOfLines={isNarrow ? 2 : 1}>Live scores, news and favorites</Text>
                </View>
                <View style={styles.headerTitleUnderline} />
              </View>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.headerButton} onPress={() => setSearchOpen((current) => !current)} activeOpacity={0.88}><Ionicons name="search" size={18} color={palette.text} /></TouchableOpacity>
              <TouchableOpacity style={styles.headerButton} onPress={toggleTheme} activeOpacity={0.88}><Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={palette.text} /></TouchableOpacity>
              {isLogged ? <TouchableOpacity style={styles.headerButton} onPress={handleProfilePress} activeOpacity={0.88}><Ionicons name="person-outline" size={18} color={palette.text} /></TouchableOpacity> : <TouchableOpacity style={styles.loginCta} onPress={handleLoginPress} activeOpacity={0.9}><Text style={styles.loginCtaText}>Connexion</Text></TouchableOpacity>}
            </View>
          </View>
          {searchOpen ? <View style={styles.search}><Ionicons name="search" size={18} color={palette.muted} /><TextInput style={styles.searchInput} value={searchQuery} onChangeText={setSearchQuery} placeholder="Equipe ou ligue" placeholderTextColor={palette.muted} returnKeyType="search" /><TouchableOpacity onPress={closeSearch} activeOpacity={0.85}><Ionicons name="close-circle" size={20} color={palette.muted} /></TouchableOpacity></View> : null}
        </View>
      </View>

      <SectionList
        sections={filteredSections}
        keyExtractor={(item, index) => item._id || item.matchId?.toString() || item.apiMatchId?.toString() || `${item.homeTeam}-${item.awayTeam}-${index}`}
        renderItem={renderMatch}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={listHeader}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
        ListEmptyComponent={<View style={styles.empty}><Ionicons name={matchesError ? 'alert-circle-outline' : 'football-outline'} size={40} color={matchesError ? palette.live : palette.muted} /><Text style={styles.emptyTitle}>{matchesError ? 'Backend indisponible' : 'Aucun match trouve'}</Text><Text style={styles.emptySub}>{matchesError || 'Essaie une autre date ou une autre recherche.'}</Text>{matchesError ? <TouchableOpacity style={styles.retryBtn} onPress={() => loadMatches()} activeOpacity={0.88}><Text style={styles.retryBtnText}>Reessayer</Text></TouchableOpacity> : null}</View>}
      />

      {matchesError && matches.length > 0 ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={16} color={palette.live} /><Text style={styles.errorText}>{matchesError}</Text><TouchableOpacity style={styles.retrySmall} onPress={() => loadMatches()}><Text style={styles.retrySmallText}>Reessayer</Text></TouchableOpacity></View> : null}
    </View>
  );
}

const createStyles = (C, { isWide, isNarrow, isCompact }) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  loadingText: { marginTop: 12, color: C.text, fontSize: 15, fontWeight: '700' },
  header: { backgroundColor: C.bg, paddingTop: Platform.OS === 'web' ? 12 : 8, paddingBottom: 12 },
  headerInner: { width: '100%', alignSelf: 'center', paddingHorizontal: 14 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: isNarrow ? 10 : 14, paddingTop: 4, paddingBottom: 8 },
  headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0, paddingVertical: 4, paddingRight: isNarrow ? 4 : 0 },
  logoShell: { width: isCompact ? 54 : isNarrow ? 60 : 74, height: isCompact ? 54 : isNarrow ? 60 : 74, borderRadius: isCompact ? 18 : 24, marginRight: isNarrow ? 12 : 16, backgroundColor: C.panelAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: C.border, shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  appLogo: { width: '100%', height: '100%', opacity: 0.96 },
  logoGlow: { position: 'absolute', width: 54, height: 54, borderRadius: 999, backgroundColor: C.heroGlow, opacity: 0.55 },
  logoInnerRing: { position: 'absolute', top: 6, right: 6, bottom: 6, left: 6, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  headerTitleWrap: { flex: 1, minWidth: 0, maxWidth: '100%', justifyContent: 'center' },
  headerTitle: { color: C.text, fontSize: isCompact ? 24 : isNarrow ? 30 : 40, lineHeight: isCompact ? 26 : isNarrow ? 32 : 42, fontWeight: '900', letterSpacing: isNarrow ? 0.1 : 0.4, flexShrink: 1 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  headerMetaAccent: { width: 22, height: 3, borderRadius: 999, backgroundColor: C.accent, marginRight: 8 },
  headerSubtitle: { flex: 1, color: C.muted, fontSize: isCompact ? 10 : isNarrow ? 11 : 14, fontWeight: '700', letterSpacing: 0.05, lineHeight: isCompact ? 13 : isNarrow ? 14 : 18 },
  headerTitleUnderline: { marginTop: isNarrow ? 8 : 10, width: isCompact ? 72 : isNarrow ? 92 : 112, height: 1, backgroundColor: C.border },
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: isNarrow ? 6 : 10, flexShrink: 0, marginLeft: isNarrow ? 6 : 10 },
  headerButton: { width: isNarrow ? 34 : 42, height: isNarrow ? 34 : 42, borderRadius: isNarrow ? 12 : 16, backgroundColor: C.actionBg, borderWidth: 1, borderColor: C.actionBorder, alignItems: 'center', justifyContent: 'center' },
  loginCta: { height: isNarrow ? 34 : 42, paddingHorizontal: isNarrow ? 12 : 16, borderRadius: isNarrow ? 12 : 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  loginCtaText: { color: C.accentDark, fontWeight: '900', fontSize: 13 },
  search: { marginTop: 6, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 18, backgroundColor: C.searchBg, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, color: C.text, fontSize: 14, fontWeight: '700' },
  list: { flex: 1 },
  listContent: { paddingBottom: 28 },
  listHeader: { paddingHorizontal: 14, paddingTop: 6 },
  hero: { minHeight: isCompact ? 320 : 350, borderRadius: 30, overflow: 'hidden', backgroundColor: C.heroBase, borderWidth: 1, borderColor: C.heroBorder, marginBottom: 22, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.24, transform: [{ scale: 1.18 }] },
  heroBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: C.heroSurface },
  heroSweep: { position: 'absolute', top: -40, width: 120, height: '130%', backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  heroMeshPrimary: { position: 'absolute', top: -42, right: -24, width: 220, height: 220, borderRadius: 999, backgroundColor: C.heroGlow, opacity: 0.95 },
  heroMeshSecondary: { position: 'absolute', bottom: -70, left: -40, width: 250, height: 180, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.05)', transform: [{ rotate: '-12deg' }] },
  heroParticle: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.14)' },
  heroParticleOne: { top: 72, right: 190, width: 8, height: 8 },
  heroParticleTwo: { bottom: 88, left: 110, width: 6, height: 6 },
  heroPitchLineVertical: { position: 'absolute', top: 26, bottom: 26, right: '28%', width: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  heroPitchLineHorizontal: { position: 'absolute', left: 22, right: 22, top: '48%', height: 1, backgroundColor: 'rgba(255, 255, 255, 0.06)' },
  heroGlowOrb: { position: 'absolute', top: -46, right: -24, width: 180, height: 180, borderRadius: 999, backgroundColor: C.heroGlow },
  heroTopShade: { position: 'absolute', top: 0, left: 0, right: 0, height: '40%', backgroundColor: C.heroTopFade },
  heroBottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '74%', backgroundColor: C.heroBottomFade },
  heroTopBar: { paddingHorizontal: 20, paddingTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroLeaguePill: { maxWidth: '70%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: C.heroGlass, borderWidth: 1, borderColor: C.heroBorder },
  heroLeagueText: { flex: 1, color: C.text, fontSize: 12, fontWeight: '800' },
  heroStatusPill: { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  heroStatusLive: { backgroundColor: C.live, borderColor: C.live },
  heroStatusMuted: { backgroundColor: C.heroGlass, borderColor: C.heroBorder },
  heroStatusRing: { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.65)' },
  heroStatusDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: C.white },
  heroStatusText: { color: C.white, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroContent: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 20 },
  heroEyebrow: { color: C.accent, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 },
  heroTitle: { color: C.white, fontSize: isCompact ? 26 : 30, lineHeight: isCompact ? 30 : 34, fontWeight: '900', maxWidth: isWide ? '72%' : '100%' },
  heroAccentLine: { width: 88, height: 4, borderRadius: 999, backgroundColor: C.accent, marginTop: 12, marginBottom: 2, shadowColor: C.accent, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  heroSubtitle: { marginTop: 10, color: 'rgba(245, 248, 242, 0.78)', fontSize: 13, lineHeight: 19, fontWeight: '600', maxWidth: isWide ? '64%' : '92%' },
  heroCardShell: { marginTop: 18, borderRadius: 26, backgroundColor: 'rgba(8, 13, 10, 0.62)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', paddingHorizontal: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  heroTeamBlock: { flex: 1, alignItems: 'center', minWidth: 0 },
  heroTeamBadge: { width: isCompact ? 62 : 74, height: isCompact ? 62 : 74, borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 1, borderColor: C.heroBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  heroTeamName: { color: C.white, fontSize: isCompact ? 13 : 14, fontWeight: '800', textAlign: 'center', lineHeight: 18 },
  heroCenterBlock: { minWidth: isCompact ? 92 : 112, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  heroScoreLabel: { color: C.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  heroScoreValue: { marginTop: 6, color: C.accent, fontSize: isCompact ? 22 : 26, fontWeight: '900', textAlign: 'center' },
  heroRound: { marginTop: 6, color: 'rgba(245, 248, 242, 0.72)', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  heroMetaPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: C.heroGlass, borderWidth: 1, borderColor: C.heroBorder, maxWidth: '100%' },
  heroMetaText: { color: C.white, fontSize: 12, fontWeight: '700', maxWidth: 180 },
  mb18: { marginBottom: 18 },
  mb12: { marginBottom: 12 },
  mb14: { marginBottom: 14 },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: '900' },
  sectionAction: { color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  chips: { paddingRight: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, marginRight: 10, minWidth: 108 },
  chipText: { color: C.text, fontSize: 13, fontWeight: '700', maxWidth: 120 },
  dateRow: { paddingRight: 8 },
  dateRowStatic: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between' },
  dateBtn: { width: 92, height: 84, borderRadius: 22, marginRight: 10, backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  dateBtnExpanded: { flex: 1, minWidth: 0, width: undefined, marginRight: 0 },
  dateBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  dateText: { color: C.text, fontSize: 12, fontWeight: '900', textAlign: 'center', lineHeight: 17 },
  dateTextActive: { color: C.accentDark },
  allGames: { marginTop: 12, borderRadius: 24, backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  allIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.panelAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  allTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
  allSub: { marginTop: 3, color: C.muted, fontSize: 12, fontWeight: '700' },
  countPill: { minWidth: 54, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  countPillText: { color: C.accentDark, fontSize: 14, fontWeight: '900' },
  totalCount: { color: C.muted, fontSize: 13, fontWeight: '800', marginLeft: 6 },
  leagueHeader: { marginHorizontal: 14, marginTop: 16, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 20, backgroundColor: C.panelAlt, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leagueLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  leagueLogo: { marginRight: 12, backgroundColor: C.panel },
  leagueTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
  leagueSub: { marginTop: 2, color: C.muted, fontSize: 11, fontWeight: '700' },
  leagueCount: { color: C.accent, fontSize: 14, fontWeight: '900', marginRight: 8 },
  matchCard: { marginHorizontal: 14, marginTop: 10, padding: 14, borderRadius: 22, backgroundColor: C.panel, borderWidth: 1, borderColor: C.border },
  timePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: C.panelAlt },
  matchTime: { color: C.text, fontSize: 12, fontWeight: '800' },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 8 },
  badgeText: { fontSize: 11, fontWeight: '900' },
  badgeLive: { backgroundColor: C.live },
  badgeLiveText: { color: C.white },
  badgeFinished: { backgroundColor: C.accentSoft },
  badgeFinishedText: { color: C.success },
  badgeScheduled: { backgroundColor: C.panelAlt },
  badgeScheduledText: { color: C.muted },
  favoriteButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.panelAlt, alignItems: 'center', justifyContent: 'center' },
  teamSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  teamSideRight: { justifyContent: 'flex-end' },
  teamName: { flex: 1, color: C.text, fontSize: isNarrow ? 13 : 14, fontWeight: '800', lineHeight: isNarrow ? 16 : 18 },
  teamNameRight: { textAlign: 'right' },
  scoreCol: { minWidth: isNarrow ? 64 : 92, alignItems: 'center', justifyContent: 'center', paddingHorizontal: isNarrow ? 4 : 0 },
  score: { color: C.text, fontSize: 24, fontWeight: '900' },
  scoreLive: { color: C.accent },
  scoreSep: { marginHorizontal: 7, color: C.muted, fontSize: 15, fontWeight: '900' },
  scoreScheduled: { color: C.muted, fontSize: 18, fontWeight: '900', letterSpacing: 1.2 },
  matchMetaRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  matchMetaText: { flexShrink: 1, color: C.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  empty: { paddingHorizontal: 20, paddingVertical: 50, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 12, color: C.text, fontSize: 18, fontWeight: '900' },
  emptySub: { marginTop: 6, color: C.muted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  retryBtn: { marginTop: 14, borderRadius: 999, backgroundColor: C.accent, paddingHorizontal: 14, paddingVertical: 9 },
  retryBtnText: { color: C.accentDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  errorBox: { marginHorizontal: 14, marginBottom: 12, marginTop: 2, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255, 87, 77, 0.28)', backgroundColor: C.dangerSoft, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { flex: 1, color: C.text, fontSize: 12, fontWeight: '700' },
  retrySmall: { borderRadius: 999, backgroundColor: C.accent, paddingHorizontal: 10, paddingVertical: 6 },
  retrySmallText: { color: C.accentDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  center: { alignItems: 'center' },
  flex1: { flex: 1 },
});
