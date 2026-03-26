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

import LeagueLogo from '../../components/LeagueLogo';
import TeamLogo from '../../components/TeamLogo';
import { matchService } from '../../services/matchService';

const CUP_NAME_HINTS = ['cup', 'copa', 'coupe', 'champions league', 'europa', 'conference', 'trophy'];
const KNOCKOUT_HINTS = ['final', 'semi', 'quarter', 'round of 16', '1/8', '1/4', '1/2', 'play-off', 'knockout'];

const normalize = (value) => String(value || '').toLowerCase();

const detectCompetitionType = (league, matches) => {
  const leagueName = normalize(league);
  const byName = CUP_NAME_HINTS.some((hint) => leagueName.includes(hint));
  const byRound = matches.some((match) => KNOCKOUT_HINTS.some((hint) => normalize(match?.round).includes(hint)));
  return byName || byRound ? 'cup' : 'league';
};

const getScoreValue = (value) => {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildFallbackTable = (matches) => {
  const stats = {};

  matches.forEach((match) => {
    const home = match?.homeTeam;
    const away = match?.awayTeam;
    const homeScore = getScoreValue(match?.homeScore ?? match?.score?.home);
    const awayScore = getScoreValue(match?.awayScore ?? match?.score?.away);
    if (!home || !away || homeScore === null || awayScore === null) return;

    if (!stats[home]) {
      stats[home] = { rank: 0, team: { name: home, logo: match?.homeTeamLogo || null }, all: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } }, goalsDiff: 0, points: 0, form: '' };
    }
    if (!stats[away]) {
      stats[away] = { rank: 0, team: { name: away, logo: match?.awayTeamLogo || null }, all: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } }, goalsDiff: 0, points: 0, form: '' };
    }

    const homeRow = stats[home];
    const awayRow = stats[away];

    homeRow.all.played += 1;
    awayRow.all.played += 1;
    homeRow.all.goals.for += homeScore;
    homeRow.all.goals.against += awayScore;
    awayRow.all.goals.for += awayScore;
    awayRow.all.goals.against += homeScore;

    if (homeScore > awayScore) {
      homeRow.all.win += 1;
      awayRow.all.lose += 1;
      homeRow.points += 3;
      homeRow.form = `W${homeRow.form}`.slice(0, 5);
      awayRow.form = `L${awayRow.form}`.slice(0, 5);
    } else if (awayScore > homeScore) {
      awayRow.all.win += 1;
      homeRow.all.lose += 1;
      awayRow.points += 3;
      awayRow.form = `W${awayRow.form}`.slice(0, 5);
      homeRow.form = `L${homeRow.form}`.slice(0, 5);
    } else {
      homeRow.all.draw += 1;
      awayRow.all.draw += 1;
      homeRow.points += 1;
      awayRow.points += 1;
      homeRow.form = `D${homeRow.form}`.slice(0, 5);
      awayRow.form = `D${awayRow.form}`.slice(0, 5);
    }

    homeRow.goalsDiff = homeRow.all.goals.for - homeRow.all.goals.against;
    awayRow.goalsDiff = awayRow.all.goals.for - awayRow.all.goals.against;
  });

  return Object.values(stats)
    .sort((left, right) => (
      right.points - left.points ||
      right.goalsDiff - left.goalsDiff ||
      right.all.goals.for - left.all.goals.for ||
      (left.team?.name || '').localeCompare(right.team?.name || '')
    ))
    .map((row, index) => ({ ...row, rank: index + 1 }));
};

const getFormColor = (char) => {
  if (char === 'W') return '#22C55E';
  if (char === 'L') return '#EF4444';
  return '#E2E8F0';
};

const renderForm = (form) => {
  const safe = String(form || '').toUpperCase().replace(/[^WDL]/g, '').slice(0, 5);
  if (!safe) return <Text style={styles.formEmpty}>-</Text>;

  return (
    <View style={styles.formWrap}>
      {safe.split('').map((char, index) => (
        <View key={`${char}-${index}`} style={[styles.formDot, { backgroundColor: getFormColor(char) }]} />
      ))}
    </View>
  );
};

