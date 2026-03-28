import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LeagueLogo from '../components/LeagueLogo';
import { matchService } from '../services/matchService';
import { useAppTheme } from '../src/theme/AppThemeContext';

export default function MatchesScreen() {
  const { palette: C } = useAppTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matchesError, setMatchesError] = useState('');

  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    setLoading(true);
    const { matches: matchesData, error } = await matchService.getAllMatchesState();
    setMatchesError(error);
    if (!error) {
      setMatches(matchesData);
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const { matches: matchesData, error } = await matchService.getAllMatchesState();
    setMatchesError(error);
    if (!error) {
      setMatches(matchesData);
    }
    setRefreshing(false);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'live': return C.live;
      case 'finished': return C.success;
      case 'scheduled': return C.muted;
      default: return C.muted;
    }
  };

  const getStatusLabel = (status) => {
    switch(status) {
      case 'live': return '🔴 LIVE';
      case 'finished': return '✓ FT';
      case 'scheduled': return '🕐';
      default: return status;
    }
  };

  const renderMatch = ({ item }) => (
    <View style={styles.matchCard}>
      <View style={[styles.statusBar, { backgroundColor: getStatusColor(item.status) }]}>
        <Text style={styles.statusLabel}>{getStatusLabel(item.status)}</Text>
        <View style={styles.leagueWrap}>
          <LeagueLogo source={item} size={16} style={styles.leagueLogo} />
          <Text style={styles.leagueName}>{item.league}</Text>
        </View>
      </View>

      <View style={styles.matchContent}>
        <View style={styles.dateSection}>
          <Text style={styles.date}>{formatDate(item.date)}</Text>
          {item.status === 'scheduled' && (
            <Text style={styles.time}>{formatTime(item.date)}</Text>
          )}
        </View>

        <View style={styles.teamSection}>
          <Text style={styles.teamName}>{item.homeTeam}</Text>
        </View>

        <View style={styles.scoreSection}>
          {item.status === 'scheduled' ? (
            <Text style={styles.timeDisplay}>{formatTime(item.date)}</Text>
          ) : (
            <Text style={styles.score}>
              {item.homeScore ?? '-'} - {item.awayScore ?? '-'}
            </Text>
          )}
        </View>

        <View style={styles.teamSection}>
          <Text style={styles.teamName}>{item.awayTeam}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="football-outline" size={24} color={C.accent} />
          
          <Text style={styles.headerTitle}>Matches</Text>
        </View>
        <TouchableOpacity onPress={loadMatches}>
          <Ionicons name="refresh" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={C.accent} />
          
          <Text style={styles.loadingText}>Chargement des matches...</Text>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons
            name={matchesError ? 'cloud-offline-outline' : 'alert-circle-outline'}
            size={48}
            color={matchesError ? C.live : C.muted}
          />
          <Text style={styles.emptyText}>
            {matchesError ? 'Backend indisponible' : 'Aucun match disponible'}
          </Text>
          <Text style={styles.emptySubtext}>
            {matchesError || "Importez les matches depuis l'API"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item._id}
          renderItem={renderMatch}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (C) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  headerTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 8
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16
  },
  loadingText: {
    color: C.muted,
    marginTop: 12,
    fontSize: 14
  },
  emptyText: {
    color: C.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16
  },
  emptySubtext: {
    color: C.muted,
    fontSize: 14,
    marginTop: 8
  },
  listContent: {
    padding: 12
  },
  matchCard: {
    backgroundColor: C.panel,
    borderRadius: 22,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  statusLabel: {
    color: C.white,
    fontSize: 12,
    fontWeight: 'bold'
  },
  leagueName: {
    color: C.white,
    fontSize: 11,
    fontWeight: '600'
  },
  leagueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.panelAlt,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999
  },
  leagueLogo: {
    backgroundColor: C.accent,
    borderWidth: 0
  },
  matchContent: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center'
  },
  dateSection: {
    width: 45,
    alignItems: 'center'
  },
  date: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600'
  },
  time: {
    color: C.accent,
    fontSize: 10,
    marginTop: 2
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8
  },
  teamName: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center'
  },
  scoreSection: {
    width: 50,
    alignItems: 'center'
  },
  score: {
    color: C.text,
    fontSize: 16,
    fontWeight: 'bold'
  },
  timeDisplay: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '600'
  }
});
