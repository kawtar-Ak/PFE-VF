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

const EVENT_ICONS = {
  Goal: '⚽',
  Card: '🟨',
  subst: '🔁',
  Var: '🎥',
};

const IMPORTANT_STATS = [
  'Ball Possession',
  'Total Shots',
  'Shots on Goal',
  'Fouls',
  'Corner Kicks',
  'Offsides',
];

const getEventIcon = (event) => {
  if (event?.type === 'Card' && String(event?.detail || '').toLowerCase().includes('red')) {
    return '🟥';
  }

  return EVENT_ICONS[event?.type] || '•';
};

const getEventPrimaryText = (event) => {
  if (event?.type === 'Goal') {
    return event?.player?.name ? `But: ${event.player.name}` : 'But';
  }

  if (event?.type === 'Card') {
    return event?.player?.name
      ? `${event.detail || 'Carton'}: ${event.player.name}`
      : event?.detail || 'Carton';
  }

  if (event?.type === 'subst') {
    return event?.player?.name
      ? `Remplacement: ${event.player.name}`
      : 'Remplacement';
  }

  return event?.detail || event?.type || 'Evenement';
};

const getEventSecondaryText = (event) => {
  const parts = [];

  if (event?.type === 'Goal' && event?.assist?.name) {
    parts.push(`Passe: ${event.assist.name}`);
  }

  if (event?.type === 'subst' && event?.assist?.name) {
    parts.push(`Sortie: ${event.assist.name}`);
  }

  if (event?.team?.name) {
    parts.push(event.team.name);
  }

  if (event?.comments) {
    parts.push(event.comments);
  }

  return parts.join(' • ');
};

const getEventTimeLabel = (event) => {
  const minute = event?.minute;
  const extraMinute = event?.extraMinute;

  if (!minute && minute !== 0) {
    return '-';
  }

  if (extraMinute || extraMinute === 0) {
    return `${minute}+${extraMinute}'`;
  }

  return `${minute}'`;
};

const getMatchTimeLabel = (match) => {
  const minute = match?.minute;
  const statusShort = String(match?.statusShort || '').toUpperCase();

  if (minute || minute === 0) {
    return statusShort ? `${minute}' (${statusShort})` : `${minute}'`;
  }

  if (statusShort) {
    return statusShort;
  }

  return '-';
};

