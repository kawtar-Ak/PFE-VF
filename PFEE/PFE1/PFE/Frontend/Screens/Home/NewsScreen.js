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
import { APP_THEME_COLORS } from '../../src/theme/colors';

const NEWS_LIMIT = 20;

export default function NewsScreen() {
  const { isLight } = useAppTheme();
  const { width } = useWindowDimensions();
  const palette = isLight ? APP_THEME_COLORS.light : APP_THEME_COLORS.dark;
  const styles = useMemo(() => createStyles(isLight, palette, width), [isLight, palette, width]);

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
    } catch (openError) {
      setError("Erreur lors de l'ouverture de l'article.");
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>Chargement des actualites football...</Text>
        </View>
      </View>
    );
  }

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTitleRow}>
        <Ionicons name="newspaper-outline" size={20} color={isLight ? '#0F172A' : '#E6EDF8'} />
        <Text style={styles.headerTitle}>Actualites football</Text>
      </View>
      <Text style={styles.headerSubtitle}>BBC Sport - RSS officiel</Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="football-outline" size={42} color={isLight ? '#94A3B8' : '#6E83A1'} />
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
          <NewsCard item={item} isLight={isLight} onPress={() => handleOpenArticle(item?.link)} />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!error ? renderEmpty : null}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={palette.primary}
          />
        }
      />

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={isLight ? '#B91C1C' : '#FCA5A5'} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadNews()}>
            <Text style={styles.retryText}>Reessayer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (isLight, palette, width) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.background,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    loadingText: {
      marginTop: 10,
      color: isLight ? '#475569' : '#9FB1C9',
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
      color: palette.text,
      fontSize: 24,
      fontWeight: '900',
    },
    headerSubtitle: {
      marginTop: 4,
      color: isLight ? '#56647B' : '#90A1BC',
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
      color: isLight ? '#334155' : '#C5D3E6',
      fontSize: 16,
      fontWeight: '800',
    },
    emptySubtitle: {
      marginTop: 4,
      color: isLight ? '#64748B' : '#8EA1BC',
      fontSize: 13,
      fontWeight: '700',
    },
    errorBox: {
      marginHorizontal: 12,
      marginBottom: 12,
      marginTop: 2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isLight ? '#F5C2C2' : '#5C2222',
      backgroundColor: isLight ? '#FFF1F1' : '#2A1212',
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    errorText: {
      flex: 1,
      color: isLight ? '#B91C1C' : '#FCA5A5',
      fontSize: 12,
      fontWeight: '700',
    },
    retryButton: {
      borderRadius: 999,
      backgroundColor: isLight ? '#ffd8c9' : '#46586b',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    retryText: {
      color: isLight ? palette.primary : '#e4f1fe',
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
  });
