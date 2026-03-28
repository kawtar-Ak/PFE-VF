import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { authStorage } from '../services/authStorage';
import { userService } from '../services/userService';
import { notificationService } from '../services/notificationService';
import { useAppTheme } from '../src/theme/AppThemeContext';

export default function ProfileScreen({ navigation }) {
  const { palette: C } = useAppTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [registeringDevice, setRegisteringDevice] = useState(false);

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const token = await authStorage.getToken();
      const rawUser = await authStorage.getUser();

      if (!token || !rawUser) {
        navigation.replace('Login', {
          redirectTo: 'Profile',
          message: 'Connectez-vous pour acceder a votre profil.',
        });
        return;
      }

      setUser(rawUser);

      const remoteUser = await userService.getCurrentUserProfile();
      if (remoteUser) {
        setUser(remoteUser);
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de charger les donnees utilisateur.');
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      loadUser();
    }, [loadUser])
  );

  const handleLogout = async () => {
    try {
      await notificationService.unregisterCurrentDevice();
      await authStorage.clearSession();
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
      });
    } catch {
      Alert.alert('Erreur', 'Impossible de se deconnecter pour le moment.');
    }
  };

  const notificationSettings = {
    enabled: user?.notificationSettings?.enabled !== false,
    preMatch: user?.notificationSettings?.preMatch !== false,
    matchStart: user?.notificationSettings?.matchStart !== false,
    scoreChange: user?.notificationSettings?.scoreChange !== false,
    matchEnd: user?.notificationSettings?.matchEnd !== false,
  };
  const displayName = user?.username || user?.name || 'Utilisateur';
  const displayRole = user?.role || 'supporter';
  const registeredDevices = String(user?.pushTokenCount || 0);

  const handleToggleNotificationSetting = async (key, value) => {
    const nextSettings = {
      ...(user?.notificationSettings || {}),
      [key]: value,
    };

    if (key === 'enabled' && value === false) {
      nextSettings.preMatch = nextSettings.preMatch ?? true;
      nextSettings.matchStart = nextSettings.matchStart ?? true;
      nextSettings.scoreChange = nextSettings.scoreChange ?? true;
      nextSettings.matchEnd = nextSettings.matchEnd ?? true;
    }

    setUser((previous) => ({
      ...(previous || {}),
      notificationSettings: nextSettings,
    }));

    try {
      setSavingSettings(true);
      const response = await userService.updateNotificationSettings(nextSettings);
      if (response?.user) {
        setUser(response.user);
      }
    } catch (error) {
      Alert.alert('Erreur', error?.message || 'Impossible de mettre a jour les notifications.');
      loadUser();
    } finally {
      setSavingSettings(false);
    }
  };

  const handleEnableDeviceNotifications = async () => {
    try {
      setRegisteringDevice(true);
      const result = await notificationService.bootstrapForAuthenticatedUser({ forcePermissionPrompt: true });

      if (!result?.ok) {
        const reasonMap = {
          web_not_supported: 'Les notifications push ne sont pas disponibles sur la version web actuelle.',
          physical_device_required: 'Utilisez un appareil physique pour tester les notifications push.',
          permission_denied: 'Autorisez les notifications dans le systeme pour les recevoir.',
          project_id_missing: 'Ajoutez le projectId EAS Expo pour activer les notifications push distantes.',
          token_unavailable: 'Le token de notification est indisponible pour le moment.',
          backend_registration_failed: "Le token n'a pas pu etre enregistre sur le serveur.",
        };

        Alert.alert('Notifications', reasonMap[result?.reason] || 'Activation impossible pour le moment.');
        return;
      }

      Alert.alert('Notifications', 'Cet appareil est maintenant enregistre pour les notifications.');
      loadUser();
    } catch (error) {
      Alert.alert('Erreur', error?.message || "Impossible d'activer les notifications.");
    } finally {
      setRegisteringDevice(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.loadingText}>Chargement du profil...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Account Center</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Profile</Text>
          <View style={styles.avatar}>
            <Ionicons name="person" size={34} color={C.accentDark} />
          </View>
          <Text style={styles.heroName}>{displayName}</Text>
          <Text style={styles.heroEmail}>{user?.email || 'Email indisponible'}</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>Connecte</Text>
            </View>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{displayRole}</Text>
            </View>
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{registeredDevices}</Text>
              <Text style={styles.heroStatLabel}>Appareils</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{notificationSettings.enabled ? 'ON' : 'OFF'}</Text>
              <Text style={styles.heroStatLabel}>Notifications</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Informations</Text>
          <InfoRow styles={styles} label="Nom" value={displayName} />
          <InfoRow styles={styles} label="Email" value={user?.email || '-'} />
          <InfoRow styles={styles} label="ID" value={user?._id || user?.id || '-'} />
          <InfoRow styles={styles} label="Role" value={displayRole} />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeaderInline}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            {savingSettings ? <ActivityIndicator size="small" color="#FF4D4D" /> : null}
          </View>

          <SettingsRow
            C={C}
            styles={styles}
            label="Activer les notifications"
            value={notificationSettings.enabled}
            onValueChange={(value) => handleToggleNotificationSetting('enabled', value)}
          />
          <SettingsRow
            C={C}
            styles={styles}
            label="Rappel avant match"
            value={notificationSettings.preMatch}
            onValueChange={(value) => handleToggleNotificationSetting('preMatch', value)}
            disabled={!notificationSettings.enabled}
          />
          <SettingsRow
            C={C}
            styles={styles}
            label="Debut du match"
            value={notificationSettings.matchStart}
            onValueChange={(value) => handleToggleNotificationSetting('matchStart', value)}
            disabled={!notificationSettings.enabled}
          />
          <SettingsRow
            C={C}
            styles={styles}
            label="Changement de score"
            value={notificationSettings.scoreChange}
            onValueChange={(value) => handleToggleNotificationSetting('scoreChange', value)}
            disabled={!notificationSettings.enabled}
          />
          <SettingsRow
            C={C}
            styles={styles}
            label="Fin du match"
            value={notificationSettings.matchEnd}
            onValueChange={(value) => handleToggleNotificationSetting('matchEnd', value)}
            disabled={!notificationSettings.enabled}
          />

          <InfoRow styles={styles} label="Appareils enregistres" value={registeredDevices} />

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleEnableDeviceNotifications}
            activeOpacity={0.9}
            disabled={registeringDevice}
          >
            {registeringDevice ? (
              <ActivityIndicator size="small" color={C.text} />
            ) : (
              <>
                <Ionicons name="notifications-outline" size={18} color={C.text} />
                <Text style={styles.secondaryButtonText}>Activer sur cet appareil</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.9}>
          <Ionicons name="log-out-outline" size={18} color={C.accentDark} />
          <Text style={styles.logoutText}>Se deconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function InfoRow({ styles, label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SettingsRow({ C, styles, label, value, onValueChange, disabled = false }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, disabled && styles.infoLabelDisabled]}>{label}</Text>
      <Switch
        value={Boolean(value)}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: C.panelAlt, true: C.accent }}
        thumbColor={C.white}
      />
    </View>
  );
}