export default function MatchDetailsScreen({ route, navigation }) {
  const initialMatch = route?.params?.match || null;
  const [match, setMatch] = useState(initialMatch);
  const [events, setEvents] = useState([]);
  const [statistics, setStatistics] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [loading, setLoading] = useState(Boolean(initialMatch));

  const matchId = initialMatch?.matchId || initialMatch?.apiMatchId || null;

  useEffect(() => {
    let isMounted = true;

    const loadMatchData = async () => {
      if (!matchId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [detailedMatch, nextEvents, nextStatistics, nextLineups] = await Promise.all([
          matchService.getMatchById(matchId),
          matchService.getMatchEvents(matchId),
          matchService.getMatchStatistics(matchId),
          matchService.getMatchLineups(matchId),
        ]);

        if (!isMounted) {
          return;
        }

        if (detailedMatch) {
          setMatch((previous) => ({
            ...previous,
            ...detailedMatch,
          }));
        }

        setEvents(Array.isArray(nextEvents) ? nextEvents : []);
        setStatistics(Array.isArray(nextStatistics) ? nextStatistics : []);
        setLineups(Array.isArray(nextLineups) ? nextLineups : []);
      } catch (error) {
        console.error('Erreur chargement details match:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadMatchData();

    return () => {
      isMounted = false;
    };
  }, [matchId]);

  const matchDate = useMemo(() => {
    if (!match?.date) {
      return null;
    }

    return new Date(match.date);
  }, [match?.date]);

  const filteredStatistics = useMemo(() => {
    return statistics.map((teamStats) => ({
      ...teamStats,
      statistics: (teamStats?.statistics || []).filter((stat) => IMPORTANT_STATS.includes(stat.type)),
    }));
  }, [statistics]);

  if (!initialMatch && !match) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Match introuvable</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.88}>
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = String(match?.status || '').toUpperCase();
  const isLive = status === 'LIVE';
  const isFinished = status === 'FINISHED';

  const statusLabel = isLive ? 'LIVE' : isFinished ? 'TERMINE' : 'A VENIR';
  const scoreHome = isFinished || isLive ? match?.homeScore ?? match?.score?.home ?? '-' : '-';
  const scoreAway = isFinished || isLive ? match?.awayScore ?? match?.score?.away ?? '-' : '-';

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{match?.league || 'Match'}</Text>
        <View style={styles.topBarSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FF4D4D" />
          <Text style={styles.loadingText}>Chargement des details...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLeague}>{match?.league || 'Competition'}</Text>
            <Text style={styles.heroDate}>
              {matchDate
                ? matchDate.toLocaleString('fr-FR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Date indisponible'}
            </Text>

            <View style={styles.scoreBoard}>
              <View style={styles.teamColumn}>
                <Text style={styles.teamLabel}>Domicile</Text>
                <View style={styles.teamIdentity}>
                  <TeamLogo uri={match?.homeTeamLogo} size={42} />
                  <Text style={styles.teamName}>{match?.homeTeam || 'Equipe locale'}</Text>
                </View>
              </View>

              <View style={styles.scoreBox}>
                <Text style={[styles.score, isLive && styles.liveScore]}>{scoreHome}</Text>
                <Text style={styles.scoreDivider}>-</Text>
                <Text style={[styles.score, isLive && styles.liveScore]}>{scoreAway}</Text>
              </View>

              <View style={styles.teamColumn}>
                <Text style={styles.teamLabel}>Exterieur</Text>
                <View style={styles.teamIdentity}>
                  <TeamLogo uri={match?.awayTeamLogo} size={42} />
                  <Text style={styles.teamName}>{match?.awayTeam || 'Equipe visiteuse'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.heroFooter}>
              <View style={[styles.statusPill, isLive && styles.statusPillLive, isFinished && styles.statusPillFinished]}>
                <Text style={[styles.statusText, isLive && styles.statusTextLive, isFinished && styles.statusTextFinished]}>
                  {statusLabel}
                </Text>
              </View>
              <Text style={styles.minuteText}>{getMatchTimeLabel(match)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Informations</Text>
            <InfoRow label="Pays" value={match?.country || '-'} />
            <InfoRow label="Ligue" value={match?.league || '-'} />
            <InfoRow label="Saison" value={match?.season?.toString?.() || '-'} />
            <InfoRow label="Tour" value={match?.round || '-'} />
            <InfoRow label="Temps du match" value={getMatchTimeLabel(match)} />
            <InfoRow label="Stade" value={match?.stadium || match?.venue || '-'} />
            <InfoRow label="Ville" value={match?.city || '-'} />
            <InfoRow label="Arbitre" value={match?.referee || '-'} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Evenements</Text>
            {events.length === 0 ? (
              <Text style={styles.emptySectionText}>Aucun evenement disponible</Text>
            ) : (
              events.map((event) => (
                <View key={event.id} style={styles.eventRow}>
                  <Text style={styles.eventMinute}>{getEventTimeLabel(event)}</Text>
                  <Text style={styles.eventIcon}>{getEventIcon(event)}</Text>
                  <View style={styles.eventContent}>
                    <Text style={styles.eventTitle}>
                      {getEventPrimaryText(event)}
                    </Text>
                    {getEventSecondaryText(event) ? (
                      <Text style={styles.eventSubtitle}>{getEventSecondaryText(event)}</Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Statistiques</Text>
            {filteredStatistics.length < 2 ? (
              <Text style={styles.emptySectionText}>Aucune statistique disponible</Text>
            ) : (
              IMPORTANT_STATS.map((statType) => {
                const homeStat = filteredStatistics[0]?.statistics?.find((stat) => stat.type === statType)?.value ?? '-';
                const awayStat = filteredStatistics[1]?.statistics?.find((stat) => stat.type === statType)?.value ?? '-';

                return (
                  <View key={statType} style={styles.statRow}>
                    <Text style={styles.statValue}>{String(homeStat)}</Text>
                    <Text style={styles.statLabel}>{statType}</Text>
                    <Text style={styles.statValue}>{String(awayStat)}</Text>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Compositions</Text>
            {lineups.length === 0 ? (
              <Text style={styles.emptySectionText}>Aucune composition disponible</Text>
            ) : (
              lineups.map((lineup) => (
                <View key={lineup?.team?.id || lineup?.team?.name} style={styles.lineupBlock}>
                  <Text style={styles.lineupTitle}>
                    {lineup?.team?.name || 'Equipe'}{lineup?.formation ? ` • ${lineup.formation}` : ''}
                  </Text>
                  <Text style={styles.lineupSubtitle}>Titulaire</Text>
                  {(lineup?.startingXI || []).map((player) => (
                    <Text key={`start-${lineup?.team?.id}-${player.id || player.name}`} style={styles.playerRow}>
                      {player.number ? `${player.number}. ` : ''}{player.name || '-'}{player.position ? ` (${player.position})` : ''}
                    </Text>
                  ))}
                  <Text style={[styles.lineupSubtitle, styles.subSectionSpacing]}>Remplacants</Text>
                  {(lineup?.substitutes || []).map((player) => (
                    <Text key={`sub-${lineup?.team?.id}-${player.id || player.name}`} style={styles.playerRow}>
                      {player.number ? `${player.number}. ` : ''}{player.name || '-'}{player.position ? ` (${player.position})` : ''}
                    </Text>
                  ))}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050B16',
  },
  topBar: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1220',
    borderBottomWidth: 1,
    borderBottomColor: '#15233A',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121C2E',
    borderWidth: 1,
    borderColor: '#15233A',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  topBarSpacer: {
    width: 42,
  },
  loadingWrap: {
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
  content: {
    padding: 16,
    paddingBottom: 30,
  },
  heroCard: {
    backgroundColor: '#0B1220',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#15233A',
    padding: 20,
  },
  heroLeague: {
    color: '#E8EEF8',
    fontSize: 16,
    fontWeight: '900',
  },
  heroDate: {
    marginTop: 6,
    color: '#A9B6CC',
    fontSize: 13,
    lineHeight: 20,
  },
  scoreBoard: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center',
  },
  teamIdentity: {
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  teamLabel: {
    color: '#7F8AA3',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  teamName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  scoreBox: {
    minWidth: 116,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#121C2E',
    borderWidth: 1,
    borderColor: '#15233A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  liveScore: {
    color: '#FF4D4D',
  },
  scoreDivider: {
    marginHorizontal: 8,
    color: '#7F8AA3',
    fontSize: 14,
    fontWeight: '900',
  },
  heroFooter: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#121C2E',
    borderWidth: 1,
    borderColor: '#15233A',
  },
  statusPillLive: {
    backgroundColor: '#3A1212',
    borderColor: '#5B1A1A',
  },
  statusPillFinished: {
    backgroundColor: '#0E2E1A',
    borderColor: '#164A29',
  },
  statusText: {
    color: '#E8EEF8',
    fontSize: 12,
    fontWeight: '900',
  },
  statusTextLive: {
    color: '#FF4D4D',
  },
  statusTextFinished: {
    color: '#34D399',
  },
  minuteText: {
    color: '#FF4D4D',
    fontSize: 16,
    fontWeight: '900',
  },
  card: {
    marginTop: 16,
    backgroundColor: '#0B1220',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#15233A',
    padding: 18,
  },
  sectionTitle: {
    color: '#E8EEF8',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#101827',
  },
  infoLabel: {
    color: '#7F8AA3',
    fontSize: 12,
    fontWeight: '800',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#101827',
  },
  eventMinute: {
    width: 38,
    color: '#FF4D4D',
    fontSize: 13,
    fontWeight: '900',
  },
  eventIcon: {
    width: 22,
    color: '#FFFFFF',
    fontSize: 14,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  eventSubtitle: {
    marginTop: 2,
    color: '#A9B6CC',
    fontSize: 12,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#101827',
  },
  statValue: {
    width: 70,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  statLabel: {
    flex: 1,
    color: '#A9B6CC',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  lineupBlock: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#101827',
  },
  lineupTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 10,
  },
  lineupSubtitle: {
    color: '#FF4D4D',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
  },
  subSectionSpacing: {
    marginTop: 10,
  },
  playerRow: {
    color: '#E8EEF8',
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 2,
  },
  emptySectionText: {
    color: '#A9B6CC',
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#050B16',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 14,
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#121C2E',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
