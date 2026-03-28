import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../src/theme/AppThemeContext';

const formatDate = (value) => {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function NewsCard({ item, onPress }) {
  const { palette } = useAppTheme();
  const styles = createStyles(palette);
  const hasImage = Boolean(item?.image);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Lire l'article: ${item?.title || 'Actualite football'}`}
    >
      {hasImage ? (
        <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.imageFallback}>
          <Ionicons name="newspaper-outline" size={28} color={palette.muted} />
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{item?.title || 'Actualite football'}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.source}>{item?.source || 'BBC Sport'}</Text>
          <Text style={styles.dot}>-</Text>
          <Text style={styles.date}>{formatDate(item?.pubDate)}</Text>
        </View>

        <Text style={styles.description} numberOfLines={3}>
          {item?.description || 'Aucune description disponible.'}
        </Text>

        <View style={styles.readRow}>
          <Text style={styles.readText}>Lire l&apos;article</Text>
          <Ionicons name="open-outline" size={15} color={palette.accentDark} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (C) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.panel,
      borderColor: C.border,
      borderWidth: 1,
      borderRadius: 22,
      marginBottom: 14,
      overflow: 'hidden',
    },
    image: {
      width: '100%',
      height: 160,
      backgroundColor: C.panelAlt,
    },
    imageFallback: {
      width: '100%',
      height: 100,
      backgroundColor: C.panelAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    title: {
      color: C.text,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '900',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    source: {
      color: C.accent,
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    dot: {
      color: C.muted,
      fontSize: 12,
      fontWeight: '800',
    },
    date: {
      color: C.muted,
      fontSize: 12,
      fontWeight: '700',
    },
    description: {
      color: C.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
    },
    readRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      backgroundColor: C.accent,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    readText: {
      color: C.accentDark,
      fontSize: 12,
      fontWeight: '900',
    },
  });

