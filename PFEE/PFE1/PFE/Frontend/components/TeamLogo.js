import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

export default function TeamLogo({ uri, size = 24, style, fallbackSource = null }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [uri]);

  const resolvedSize = Number(size) > 0 ? Number(size) : 24;
  const radius = Math.round(resolvedSize / 2);

  if (!uri || hasError) {
    if (fallbackSource) {
      return (
        <Image
          source={fallbackSource}
          style={[
            styles.logo,
            { width: resolvedSize, height: resolvedSize, borderRadius: radius },
            style,
          ]}
          resizeMode="contain"
        />
      );
    }

    return (
      <View
        style={[
          styles.fallback,
          { width: resolvedSize, height: resolvedSize, borderRadius: radius },
          style,
        ]}
      />
    );
  }

  return (
    <Image
      source={{ uri, cache: 'force-cache' }}
      style={[
        styles.logo,
        { width: resolvedSize, height: resolvedSize, borderRadius: radius },
        style,
      ]}
      resizeMode="contain"
      onError={() => setHasError(true)}
      fadeDuration={100}
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    backgroundColor: '#0F172A',
  },
  fallback: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
});
