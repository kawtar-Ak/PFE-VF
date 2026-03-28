import React, { useMemo } from 'react';
import { SafeAreaView, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../src/theme/AppThemeContext';

export default function LeaguesScreen() {
  const { palette: C } = useAppTheme();
  const styles = useMemo(() => createStyles(C), [C]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.eyebrow}>Coming Soon</Text>
        <Ionicons name="trophy-outline" size={42} color={C.accent} />
        <Text style={styles.title}>Competitions</Text>
        <Text style={styles.subtitle}>La liste complete des leagues arrive avec le nouveau design.</Text>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  eyebrow: { color: C.accent, fontSize: 12, fontWeight: '800', marginBottom: 12 },
  title: { color: C.text, fontSize: 24, fontWeight: '900', marginTop: 14 },
  subtitle: { color: C.muted, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
