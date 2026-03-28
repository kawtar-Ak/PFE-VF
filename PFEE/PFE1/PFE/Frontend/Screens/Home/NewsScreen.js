import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { newsService } from '../../services/newsService';
import NewsCard from '../../components/NewsCard';
import { useAppTheme } from '../../src/theme/AppThemeContext';

const NEWS_LIMIT = 20;

export default function NewsScreen() {
  const { width } = useWindowDimensions();
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(width, palette), [width, palette]);

  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadNews = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError('');

      const items = await newsService.getNews(NEWS_LIMIT);
      setNews(items);
    } catch (loadError) {
      setError(loadError?.message || 'Impossible de charger les actualites football.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadNews({ silent: true });
  }, [loadNews]);

  const handleOpenArticle = useCallback(async (url) => {
    if (!url) return;

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        setError("Impossible d'ouvrir cet article.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      setError("Erreur lors de l'ouverture de l'article.");
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={styles.loadingText}>Chargement des actualites football...</Text>
        </View>
      </View>
    );
  }

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTitleRow}>
        <Ionicons name="newspaper-outline" size={20} color={palette.accent} />
        <Text style={styles.headerTitle}>Actualites football</Text>
      </View>
      <Text style={styles.headerSubtitle}>BBC Sport - RSS officiel</Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="football-outline" size={42} color={palette.muted} />
      <Text style={styles.emptyTitle}>Aucune actualite disponible</Text>
      <Text style={styles.emptySubtitle}>Tire vers le bas pour reessayer.</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={news}
        keyExtractor={(item, index) => item?.id || `${item?.link || 'news'}-${index}`}
        renderItem={({ item }) => (
          <NewsCard item={item} onPress={() => handleOpenArticle(item?.link)} />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!error ? renderEmpty : null}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={palette.accent}
          />
        }
      />

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={palette.live} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadNews()}>
            <Text style={styles.retryText}>Reessayer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (width, C) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: C.bg,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    loadingText: {
      marginTop: 10,
      color: C.muted,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
    listContent: {
      paddingHorizontal: 12,
      paddingBottom: 28,
      width: '100%',
      maxWidth: width >= 1200 ? 1040 : width >= 900 ? 900 : '100%',
      alignSelf: 'center',
    },
    header: {
      paddingTop: 12,
      paddingBottom: 10,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitle: {
      color: C.text,
      fontSize: 24,
      fontWeight: '900',
    },
    headerSubtitle: {
      marginTop: 4,
      color: C.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    emptyWrap: {
      marginTop: 30,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 30,
    },
    emptyTitle: {
      marginTop: 10,
      color: C.text,
      fontSize: 16,
      fontWeight: '800',
    },
    emptySubtitle: {
      marginTop: 4,
      color: C.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    errorBox: {
      marginHorizontal: 12,
      marginBottom: 12,
      marginTop: 2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(255, 69, 58, 0.28)',
      backgroundColor: C.dangerSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    errorText: {
      flex: 1,
      color: C.text,
      fontSize: 12,
      fontWeight: '700',
    },
    retryButton: {
      borderRadius: 999,
      backgroundColor: C.accent,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    retryText: {
      color: C.accentDark,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
  });