export default function LeagueCompetitionScreen({ route, navigation }) {
  const league = route?.params?.league || '';
  const leagueMeta = route?.params?.leagueMeta || { league };

  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);

        const [leagueMatches, leagueStandings] = await Promise.all([
          matchService.getMatchesByLeague(league),
          matchService.getLeagueStandings(leagueMeta?.leagueId, leagueMeta?.season, league),
        ]);

        if (!mounted) return;
        setMatches(Array.isArray(leagueMatches) ? leagueMatches : []);
        setStandings(Array.isArray(leagueStandings) ? leagueStandings : []);
      } catch (error) {
        console.error('Erreur chargement competition:', error);
        if (mounted) {
          setMatches([]);
          setStandings([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [league, leagueMeta?.leagueId, leagueMeta?.season]);

  const competitionType = useMemo(() => detectCompetitionType(league, matches), [league, matches]);
  const sortedStandings = useMemo(() => {
    if (standings.length > 0) {
      return [...standings].sort((left, right) => (left?.rank || 0) - (right?.rank || 0));
    }
    return buildFallbackTable(matches);
  }, [matches, standings]);

  const standingsByGroup = useMemo(() => {
    if (standings.length === 0) return [];

    const grouped = standings.reduce((accumulator, row) => {
      const group = row?.group || 'Classement';
      if (!accumulator[group]) accumulator[group] = [];
      accumulator[group].push(row);
      return accumulator;
    }, {});

    return Object.entries(grouped)
      .map(([group, rows]) => ({
        group,
        rows: [...rows].sort((left, right) => (left?.rank || 0) - (right?.rank || 0)),
      }))
      .sort((left, right) => left.group.localeCompare(right.group));
  }, [standings]);

  const hasMultipleGroups = standingsByGroup.length > 1;
  const showStandingsTable = competitionType === 'league' || !hasMultipleGroups;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <LeagueLogo source={leagueMeta} size={20} style={styles.headerLogo} />
          <Text style={styles.title} numberOfLines={1}>{league || 'Competition'}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FF4D4D" />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.typeCard}>
            <Text style={styles.typeTitle}>Type detecte</Text>
            <Text style={styles.typeValue}>{competitionType === 'league' ? 'Championnat' : 'Cup / Tournoi'}</Text>
          </View>

          {showStandingsTable ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Classement</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.headCell, styles.colRank]}>#</Text>
                    <Text style={[styles.headCell, styles.colTeam]}>Equipe</Text>
                    <Text style={[styles.headCell, styles.colNum]}>MJ</Text>
                    <Text style={[styles.headCell, styles.colNum]}>V</Text>
                    <Text style={[styles.headCell, styles.colNum]}>N</Text>
                    <Text style={[styles.headCell, styles.colNum]}>D</Text>
                    <Text style={[styles.headCell, styles.colGoals]}>BP/BC</Text>
                    <Text style={[styles.headCell, styles.colDiff]}>Diff</Text>
                    <Text style={[styles.headCell, styles.colPts]}>Pts</Text>
                    <Text style={[styles.headCell, styles.colForm]}>Forme</Text>
                  </View>

                  {sortedStandings.length === 0 ? (
                    <Text style={styles.emptyText}>Aucune donnee de classement disponible</Text>
                  ) : sortedStandings.map((row) => (
                    <View key={`${row?.team?.id || row?.team?.name}-${row?.rank}`} style={styles.tableRow}>
                      <Text style={[styles.rowCell, styles.colRank]}>{row?.rank ?? '-'}</Text>
                      <View style={[styles.colTeam, styles.teamCell]}>
                        <TeamLogo uri={row?.team?.logo} size={18} />
                        <Text style={styles.teamName} numberOfLines={1}>{row?.team?.name || '-'}</Text>
                      </View>
                      <Text style={[styles.rowCell, styles.colNum]}>{row?.all?.played ?? '-'}</Text>
                      <Text style={[styles.rowCell, styles.colNum]}>{row?.all?.win ?? '-'}</Text>
                      <Text style={[styles.rowCell, styles.colNum]}>{row?.all?.draw ?? '-'}</Text>
                      <Text style={[styles.rowCell, styles.colNum]}>{row?.all?.lose ?? '-'}</Text>
                      <Text style={[styles.rowCell, styles.colGoals]}>
                        {row?.all?.goals?.for ?? '-'} / {row?.all?.goals?.against ?? '-'}
                      </Text>
                      <Text style={[styles.rowCell, styles.colDiff]}>
                        {typeof row?.goalsDiff === 'number' && row.goalsDiff > 0 ? `+${row.goalsDiff}` : (row?.goalsDiff ?? '-')}
                      </Text>
                      <Text style={[styles.rowCell, styles.colPts, styles.pointsText]}>{row?.points ?? '-'}</Text>
                      <View style={[styles.colForm, styles.formCell]}>
                        {renderForm(row?.form)}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : hasMultipleGroups ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Classement par groupes</Text>
              {standingsByGroup.map((groupItem) => (
                <View key={groupItem.group} style={styles.groupBlock}>
                  <Text style={styles.groupTitle}>{groupItem.group}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.headCell, styles.colRank]}>#</Text>
                        <Text style={[styles.headCell, styles.colTeam]}>Equipe</Text>
                        <Text style={[styles.headCell, styles.colNum]}>MJ</Text>
                        <Text style={[styles.headCell, styles.colNum]}>V</Text>
                        <Text style={[styles.headCell, styles.colNum]}>N</Text>
                        <Text style={[styles.headCell, styles.colNum]}>D</Text>
                        <Text style={[styles.headCell, styles.colGoals]}>BP/BC</Text>
                        <Text style={[styles.headCell, styles.colDiff]}>Diff</Text>
                        <Text style={[styles.headCell, styles.colPts]}>Pts</Text>
                        <Text style={[styles.headCell, styles.colForm]}>Forme</Text>
                      </View>
                      {groupItem.rows.map((row) => (
                        <View key={`${groupItem.group}-${row?.team?.id || row?.team?.name}-${row?.rank}`} style={styles.tableRow}>
                          <Text style={[styles.rowCell, styles.colRank]}>{row?.rank ?? '-'}</Text>
                          <View style={[styles.colTeam, styles.teamCell]}>
                            <TeamLogo uri={row?.team?.logo} size={18} />
                            <Text style={styles.teamName} numberOfLines={1}>{row?.team?.name || '-'}</Text>
                          </View>
                          <Text style={[styles.rowCell, styles.colNum]}>{row?.all?.played ?? '-'}</Text>
                          <Text style={[styles.rowCell, styles.colNum]}>{row?.all?.win ?? '-'}</Text>
                          <Text style={[styles.rowCell, styles.colNum]}>{row?.all?.draw ?? '-'}</Text>
                          <Text style={[styles.rowCell, styles.colNum]}>{row?.all?.lose ?? '-'}</Text>
                          <Text style={[styles.rowCell, styles.colGoals]}>
                            {row?.all?.goals?.for ?? '-'} / {row?.all?.goals?.against ?? '-'}
                          </Text>
                          <Text style={[styles.rowCell, styles.colDiff]}>
                            {typeof row?.goalsDiff === 'number' && row.goalsDiff > 0 ? `+${row.goalsDiff}` : (row?.goalsDiff ?? '-')}
                          </Text>
                          <Text style={[styles.rowCell, styles.colPts, styles.pointsText]}>{row?.points ?? '-'}</Text>
                          <View style={[styles.colForm, styles.formCell]}>
                            {renderForm(row?.form)}
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Competition a elimination</Text>
              <Text style={styles.emptyText}>
                Aucun standings league disponible pour cette competition.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  headerLogo: { backgroundColor: '#F1F5F9', borderWidth: 0 },
  title: { flex: 1, color: '#0F172A', fontSize: 17, fontWeight: '900' },
  headerSpacer: { width: 42 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, color: '#475569', fontSize: 14, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 28 },
  typeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  typeTitle: { color: '#64748B', fontSize: 12, fontWeight: '800' },
  typeValue: { marginTop: 4, color: '#0F172A', fontSize: 16, fontWeight: '900' },
  card: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  sectionTitle: { color: '#0F172A', fontSize: 14, fontWeight: '900', marginBottom: 10 },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },
  headCell: { color: '#64748B', fontSize: 11, fontWeight: '900' },
  rowCell: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
  colRank: { width: 30, textAlign: 'center' },
  colTeam: { width: 180 },
  colNum: { width: 38, textAlign: 'center' },
  colGoals: { width: 70, textAlign: 'center' },
  colDiff: { width: 44, textAlign: 'center' },
  colPts: { width: 44, textAlign: 'center' },
  colForm: { width: 74, alignItems: 'center', justifyContent: 'center' },
  teamCell: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  teamName: { color: '#0F172A', fontSize: 12, fontWeight: '800', flex: 1 },
  pointsText: { fontWeight: '900', color: '#0F172A' },
  formCell: { flexDirection: 'row' },
  formWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  formDot: { width: 9, height: 9, borderRadius: 999 },
  formEmpty: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  groupBlock: { marginTop: 8 },
  groupTitle: { color: '#1D4ED8', fontSize: 13, fontWeight: '900', marginBottom: 8 },
  emptyText: { color: '#475569', fontSize: 12, fontWeight: '700', paddingVertical: 4 },
});
