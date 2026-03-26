import React, { useCallback, useState } from 'react';
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

export default function ProfileScreen({ navigation }) {
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
    } catch (error) {
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
    } catch (error) {
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
        <ActivityIndicator size="large" color="#FF4D4D" />
        <Text style={styles.loadingText}>Chargement du profil...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Profil</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={34} color="#FFFFFF" />
          </View>
          <Text style={styles.heroName}>{user?.username || user?.name || 'Utilisateur'}</Text>
          <Text style={styles.heroEmail}>{user?.email || 'Email indisponible'}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>Connecte</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Informations</Text>
          <InfoRow label="Nom" value={user?.username || user?.name || '-'} />
          <InfoRow label="Email" value={user?.email || '-'} />
          <InfoRow label="ID" value={user?._id || user?.id || '-'} />
          <InfoRow label="Role" value={user?.role || 'supporter'} />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeaderInline}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            {savingSettings ? <ActivityIndicator size="small" color="#FF4D4D" /> : null}
          </View>

          <SettingsRow
            label="Activer les notifications"
            value={notificationSettings.enabled}
            onValueChange={(value) => handleToggleNotificationSetting('enabled', value)}
          />
          <SettingsRow
            label="Rappel avant match"
            value={notificationSettings.preMatch}
            onValueChange={(value) => handleToggleNotificationSetting('preMatch', value)}
            disabled={!notificationSettings.enabled}
          />
          <SettingsRow
            label="Debut du match"
            value={notificationSettings.matchStart}
            onValueChange={(value) => handleToggleNotificationSetting('matchStart', value)}
            disabled={!notificationSettings.enabled}
          />
          <SettingsRow
            label="Changement de score"
            value={notificationSettings.scoreChange}
            onValueChange={(value) => handleToggleNotificationSetting('scoreChange', value)}
            disabled={!notificationSettings.enabled}
          />
          <SettingsRow
            label="Fin du match"
            value={notificationSettings.matchEnd}
            onValueChange={(value) => handleToggleNotificationSetting('matchEnd', value)}
            disabled={!notificationSettings.enabled}
          />

          <InfoRow label="Appareils enregistres" value={String(user?.pushTokenCount || 0)} />

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleEnableDeviceNotifications}
            activeOpacity={0.9}
            disabled={registeringDevice}
          >
            {registeringDevice ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
                <Text style={styles.secondaryButtonText}>Activer sur cet appareil</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.9}>
          <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
          <Text style={styles.logoutText}>Se deconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
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

function SettingsRow({ label, value, onValueChange, disabled = false }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, disabled && styles.infoLabelDisabled]}>{label}</Text>
      <Switch
        value={Boolean(value)}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#243246', true: '#FF4D4D' }}
        thumbColor="#FFFFFF"
      />
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
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
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
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#15233A',
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF4D4D',
    marginBottom: 16,
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  heroEmail: {
    marginTop: 6,
    color: '#A9B6CC',
    fontSize: 14,
  },
  statusPill: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#10251B',
    borderWidth: 1,
    borderColor: '#1C4732',
  },
  statusText: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    marginTop: 16,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#15233A',
    borderRadius: 22,
    padding: 18,
  },
  sectionTitle: {
    color: '#E8EEF8',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 6,
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#101827',
  },
  infoLabel: {
    color: '#7F8AA3',
    fontSize: 12,
    fontWeight: '800',
  },
  infoLabelDisabled: {
    opacity: 0.6,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  logoutButton: {
    marginTop: 18,
    backgroundColor: '#FF4D4D',
    borderRadius: 18,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logoutText: {
    color: '#FFFFFF',
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
    backgroundColor: '#18253B',
    borderWidth: 1,
    borderColor: '#22324C',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050B16',
  },
  loadingText: {
    marginTop: 12,
    color: '#A9B6CC',
    fontSize: 15,
    fontWeight: '700',
  },
});
