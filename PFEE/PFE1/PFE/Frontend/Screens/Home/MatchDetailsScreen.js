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

const getStatusBadge = (phase) => {
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

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!matchId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const [matchData, eventData, statData, lineupData] = await Promise.all([
          matchService.getMatchById(matchId),
          matchService.getMatchEvents(matchId),
          matchService.getMatchStatistics(matchId),
          matchService.getMatchLineups(matchId),
        ]);
        const providerStatus = await matchService.getProviderStatus();

        if (!mounted) return;

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
  const badge = getStatusBadge(phase);

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
            <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Ionicons name="football-outline" size={18} color="#E2E8F0" />
            <Text style={styles.headerTitle}>Football</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.85}>
              <Ionicons name="share-social-outline" size={20} color="#F8FAFC" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.85}>
              <Ionicons name="star-outline" size={20} color="#F8FAFC" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FF0A5B" />
          <Text style={styles.loadingText}>Chargement des details...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.competitionBar}>
            <View style={styles.competitionLeft}>
              <LeagueLogo source={match} size={18} style={styles.competitionLogo} />
              <Text style={styles.competitionText} numberOfLines={1}>{competitionLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#475569" />
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
                <Ionicons name="flash-outline" size={18} color="#0F172A" />
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
                <Ionicons name="flash-outline" size={18} color="#0F172A" />
              </View>

              {events.length === 0 ? (
                <View>
                  <Text style={styles.emptyText}>
                    {providerBlockedMessage || 'Aucun evenement pour le moment.'}
                  </Text>
                </View>
              ) : (
                <View>
                  <SummaryEventGroup title="Buts" icon="football-outline" events={goalEvents} />
                  <SummaryEventGroup title="Cartons" icon="square-outline" events={cardEvents} />
                  <SummaryEventGroup title="Remplacements" icon="swap-horizontal-outline" events={subEvents} />

                  {timelineEvents
                    .filter((event) => !isGoalEvent(event) && !isCardEvent(event) && !isSubEvent(event))
                    .map((event, index) => (
                      <View key={event?.id || `${event?.type}-${index}`} style={styles.timelineRow}>
                        <Text style={styles.timelineMinute}>{getEventMinuteLabel(event)}</Text>
                        <View style={styles.timelineIconWrap}>
                          <Ionicons
                            name={EVENT_ICON_BY_TYPE[event?.type] || 'ellipse-outline'}
                            size={16}
                            color="#0F172A"
                          />
                        </View>
                        <View style={styles.timelineBody}>
                          <Text style={styles.timelineTitle}>{getEventTitle(event)}</Text>
                          <Text style={styles.timelineSubtitle}>{event?.team?.name || event?.teamName || 'Equipe'}</Text>
                        </View>
                      </View>
                    ))}
                </View>
              )}
            </View>
          ) : null}

          {activeTab === 'stats' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Top stats</Text>
                <Ionicons name="stats-chart-outline" size={18} color="#0F172A" />
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
                <Ionicons name="people-outline" size={18} color="#0F172A" />
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
                <Ionicons name="person-outline" size={18} color="#0F172A" />
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

function SummaryEventGroup({ title, icon, events }) {
  return (
    <View>
      <View style={styles.summaryGroupHeader}>
        <Ionicons name={icon} size={16} color="#0F172A" />
        <Text style={styles.summaryGroupTitle}>{title}</Text>
      </View>

      {!events?.length ? (
        <Text style={styles.summaryGroupEmpty}>Aucun</Text>
      ) : (
        events.map((event, index) => (
          <View key={event?.id || `${title}-${index}`} style={styles.timelineRow}>
            <Text style={styles.timelineMinute}>{getEventMinuteLabel(event)}</Text>
            <View style={styles.timelineIconWrap}>
              <Ionicons
                name={EVENT_ICON_BY_TYPE[event?.type] || 'ellipse-outline'}
                size={16}
                color="#0F172A"
              />
            </View>
            <View style={styles.timelineBody}>
              <Text style={styles.timelineTitle}>{getSummaryItemText(event)}</Text>
              {isGoalEvent(event) && event?.assist?.name ? (
                <Text style={styles.timelineSubtitle}>Assist: {event.assist.name}</Text>
              ) : null}
              {isGoalEvent(event) && event?.scoreLabel ? (
                <Text style={styles.timelineSubtitle}>Score: {event.scoreLabel}</Text>
              ) : null}
              {isSubEvent(event) ? (
                <Text style={styles.timelineSubtitle}>{event?.team?.name || event?.teamName || 'Equipe'}</Text>
              ) : null}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF2F7',
  },
  header: {
    backgroundColor: '#002D3B',
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
    backgroundColor: '#0A4354',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerTitle: {
    color: '#F8FAFC',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7DEE8',
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
    backgroundColor: '#F1F5F9',
    borderWidth: 0,
  },
  competitionText: {
    flex: 1,
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scorePanel: {
    marginTop: 10,
    marginHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D7DEE8',
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#F8FAFC',
  },
  teamMainName: {
    marginTop: 8,
    color: '#0F172A',
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
    color: '#64748B',
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
    color: '#FF0A5B',
    fontSize: 50,
    lineHeight: 58,
    fontWeight: '900',
  },
  scoreDash: {
    color: '#FF0A5B',
    fontSize: 42,
    lineHeight: 52,
    fontWeight: '900',
    marginTop: -2,
  },
  phaseText: {
    color: '#BE123C',
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
    backgroundColor: '#FFE4EC',
  },
  badgeLiveText: {
    color: '#BE123C',
  },
  badgeFinished: {
    backgroundColor: '#DCFCE7',
  },
  badgeFinishedText: {
    color: '#166534',
  },
  badgeScheduled: {
    backgroundColor: '#E2E8F0',
  },
  badgeScheduledText: {
    color: '#334155',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7DEE8',
  },
  tabButtonActive: {
    backgroundColor: '#FF0A5B',
    borderColor: '#FF0A5B',
  },
  tabText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  sectionCard: {
    marginTop: 12,
    marginHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D7DEE8',
    padding: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 6,
  },
  emptyHint: {
    marginTop: 6,
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  infoFallbackRow: {
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  infoFallbackLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  infoFallbackValue: {
    flex: 1,
    textAlign: 'right',
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
  },
  timelineMinute: {
    width: 44,
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
  },
  timelineIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#D7DEE8',
  },
  timelineBody: {
    flex: 1,
  },
  timelineTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  timelineSubtitle: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryGroupHeader: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryGroupTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  summaryGroupEmpty: {
    marginTop: 6,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  statBlock: {
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
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
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  statLabel: {
    flex: 1,
    color: '#0F172A',
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
    backgroundColor: '#0B3A48',
  },
  statBarAway: {
    backgroundColor: '#FF0A5B',
  },
  lineupCard: {
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
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
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  lineupFormation: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
  lineupSubTitle: {
    marginTop: 10,
    color: '#BE123C',
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
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  playerNumber: {
    width: 24,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  playerName: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  playerPos: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  playerStatRow: {
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankText: {
    width: 22,
    color: '#334155',
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
    backgroundColor: '#F8FAFC',
  },
  playerIdentityTextWrap: {
    flex: 1,
  },
  playerStatName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  playerStatMeta: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  impactBadge: {
    minWidth: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: '#E6F0FF',
    alignItems: 'center',
  },
  impactBadgeText: {
    color: '#1D4ED8',
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
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F7',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#FF0A5B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