const createStyles = (C) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topBar: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: C.text,
    fontSize: 17,
    fontWeight: '900',
  },
  topBarSpacer: {
    width: 42,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
  },
  heroEyebrow: {
    alignSelf: 'flex-start',
    color: C.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
    marginBottom: 16,
  },
  heroName: {
    color: C.text,
    fontSize: 26,
    fontWeight: '900',
  },
  heroEmail: {
    marginTop: 6,
    color: C.muted,
    fontSize: 14,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(54, 209, 124, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(54, 209, 124, 0.24)',
  },
  statusText: {
    color: C.success,
    fontSize: 12,
    fontWeight: '800',
  },
  heroMetaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rolePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: C.panelAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  roleText: {
    color: C.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  heroStatsRow: {
    width: '100%',
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
  },
  heroStatCard: {
    flex: 1,
    backgroundColor: C.panelAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  heroStatValue: {
    color: C.accent,
    fontSize: 18,
    fontWeight: '900',
  },
  heroStatLabel: {
    marginTop: 4,
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    marginTop: 16,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 22,
    padding: 18,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 8,
  },
  sectionHeaderInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  infoLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  infoLabelDisabled: {
    opacity: 0.6,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
  },
  logoutButton: {
    marginTop: 20,
    backgroundColor: C.accent,
    borderRadius: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logoutText: {
    color: C.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: C.panelAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  secondaryButtonText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '900',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },
  loadingText: {
    marginTop: 12,
    color: C.muted,
    fontSize: 15,
    fontWeight: '700',
  },
});
