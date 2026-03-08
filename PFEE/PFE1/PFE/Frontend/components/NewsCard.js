import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND_COLORS } from '../src/theme/colors';

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

export default function NewsCard({ item, onPress, isLight }) {
  const styles = createStyles(isLight);
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
          <Ionicons name="newspaper-outline" size={28} color={isLight ? '#64748B' : '#7C8CA6'} />
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
          <Ionicons name="open-outline" size={15} color={isLight ? '#1D4ED8' : '#60A5FA'} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (isLight) =>
  StyleSheet.create({
    card: {
      backgroundColor: isLight ? '#FFFFFF' : BRAND_COLORS.fourth,
      borderColor: isLight ? '#D8E2EF' : '#425a72',
      borderWidth: 1,
      borderRadius: 16,
      marginBottom: 12,
      overflow: 'hidden',
    },
    image: {
      width: '100%',
      height: 130,
      backgroundColor: isLight ? '#E9F0FA' : '#111C2D',
    },
    imageFallback: {
      width: '100%',
      height: 90,
      backgroundColor: isLight ? '#EAF1FB' : '#111C2D',
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    title: {
      color: isLight ? '#0F172A' : '#E6EDF8',
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '900',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    source: {
      color: BRAND_COLORS.accent,
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    dot: {
      color: isLight ? '#94A3B8' : '#6B7E99',
      fontSize: 12,
      fontWeight: '800',
    },
    date: {
      color: isLight ? '#55657C' : '#95A6C0',
      fontSize: 12,
      fontWeight: '700',
    },
    description: {
      color: isLight ? '#334155' : '#AEBBD0',
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
    },
    readRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      backgroundColor: isLight ? '#d8ebff' : '#2d3f51',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    readText: {
      color: isLight ? BRAND_COLORS.fourth : BRAND_COLORS.first,
      fontSize: 12,
      fontWeight: '900',
    },
  });

