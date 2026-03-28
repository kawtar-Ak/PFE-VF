import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { matchService } from '../../services/matchService';
import TeamLogo from '../../components/TeamLogo';
import LeagueLogo from '../../components/LeagueLogo';
import { getMatchPhase } from '../../utils/matchStatus';
import { useAppTheme } from '../../src/theme/AppThemeContext';

const TABS = [
  { key: 'summary', label: 'Resume' },
  { key: 'events', label: 'Evenements' },
  { key: 'stats', label: 'Stats' },
  { key: 'lineups', label: 'Compos' },
  { key: 'players', label: 'Stats joueurs' },
];

const MAIN_STATS = [
  'Expected Goals',
  'Ball Possession',
  'Total Shots',
  'Shots on Goal',
  'Big Chances',
  'Corner Kicks',
  'Passes %',
  'Fouls',
];

const EVENT_ICON_BY_TYPE = {
  Goal: 'football-outline',
  Card: 'square-outline',
  subst: 'swap-horizontal-outline',
  Var: 'videocam-outline',
};

const normalize = (value) => String(value || '').trim();

const normalizeStatName = (value) => {
  const raw = normalize(value).toLowerCase();

  if (raw === 'expected goals' || raw === 'xg') return 'Expected Goals';
  if (raw === 'ball possession' || raw === 'possession') return 'Ball Possession';
  if (raw === 'total shots') return 'Total Shots';
  if (raw === 'shots on goal' || raw === 'shots on target') return 'Shots on Goal';
  if (raw === 'big chances') return 'Big Chances';
  if (raw === 'corner kicks' || raw === 'corners') return 'Corner Kicks';
  if (raw === 'passes %' || raw === 'passes accurate' || raw === 'pass accuracy') return 'Passes %';
  if (raw === 'fouls') return 'Fouls';

  return value;
};

const parseStatNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const stringValue = String(value ?? '').trim();
  if (!stringValue) return 0;

  if (stringValue.includes('/')) {
    const [left] = stringValue.split('/');
    const parsed = Number(String(left).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(stringValue.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatStatValue = (value) => {
  if (value === null || value === undefined || value === '') return '0';
  return String(value);
};

const getEventMinuteLabel = (event) => {
  const minute = event?.minute;
  const extra = event?.extraMinute;

  if (minute === null || minute === undefined) return '-';
  if (extra || extra === 0) return `${minute}+${extra}'`;
  return `${minute}'`;
};

const getEventTitle = (event) => {
  const playerName = event?.player?.name || event?.playerName || 'Joueur';

  if (event?.type === 'Goal') return `${playerName} - But`;
  if (event?.type === 'Card') return `${playerName} - ${event?.detail || 'Carton'}`;
  if (event?.type === 'subst') return `${playerName} - Remplacement`;

  return `${playerName} - ${event?.detail || event?.type || 'Evenement'}`;
};

const isGoalEvent = (event) => String(event?.type || '').toLowerCase() === 'goal';
const isCardEvent = (event) => String(event?.type || '').toLowerCase() === 'card';
const isSubEvent = (event) => {
  const type = String(event?.type || '').toLowerCase();
  const detail = String(event?.detail || '').toLowerCase();
  return type === 'subst' || detail.includes('substitution');
};

const getCardLabel = (event) => {
  const detail = String(event?.detail || '').toLowerCase();
  if (detail.includes('red')) return 'Carton rouge';
  if (detail.includes('yellow')) return 'Carton jaune';
  return 'Carton';
};

const getEventIconName = (event) => {
  if (isCardEvent(event)) return 'square';
  return EVENT_ICON_BY_TYPE[event?.type] || 'ellipse-outline';
};

const getEventIconPalette = (event, C) => {
  if (isCardEvent(event)) {
    const detail = String(event?.detail || '').toLowerCase();
    if (detail.includes('red')) {
      return {
        iconColor: '#DC2626',
        backgroundColor: '#FEE2E2',
        borderColor: '#FECACA',
      };
    }
    if (detail.includes('yellow')) {
      return {
        iconColor: '#EAB308',
        backgroundColor: '#FEF9C3',
        borderColor: '#FDE68A',
      };
    }
  }

  return {
    iconColor: C.text,
    backgroundColor: C.panel,
    borderColor: C.border,
  };
};

const getSummaryItemText = (event) => {
  const playerName = event?.player?.name || event?.playerName || 'Joueur';
  const teamName = event?.team?.name || event?.teamName || 'Equipe';

  if (isGoalEvent(event)) {
    return `${playerName} (${teamName})`;
  }

  if (isCardEvent(event)) {
    return `${getCardLabel(event)} - ${playerName} (${teamName})`;
  }

  if (isSubEvent(event)) {
    const inPlayer = event?.assist?.name || 'Entrant';
    const outPlayer = playerName || 'Sortant';
    return `${inPlayer} <- ${outPlayer} (${teamName})`;
  }

  return getEventTitle(event);
};

const getEventSortValue = (event) => {
  const minute = Number(event?.minute ?? 0);
  const extraMinute = Number(event?.extraMinute ?? 0);
  return (Number.isFinite(minute) ? minute : 0) * 100 + (Number.isFinite(extraMinute) ? extraMinute : 0);
};

const isHomeEvent = (event, match) => {
  const teamName = String(event?.team?.name || event?.teamName || '').trim().toLowerCase();
  const homeTeam = String(match?.homeTeam || '').trim().toLowerCase();
  return Boolean(teamName && homeTeam && teamName === homeTeam);
};

const isAwayEvent = (event, match) => {
  const teamName = String(event?.team?.name || event?.teamName || '').trim().toLowerCase();
  const awayTeam = String(match?.awayTeam || '').trim().toLowerCase();
  return Boolean(teamName && awayTeam && teamName === awayTeam);
};

const buildTimelineEvents = (events, match) => {
  const sorted = [...(events || [])].sort((left, right) => getEventSortValue(left) - getEventSortValue(right));
  let homeScore = 0;
  let awayScore = 0;

  return sorted.map((event) => {
    if (isGoalEvent(event)) {
      if (isHomeEvent(event, match)) homeScore += 1;
      else if (isAwayEvent(event, match)) awayScore += 1;
    }

    const scoreLabel = isGoalEvent(event) ? `${homeScore}-${awayScore}` : null;
    return { ...event, scoreLabel };
  });
};

const getStatusBadge = (phase, styles) => {
  if (phase === 'live') return { label: 'LIVE', style: styles.badgeLive, textStyle: styles.badgeLiveText };
  if (phase === 'finished') return { label: 'TERMINE', style: styles.badgeFinished, textStyle: styles.badgeFinishedText };
  return { label: 'A VENIR', style: styles.badgeScheduled, textStyle: styles.badgeScheduledText };
};

const getMatchTimeLabel = (match) => {
  const minute = match?.minute;
  const statusShort = String(match?.statusShort || '').toUpperCase();

  if (minute || minute === 0) {
    if (statusShort === 'HT') return `1. Mi-temps - ${minute}'`;
    return `${statusShort ? `${statusShort} - ` : ''}${minute}'`;
  }

  return statusShort || '-';
};

const buildFallbackSummaryItems = (match) => {
  const items = [];

  if (!match) return items;

  items.push({ label: 'Statut', value: `${match?.statusShort || '-'} (${match?.status || '-'})` });
  items.push({ label: 'Heure du match', value: getMatchTimeLabel(match) });
  items.push({ label: 'Date', value: match?.date ? new Date(match.date).toLocaleString('fr-FR') : '-' });
  items.push({ label: 'Score', value: `${match?.homeScore ?? '-'} - ${match?.awayScore ?? '-'}` });
  items.push({ label: 'Ligue', value: match?.league || '-' });
  items.push({ label: 'Tour', value: match?.round || '-' });
  items.push({ label: 'Stade', value: match?.stadium || match?.venue || '-' });
  items.push({ label: 'Ville', value: match?.city || '-' });
  items.push({ label: 'Arbitre', value: match?.referee || '-' });
  items.push({ label: 'Match ID', value: String(match?.matchId || match?.apiMatchId || match?.fixtureId || match?._id || '-') });

  return items;
};

const fetchMatchBundle = async (matchId, forceImport = false) => {
  if (!matchId) {
    return {
      matchData: null,
      eventData: [],
      statData: [],
      lineupData: [],
      providerStatus: { blocked: false, blockedUntil: null },
    };
  }

  if (forceImport) {
    await matchService.importMatchDetails(matchId);
  }

  const [matchData, eventData, statData, lineupData] = await Promise.all([
    matchService.getMatchById(matchId),
    matchService.getMatchEvents(matchId),
    matchService.getMatchStatistics(matchId),
    matchService.getMatchLineups(matchId),
  ]);
  const providerStatus = await matchService.getProviderStatus();

  return {
    matchData,
    eventData,
    statData,
    lineupData,
    providerStatus,
  };
};

const buildPlayerRows = (lineups, events) => {
  const players = [];

  lineups.forEach((lineup, teamIndex) => {
    const teamName = lineup?.team?.name || `Equipe ${teamIndex + 1}`;
    const teamLogo = lineup?.team?.logo || null;
    const starters = Array.isArray(lineup?.startingXI) ? lineup.startingXI : Array.isArray(lineup?.startXI) ? lineup.startXI : [];
    const bench = Array.isArray(lineup?.substitutes) ? lineup.substitutes : Array.isArray(lineup?.bench) ? lineup.bench : [];

    starters.forEach((entry, index) => {
      const player = entry?.player || entry || {};
      players.push({
        id: `start-${teamName}-${player?.id || player?.name || index}`,
        name: player?.name || 'Joueur',
        number: player?.number,
        position: player?.position || player?.pos || '-',
        teamName,
        teamLogo,
        impact: 1,
        cards: 0,
        goals: 0,
      });
    });

    bench.forEach((entry, index) => {
      const player = entry?.player || entry || {};
      players.push({
        id: `sub-${teamName}-${player?.id || player?.name || index}`,
        name: player?.name || 'Joueur',
        number: player?.number,
        position: player?.position || player?.pos || '-',
        teamName,
        teamLogo,
        impact: 0,
        cards: 0,
        goals: 0,
      });
    });
  });

  const byName = new Map();
  players.forEach((player) => {
    const key = `${String(player.teamName || '').toLowerCase()}-${String(player.name || '').toLowerCase()}`;
    if (!key.trim() || key.endsWith('-')) {
      return;
    }
    byName.set(key, player);
  });

  (events || []).forEach((event) => {
    const eventPlayer = normalize(event?.player?.name || event?.playerName).toLowerCase();
    if (!eventPlayer) return;

    const row = [...byName.values()].find((item) => String(item.name || '').toLowerCase() === eventPlayer);
    if (!row) return;

    if (event?.type === 'Goal') {
      row.goals += 1;
      row.impact += 3;
    } else if (event?.type === 'Card') {
      row.cards += 1;
      row.impact += 1;
    } else if (event?.type === 'subst') {
      row.impact += 1;
    } else {
      row.impact += 1;
    }
  });

  return [...byName.values()]
    .sort((a, b) => {
      if (b.impact !== a.impact) return b.impact - a.impact;
      if (b.goals !== a.goals) return b.goals - a.goals;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 12);
};

const buildStatRows = (statistics) => {
  if (!Array.isArray(statistics) || statistics.length < 2) return [];

  const homeStats = statistics[0]?.statistics || [];
  const awayStats = statistics[1]?.statistics || [];

  const homeMap = new Map();
  const awayMap = new Map();

  homeStats.forEach((item) => {
    homeMap.set(normalizeStatName(item?.type), item?.value);
  });
  awayStats.forEach((item) => {
    awayMap.set(normalizeStatName(item?.type), item?.value);
  });

  return MAIN_STATS.map((statLabel) => {
    const homeRaw = homeMap.get(statLabel) ?? 0;
    const awayRaw = awayMap.get(statLabel) ?? 0;
    const homeNum = parseStatNumber(homeRaw);
    const awayNum = parseStatNumber(awayRaw);
    const total = homeNum + awayNum;
    const homeRatio = total > 0 ? homeNum / total : 0.5;
    const awayRatio = total > 0 ? awayNum / total : 0.5;

    return {
      key: statLabel,
      label: statLabel,
      homeRaw,
      awayRaw,
      homeRatio,
      awayRatio,
    };
  });
};

export default function MatchDetailsScreen({ route, navigation }) {
  const { palette: C } = useAppTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const initialMatch = route?.params?.match || null;
  const [match, setMatch] = useState(initialMatch);
  const [events, setEvents] = useState(Array.isArray(initialMatch?.events) ? initialMatch.events : []);
  const [statistics, setStatistics] = useState(Array.isArray(initialMatch?.statistics) ? initialMatch.statistics : []);
  const [lineups, setLineups] = useState(Array.isArray(initialMatch?.lineups) ? initialMatch.lineups : []);
  const [loading, setLoading] = useState(Boolean(initialMatch));
  const [activeTab, setActiveTab] = useState('summary');
  const [providerBlocked, setProviderBlocked] = useState(false);
  const [providerBlockedUntil, setProviderBlockedUntil] = useState(null);

  const matchId = initialMatch?.matchId || initialMatch?.apiMatchId || initialMatch?.fixtureId || initialMatch?.id || null;

  const applyMatchBundle = ({ matchData, eventData, statData, lineupData, providerStatus }) => {
    if (matchData) {
      setMatch((previous) => ({
        ...previous,
        ...matchData,
      }));

      if (Array.isArray(matchData?.events) && matchData.events.length > 0) {
        setEvents(matchData.events);
      }
      if (Array.isArray(matchData?.statistics) && matchData.statistics.length > 0) {
        setStatistics(matchData.statistics);
      }
      if (Array.isArray(matchData?.lineups) && matchData.lineups.length > 0) {
        setLineups(matchData.lineups);
      }
    }

    setEvents((previous) => {
      const next = Array.isArray(eventData) ? eventData : [];
      return next.length > 0 ? next : previous;
    });

    setStatistics((previous) => {
      const next = Array.isArray(statData) ? statData : [];
      return next.length > 0 ? next : previous;
    });

    setLineups((previous) => {
      const next = Array.isArray(lineupData) ? lineupData : [];
      return next.length > 0 ? next : previous;
    });

    setProviderBlocked(Boolean(providerStatus?.blocked));
    setProviderBlockedUntil(providerStatus?.blockedUntil || null);
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!matchId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const bundle = await fetchMatchBundle(matchId);

        if (!mounted) return;
        applyMatchBundle(bundle);
      } catch (error) {
        console.error('Erreur details match:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [matchId]);

  const phase = getMatchPhase(match);
  const badge = getStatusBadge(phase, styles);

  const dateLabel = useMemo(() => {
    if (!match?.date) return 'Date indisponible';
    const parsed = new Date(match.date);
    return parsed.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [match?.date]);

  const competitionLabel = useMemo(() => {
    const country = String(match?.country || '').toUpperCase();
    const league = String(match?.league || 'Competition').toUpperCase();
    const round = match?.round ? ` - ${String(match.round).toUpperCase()}` : '';

    if (country) return `${country}: ${league}${round}`;
    return `${league}${round}`;
  }, [match?.country, match?.league, match?.round]);

  const statRows = useMemo(() => buildStatRows(statistics), [statistics]);
  const playerRows = useMemo(() => buildPlayerRows(lineups, events), [lineups, events]);
  const fallbackSummaryItems = useMemo(() => buildFallbackSummaryItems(match), [match]);
  const timelineEvents = useMemo(() => buildTimelineEvents(events, match), [events, match]);
  const goalEvents = useMemo(() => (timelineEvents || []).filter(isGoalEvent), [timelineEvents]);
  const cardEvents = useMemo(() => (timelineEvents || []).filter(isCardEvent), [timelineEvents]);
  const subEvents = useMemo(() => (timelineEvents || []).filter(isSubEvent), [timelineEvents]);

  useEffect(() => {
    if (!matchId || phase !== 'live') {
      return undefined;
    }

    const interval = setInterval(async () => {
      try {
        const [nextMatchData, nextEvents] = await Promise.all([
          matchService.getMatchById(matchId),
          matchService.getMatchEvents(matchId),
        ]);

        if (nextMatchData) {
          setMatch((previous) => ({ ...previous, ...nextMatchData }));
        }

        if (Array.isArray(nextEvents) && nextEvents.length > 0) {
          setEvents(nextEvents);
        }
      } catch (error) {
        console.error('Erreur refresh live details:', error);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [matchId, phase]);

  if (!initialMatch && !match) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Match introuvable</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()} activeOpacity={0.9}>
          <Text style={styles.primaryButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const homeScore = phase === 'live' || phase === 'finished' ? match?.homeScore ?? match?.score?.home ?? '-' : '-';
  const awayScore = phase === 'live' || phase === 'finished' ? match?.awayScore ?? match?.score?.away ?? '-' : '-';
  const providerBlockedMessage = providerBlocked
    ? `API-Sports limite atteinte. Reessayez apres ${providerBlockedUntil ? new Date(providerBlockedUntil).toLocaleString('fr-FR') : 'reset quota'}.`
    : null;
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.headerIconButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Ionicons name="football-outline" size={18} color={C.accent} />
            <Text style={styles.headerTitle}>Football</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.85}>
              <Ionicons name="share-social-outline" size={20} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.85}>
              <Ionicons name="star-outline" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loadingText}>Chargement des details...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.competitionBar}>
            <View style={styles.competitionLeft}>
              <LeagueLogo source={match} size={18} style={styles.competitionLogo} />
              <Text style={styles.competitionText} numberOfLines={1}>{competitionLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.accent} />
          </View>

          <View style={styles.scorePanel}>
            <View style={styles.teamBox}>
              <TeamLogo uri={match?.homeTeamLogo} size={64} style={styles.teamMainLogo} />
              <Text style={styles.teamMainName} numberOfLines={1}>{match?.homeTeam || 'Equipe locale'}</Text>
            </View>

            <View style={styles.centerScoreBox}>
              <Text style={styles.kickoffText}>{dateLabel}</Text>
              <View style={styles.scoreLine}>
                <Text style={styles.scoreMain}>{homeScore}</Text>
                <Text style={styles.scoreDash}>-</Text>
                <Text style={styles.scoreMain}>{awayScore}</Text>
              </View>
              <Text style={styles.phaseText}>{getMatchTimeLabel(match)}</Text>
              <View style={[styles.stateBadge, badge.style]}>
                <Text style={[styles.stateBadgeText, badge.textStyle]}>{badge.label}</Text>
              </View>
            </View>

            <View style={styles.teamBox}>
              <TeamLogo uri={match?.awayTeamLogo} size={64} style={styles.teamMainLogo} />
              <Text style={styles.teamMainName} numberOfLines={1}>{match?.awayTeam || 'Equipe visiteuse'}</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {activeTab === 'summary' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Resume du match</Text>
                <Ionicons name="flash-outline" size={18} color={C.accent} />
              </View>

              <View>
                {fallbackSummaryItems.map((item) => (
                  <View key={item.label} style={styles.infoFallbackRow}>
                    <Text style={styles.infoFallbackLabel}>{item.label}</Text>
                    <Text style={styles.infoFallbackValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {activeTab === 'events' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Evenements</Text>
                <Ionicons name="flash-outline" size={18} color={C.accent} />
              </View>

              {events.length === 0 ? (
                <View>
                  <Text style={styles.emptyText}>
                    {providerBlockedMessage || 'Aucun evenement pour le moment.'}
                  </Text>
                </View>
              ) : (
                <View>
                  <SummaryEventGroup title="Buts" icon="football-outline" events={goalEvents} match={match} styles={styles} C={C} />
                  <SummaryEventGroup title="Cartons" icon="square-outline" events={cardEvents} match={match} styles={styles} C={C} />
                  <SummaryEventGroup title="Remplacements" icon="swap-horizontal-outline" events={subEvents} match={match} styles={styles} C={C} />

                  {timelineEvents
                    .filter((event) => !isGoalEvent(event) && !isCardEvent(event) && !isSubEvent(event))
                    .map((event, index) => {
                      return (
                        <EventTimelineRow
                          key={event?.id || `${event?.type}-${index}`}
                          event={event}
                          match={match}
                          title={getEventTitle(event)}
                          subtitle={event?.team?.name || event?.teamName || 'Equipe'}
                          styles={styles}
                          C={C}
                        />
                      );
                    })}
                </View>
              )}
            </View>
          ) : null}

          {activeTab === 'stats' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Top stats</Text>
                <Ionicons name="stats-chart-outline" size={18} color={C.accent} />
              </View>

              {statRows.length === 0 ? (
                <View>
                  <Text style={styles.emptyText}>{providerBlockedMessage || 'Statistiques non disponibles (backend/API).'}</Text>
                  <View style={styles.infoFallbackRow}>
                    <Text style={styles.infoFallbackLabel}>Buts domicile</Text>
                    <Text style={styles.infoFallbackValue}>{String(match?.homeScore ?? '-')}</Text>
                  </View>
                  <View style={styles.infoFallbackRow}>
                    <Text style={styles.infoFallbackLabel}>Buts exterieur</Text>
                    <Text style={styles.infoFallbackValue}>{String(match?.awayScore ?? '-')}</Text>
                  </View>
                </View>
              ) : (
                statRows.map((stat) => (
                  <View key={stat.key} style={styles.statBlock}>
                    <View style={styles.statHeaderRow}>
                      <Text style={styles.statSideValue}>{formatStatValue(stat.homeRaw)}</Text>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                      <Text style={styles.statSideValue}>{formatStatValue(stat.awayRaw)}</Text>
                    </View>
                    <View style={styles.statBarsWrap}>
                      <View style={[styles.statBar, styles.statBarHome, { flex: Math.max(stat.homeRatio, 0.06) }]} />
                      <View style={[styles.statBar, styles.statBarAway, { flex: Math.max(stat.awayRatio, 0.06) }]} />
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {activeTab === 'lineups' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Compositions</Text>
                <Ionicons name="people-outline" size={18} color={C.accent} />
              </View>

              {lineups.length === 0 ? (
                <View>
                  <Text style={styles.emptyText}>{providerBlockedMessage || 'Compositions non disponibles (backend/API).'}</Text>
                  <View style={styles.infoFallbackRow}>
                    <Text style={styles.infoFallbackLabel}>Equipe domicile</Text>
                    <Text style={styles.infoFallbackValue}>{match?.homeTeam || '-'}</Text>
                  </View>
                  <View style={styles.infoFallbackRow}>
                    <Text style={styles.infoFallbackLabel}>Equipe exterieur</Text>
                    <Text style={styles.infoFallbackValue}>{match?.awayTeam || '-'}</Text>
                  </View>
                </View>
              ) : (
                lineups.map((lineup, lineupIndex) => (
                  <View key={lineup?.team?.id || `${lineup?.team?.name}-${lineupIndex}`} style={styles.lineupCard}>
                    <View style={styles.lineupHeader}>
                      <View style={styles.lineupTitleWrap}>
                        <TeamLogo uri={lineup?.team?.logo} size={26} />
                        <Text style={styles.lineupTeamName}>{lineup?.team?.name || 'Equipe'}</Text>
                      </View>
                      <Text style={styles.lineupFormation}>{lineup?.formation || '-'}</Text>
                    </View>

                    <Text style={styles.lineupSubTitle}>Titulaire</Text>
                    {(lineup?.startingXI || []).map((player, playerIndex) => (
                      <View key={`start-${lineupIndex}-${player?.id || playerIndex}`} style={styles.playerListRow}>
                        <Text style={styles.playerNumber}>{player?.number || '-'}</Text>
                        <Text style={styles.playerName} numberOfLines={1}>{player?.name || 'Joueur'}</Text>
                        <Text style={styles.playerPos}>{player?.position || '-'}</Text>
                      </View>
                    ))}

                    <Text style={[styles.lineupSubTitle, styles.lineupBench]}>Remplacants</Text>
                    {(lineup?.substitutes || []).slice(0, 8).map((player, playerIndex) => (
                      <View key={`sub-${lineupIndex}-${player?.id || playerIndex}`} style={styles.playerListRow}>
                        <Text style={styles.playerNumber}>{player?.number || '-'}</Text>
                        <Text style={styles.playerName} numberOfLines={1}>{player?.name || 'Joueur'}</Text>
                        <Text style={styles.playerPos}>{player?.position || '-'}</Text>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </View>
          ) : null}

          {activeTab === 'players' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Stats joueurs</Text>
                <Ionicons name="person-outline" size={18} color={C.accent} />
              </View>

              {playerRows.length === 0 ? (
                <View>
                  <Text style={styles.emptyText}>{providerBlockedMessage || 'Donnees joueurs indisponibles (backend/API).'}</Text>
                  <Text style={styles.emptyHint}>
                    {providerBlocked
                      ? 'Les details reviendront apres reset du quota API-Sports.'
                      : 'Astuce: il faut les endpoints `events`, `statistics` et `lineups` alimentes.'}
                  </Text>
                </View>
              ) : (
                playerRows.map((player, index) => (
                  <View key={player.id} style={styles.playerStatRow}>
                    <Text style={styles.rankText}>{index + 1}.</Text>

                    <View style={styles.playerIdentityWrap}>
                      <TeamLogo uri={player.teamLogo} size={36} style={styles.playerTeamLogo} />
                      <View style={styles.playerIdentityTextWrap}>
                        <Text style={styles.playerStatName} numberOfLines={1}>{player.name}</Text>
                        <Text style={styles.playerStatMeta} numberOfLines={1}>{player.position} - {player.teamName}</Text>
                      </View>
                    </View>

                    <View style={styles.impactBadge}>
                      <Text style={styles.impactBadgeText}>{player.impact}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function SummaryEventGroup({ title, icon, events, match, styles, C }) {
  return (
    <View>
      <View style={styles.summaryGroupHeader}>
        <Ionicons name={icon} size={16} color={C.accent} />
        <Text style={styles.summaryGroupTitle}>{title}</Text>
      </View>

      {!events?.length ? (
        <Text style={styles.summaryGroupEmpty}>Aucun</Text>
      ) : (
        events.map((event, index) => {
          return (
            <EventTimelineRow
              key={event?.id || `${title}-${index}`}
              event={event}
              match={match}
              styles={styles}
              C={C}
              title={getSummaryItemText(event)}
              subtitle={
                isGoalEvent(event) && event?.assist?.name
                  ? `Assist: ${event.assist.name}`
                  : isGoalEvent(event) && event?.scoreLabel
                    ? `Score: ${event.scoreLabel}`
                    : isSubEvent(event)
                      ? (event?.team?.name || event?.teamName || 'Equipe')
                      : ''
              }
            />
          );
        })
      )}
    </View>
  );
}

function EventTimelineRow({ event, match, title, subtitle, styles, C }) {
  const iconPalette = getEventIconPalette(event, C);
  const isAway = isAwayEvent(event, match);
  const minuteNode = <Text style={styles.timelineMinute}>{getEventMinuteLabel(event)}</Text>;
  const iconNode = (
    <View
      style={[
        styles.timelineIconWrap,
        {
          backgroundColor: iconPalette.backgroundColor,
          borderColor: iconPalette.borderColor,
        },
      ]}
    >
      <Ionicons
        name={getEventIconName(event)}
        size={16}
        color={iconPalette.iconColor}
      />
    </View>
  );
  const bodyNode = (
    <View style={[styles.timelineBody, isAway && styles.timelineBodyAway]}>
      <Text style={[styles.timelineTitle, isAway && styles.timelineTitleAway]}>{title}</Text>
      {!!subtitle && <Text style={[styles.timelineSubtitle, isAway && styles.timelineSubtitleAway]}>{subtitle}</Text>}
    </View>
  );

  return (
    <View
      style={[
        styles.timelineRow,
        isAway ? styles.timelineRowAway : styles.timelineRowHome,
      ]}
    >
      {isAway ? bodyNode : minuteNode}
      {iconNode}
      {isAway ? minuteNode : bodyNode}
    </View>
  );
}

const createStyles = (C) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    backgroundColor: C.bg,
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.panel,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '900',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 26,
  },
  competitionBar: {
    marginTop: 10,
    marginHorizontal: 12,
    backgroundColor: C.panelAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  competitionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  competitionLogo: {
    backgroundColor: C.accent,
    borderWidth: 0,
  },
  competitionText: {
    flex: 1,
    color: C.text,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scorePanel: {
    marginTop: 10,
    marginHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panel,
    paddingVertical: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamMainLogo: {
    backgroundColor: C.panelAlt,
  },
  teamMainName: {
    marginTop: 8,
    color: C.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  centerScoreBox: {
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kickoffText: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  scoreLine: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  scoreMain: {
    color: C.accent,
    fontSize: 50,
    lineHeight: 58,
    fontWeight: '900',
  },
  scoreDash: {
    color: C.accent,
    fontSize: 42,
    lineHeight: 52,
    fontWeight: '900',
    marginTop: -2,
  },
  phaseText: {
    color: C.live,
    fontSize: 14,
    fontWeight: '900',
    marginTop: -2,
  },
  stateBadge: {
    marginTop: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  stateBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  badgeLive: {
    backgroundColor: C.live,
  },
  badgeLiveText: {
    color: C.white,
  },
  badgeFinished: {
    backgroundColor: 'rgba(54, 209, 124, 0.15)',
  },
  badgeFinishedText: {
    color: C.success,
  },
  badgeScheduled: {
    backgroundColor: C.border,
  },
  badgeScheduledText: {
    color: C.muted,
  },
  tabsRow: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 2,
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabButtonActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  tabText: {
    color: C.muted,
    fontSize: 14,
    fontWeight: '900',
  },
  tabTextActive: {
    color: C.accentDark,
  },
  sectionCard: {
    marginTop: 12,
    marginHorizontal: 12,
    backgroundColor: C.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '900',
  },
  emptyText: {
    color: C.muted,
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 6,
  },
  emptyHint: {
    marginTop: 6,
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  infoFallbackRow: {
    borderTopWidth: 1,
    borderTopColor: C.bg,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  infoFallbackLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  infoFallbackValue: {
    flex: 1,
    textAlign: 'right',
    color: C.text,
    fontSize: 13,
    fontWeight: '900',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.bg,
  },
  timelineRowHome: {
    justifyContent: 'flex-start',
  },
  timelineRowAway: {
    justifyContent: 'flex-end',
  },
  timelineMinute: {
    width: 44,
    color: C.text,
    fontSize: 13,
    fontWeight: '900',
  },
  timelineIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.panelAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  timelineBody: {
    flex: 1,
  },
  timelineBodyAway: {
    alignItems: 'flex-end',
  },
  timelineTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
  },
  timelineTitleAway: {
    textAlign: 'right',
  },
  timelineSubtitle: {
    marginTop: 2,
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  timelineSubtitleAway: {
    textAlign: 'right',
  },
  summaryGroupHeader: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryGroupTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '900',
  },
  summaryGroupEmpty: {
    marginTop: 6,
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  statBlock: {
    borderTopWidth: 1,
    borderTopColor: C.bg,
    paddingVertical: 10,
  },
  statHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  statSideValue: {
    width: 68,
    color: C.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  statLabel: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  statBarsWrap: {
    flexDirection: 'row',
    gap: 8,
  },
  statBar: {
    height: 10,
    borderRadius: 999,
  },
  statBarHome: {
    backgroundColor: '#1f5fa8',
  },
  statBarAway: {
    backgroundColor: C.accent,
  },
  lineupCard: {
    borderTopWidth: 1,
    borderTopColor: C.bg,
    paddingTop: 12,
    paddingBottom: 6,
  },
  lineupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lineupTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  lineupTeamName: {
    color: C.text,
    fontSize: 16,
    fontWeight: '900',
  },
  lineupFormation: {
    color: C.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  lineupSubTitle: {
    marginTop: 10,
    color: C.live,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  lineupBench: {
    marginTop: 14,
  },
  playerListRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  playerNumber: {
    width: 24,
    color: C.muted,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  playerName: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
  },
  playerPos: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  playerStatRow: {
    borderTopWidth: 1,
    borderTopColor: C.bg,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankText: {
    width: 22,
    color: C.muted,
    fontSize: 14,
    fontWeight: '900',
  },
  playerIdentityWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playerTeamLogo: {
    backgroundColor: C.panelAlt,
  },
  playerIdentityTextWrap: {
    flex: 1,
  },
  playerStatName: {
    color: C.text,
    fontSize: 16,
    fontWeight: '900',
  },
  playerStatMeta: {
    marginTop: 2,
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  impactBadge: {
    minWidth: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: C.accent,
    alignItems: 'center',
  },
  impactBadgeText: {
    color: C.accentDark,
    fontSize: 14,
    fontWeight: '900',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: C.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: C.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: C.accentDark,
    fontSize: 14,
    fontWeight: '900',
  },
});

