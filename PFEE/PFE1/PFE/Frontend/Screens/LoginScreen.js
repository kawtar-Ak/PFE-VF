import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { API_BASE_URL } from '../services/apiConfig';
import { authStorage } from '../services/authStorage';
import { favoritesService } from '../services/favoritesService';
import { notificationService } from '../services/notificationService';
import { useAppTheme } from '../src/theme/AppThemeContext';

import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';

const API_URL = `${API_BASE_URL}/api/user`;

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation, route }) {
  const { width } = useWindowDimensions();
  const { palette: C, isDark } = useAppTheme();
  const isWide = width >= 980;
  const isTablet = width >= 640;
  const isCompact = width < 390;
  const styles = useMemo(
    () => createStyles(C, isDark, { isWide, isTablet, isCompact }),
    [C, isDark, isWide, isTablet, isCompact]
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaChallenge, setCaptchaChallenge] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaMode, setCaptchaMode] = useState('server');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const redirectTo = route?.params?.redirectTo || 'Home';
  const message = route?.params?.message || '';

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: '708632300002-37shi475804djm76v9fr6g7c27ee8pe9.apps.googleusercontent.com',
      responseType: 'token',
      scopes: ['openid', 'profile', 'email'],
      redirectUri: makeRedirectUri({}),
      usePKCE: false,
    },
    { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' }
  );

  const subtitle = useMemo(() => {
    if (message) return message;
    return 'Connectez-vous pour synchroniser vos favoris et votre profil.';
  }, [message]);

  const handleRedirectAfterLogin = useCallback(() => {
    if (redirectTo === 'Favoris') {
      navigation.replace('MainTabs', { screen: 'Favoris' });
      return;
    }

    if (redirectTo === 'Profile') {
      navigation.replace('Profile');
      return;
    }

    navigation.replace('MainTabs', { screen: 'Home' });
  }, [navigation, redirectTo]);

  const fetchCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaError('');

    try {
      const responseCaptcha = await fetch(`${API_URL}/captcha`);
      const data = await responseCaptcha.json();

      if (!responseCaptcha.ok || !data?.captchaId || !data?.challenge) {
        throw new Error(data?.message || 'Impossible de charger le captcha.');
      }

      setCaptchaMode('server');
      setCaptchaId(data.captchaId);
      setCaptchaChallenge(data.challenge);
      setCaptchaAnswer('');
    } catch {
      const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let localCode = '';

      for (let index = 0; index < 5; index += 1) {
        localCode += charset[Math.floor(Math.random() * charset.length)];
      }

      setCaptchaMode('local');
      setCaptchaId('');
      setCaptchaChallenge(localCode);
      setCaptchaAnswer('');
      setCaptchaError('Captcha local actif (backend /captcha indisponible).');
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  const handleGoogleLoginWithBackend = useCallback(async (accessToken) => {
    try {
      if (!accessToken) {
        throw new Error('Token Google manquant');
      }

      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoResponse.ok) {
        throw new Error('Impossible de recuperer les infos Google');
      }

      const userInfo = await userInfoResponse.json();
      const payload = {
        email: userInfo.email,
        name: userInfo.name || userInfo.given_name || 'Utilisateur Google',
        googleId: userInfo.sub,
        photoUrl: userInfo.picture,
      };

      const responseLogin = await fetch(`${API_URL}/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await responseLogin.json();

      if (!responseLogin.ok) {
        Alert.alert('Erreur', data.error || 'Connexion Google impossible.');
        return;
      }

      await authStorage.setSession(data.token, data.user);
      await favoritesService.syncWithServer();
      await notificationService.bootstrapForAuthenticatedUser({ forcePermissionPrompt: true });
      handleRedirectAfterLogin();
    } catch (error) {
      Alert.alert('Erreur', error?.message || 'La connexion avec Google a echoue.');
    } finally {
      setGoogleLoading(false);
    }
  }, [handleRedirectAfterLogin]);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  useEffect(() => {
    if (response?.type === 'success') {
      const { access_token: accessToken } = response.params;
      handleGoogleLoginWithBackend(accessToken);
      return;
    }

    if (response?.type === 'error' || response?.type === 'dismiss') {
      setGoogleLoading(false);
    }
  }, [handleGoogleLoginWithBackend, response]);

  const handleLogin = useCallback(async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      Alert.alert('Erreur', 'Veuillez saisir une adresse email valide.');
      return;
    }

    if (captchaMode === 'server' && (!captchaId || !captchaAnswer.trim())) {
      Alert.alert('Erreur', 'Veuillez saisir le captcha.');
      return;
    }

    if (captchaMode === 'local') {
      if (!captchaAnswer.trim()) {
        Alert.alert('Erreur', 'Veuillez saisir le captcha.');
        return;
      }

      if (captchaAnswer.trim().toUpperCase() !== captchaChallenge.toUpperCase()) {
        Alert.alert('Erreur', 'Captcha invalide.');
        fetchCaptcha();
        return;
      }
    }

    setLoading(true);

    try {
      const requestBody = captchaMode === 'server'
        ? {
            email: normalizedEmail,
            password,
            captchaId,
            captchaAnswer: captchaAnswer.trim(),
          }
        : {
            email: normalizedEmail,
            password,
          };

      const responseLogin = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await responseLogin.json();

      if (!responseLogin.ok) {
        Alert.alert('Erreur', data.error || data.message || 'Connexion impossible.');
        fetchCaptcha();
        return;
      }

      await authStorage.setSession(data.token, data.user);
      await favoritesService.syncWithServer();
      await notificationService.bootstrapForAuthenticatedUser({ forcePermissionPrompt: true });
      handleRedirectAfterLogin();
    } catch {
      Alert.alert('Erreur', 'Impossible de se connecter au serveur.');
    } finally {
      setLoading(false);
    }
  }, [
    captchaAnswer,
    captchaChallenge,
    captchaId,
    captchaMode,
    email,
    fetchCaptcha,
    handleRedirectAfterLogin,
    password,
  ]);

  return (
    <View style={styles.screen}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <View style={styles.meshOrb} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            <View style={styles.heroCard}>
              <View style={styles.heroContentGroup}>
                <View style={styles.heroPill}>
                  <View style={styles.heroPillDot} />
                  <Text style={styles.heroPillText}>KICKLY ACCESS</Text>
                </View>

                <Text style={styles.heroKicker}>Foot Live</Text>
                <Text style={styles.heroTitle}>Le match commence sans login.</Text>
                <View style={styles.heroTextWrap}>
                  <Text style={styles.heroText}>
                    Parcourez les matchs, le live et les news librement. Connectez-vous seulement pour les favoris et le profil.
                  </Text>
                </View>
              </View>

              <View style={styles.heroActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  activeOpacity={0.9}
                  onPress={() => navigation.replace('MainTabs', { screen: 'Home' })}
                >
                  <Text style={styles.secondaryButtonText}>Continuer sans compte</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.authCard}>
              <View style={styles.authHeader}>
                <Text style={styles.authEyebrow}>Bienvenue</Text>
                <Text style={styles.authTitle}>Connexion</Text>
                <Text style={styles.authSubtitle}>{subtitle}</Text>
              </View>

              {!!captchaError ? <Text style={styles.captchaErrorText}>{captchaError}</Text> : null}

              <TextInput
                style={styles.input}
                placeholder="Adresse email"
                placeholderTextColor={styles.placeholder.color}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />

              <TextInput
                style={styles.input}
                placeholder="Mot de passe"
                placeholderTextColor={styles.placeholder.color}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <View style={styles.captchaRow}>
                <View style={styles.captchaChallengeBox}>
                  {captchaLoading ? (
                    <ActivityIndicator color={C.accent} size="small" />
                  ) : (
                    <Text style={styles.captchaChallengeText}>{captchaChallenge || '-----'}</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.captchaRefreshButton}
                  onPress={fetchCaptcha}
                  disabled={captchaLoading || loading || googleLoading}
                  activeOpacity={0.9}
                >
                  <Text style={styles.captchaRefreshText}>Actualiser</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Saisir le captcha"
                placeholderTextColor={styles.placeholder.color}
                value={captchaAnswer}
                onChangeText={setCaptchaAnswer}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[styles.primaryButton, (loading || googleLoading || captchaLoading) && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading || googleLoading || captchaLoading}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color={C.accentDark} />
                ) : (
                  <Text style={styles.primaryButtonText}>Se connecter</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipButton}
                activeOpacity={0.88}
                onPress={() => navigation.replace('MainTabs', { screen: 'Home' })}
              >
                <Text style={styles.skipButtonText}>Continuer sans compte</Text>
              </TouchableOpacity>

              <View style={styles.separatorContainer}>
                <View style={styles.separatorLine} />
                <Text style={styles.separatorText}>OU</Text>
                <View style={styles.separatorLine} />
              </View>

              {googleLoading ? (
                <View style={styles.googleButtonLoading}>
                  <ActivityIndicator color={styles.googleButtonText.color} size="small" />
                  <Text style={styles.googleButtonLoadingText}>Connexion en cours...</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.googleButton, (!request || loading) && styles.buttonDisabled]}
                  onPress={() => {
                    setGoogleLoading(true);
                    promptAsync();
                  }}
                  disabled={!request || loading}
                  activeOpacity={0.9}
                >
                  <Text style={styles.googleButtonText}>Se connecter avec Google</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.linkRow}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Register', { redirectTo, message })}
              >
                <Text style={styles.linkText}>Creer un compte</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (C, isDark, { isWide, isTablet, isCompact }) => StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: isDark ? '#08100b' : '#edf3fb',
    overflow: 'hidden',
  },
  glowTop: {
    position: 'absolute',
    top: -120,
    right: -50,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(200,255,54,0.10)' : 'rgba(47,159,232,0.14)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -140,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(54,209,124,0.08)' : 'rgba(92,167,255,0.12)',
  },
  meshOrb: {
    position: 'absolute',
    top: '28%',
    left: '62%',
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.55)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: isCompact ? 12 : 20,
    paddingVertical: isCompact ? 18 : 28,
  },
  shell: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    flexDirection: isWide ? 'row' : 'column',
    gap: isCompact ? 18 : 20,
    alignItems: 'stretch',
  },
  heroCard: {
    flex: isWide ? 0.95 : 0,
    minHeight: isCompact ? 306 : isTablet ? 262 : 240,
    borderRadius: isCompact ? 24 : 30,
    padding: isCompact ? 18 : 26,
    backgroundColor: isDark ? 'rgba(15,24,18,0.88)' : 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : C.border,
    shadowColor: isDark ? '#000000' : '#8fa6c7',
    shadowOpacity: isDark ? 0.18 : 0.14,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
    justifyContent: 'flex-start',
  },
  heroContentGroup: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    flexShrink: 1,
  },
  heroPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(200,255,54,0.10)' : 'rgba(47,159,232,0.10)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(200,255,54,0.14)' : 'rgba(47,159,232,0.12)',
  },
  heroPillDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: C.accent,
  },
  heroPillText: {
    color: C.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  heroKicker: {
    marginTop: 16,
    color: C.accent,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    marginTop: 10,
    color: C.text,
    fontSize: isCompact ? 22 : isTablet ? 34 : 28,
    lineHeight: isCompact ? 28 : isTablet ? 40 : 34,
    fontWeight: '900',
    maxWidth: isWide ? 420 : '100%',
  },
  heroText: {
    color: C.muted,
    fontSize: isCompact ? 12 : 15,
    lineHeight: isCompact ? 18 : 23,
    maxWidth: '100%',
  },
  heroTextWrap: {
    marginTop: 14,
    maxWidth: 460,
    paddingRight: isCompact ? 0 : 4,
  },
  heroActions: {
    marginTop: 'auto',
    paddingTop: isCompact ? 16 : 18,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panel,
  },
  secondaryButtonText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
  },
  authCard: {
    flex: 1,
    maxWidth: isWide ? 430 : '100%',
    width: '100%',
    alignSelf: 'center',
    borderRadius: isCompact ? 24 : 30,
    padding: isCompact ? 16 : 24,
    backgroundColor: isDark ? 'rgba(11,18,14,0.94)' : 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : C.border,
    shadowColor: isDark ? '#000000' : '#8fa6c7',
    shadowOpacity: isDark ? 0.18 : 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 7,
    minHeight: isWide ? 0 : 420,
  },
  authHeader: {
    marginBottom: 18,
  },
  authEyebrow: {
    color: C.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  authTitle: {
    color: C.text,
    fontSize: isCompact ? 26 : 30,
    fontWeight: '900',
  },
  authSubtitle: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  captchaErrorText: {
    color: '#F7C948',
    fontSize: 12,
    marginBottom: 10,
    fontWeight: '700',
  },
  input: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : C.panelAlt,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: isCompact ? 12 : 14,
    marginBottom: 14,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: 15,
    minWidth: 0,
  },
  placeholder: {
    color: isDark ? '#8ea18f' : '#7f8aa3',
  },
  captchaRow: {
    flexDirection: isTablet ? 'row' : 'column',
    alignItems: isTablet ? 'center' : 'stretch',
    gap: 10,
    marginBottom: 12,
  },
  captchaChallengeBox: {
    flex: isTablet ? 1 : 0,
    minHeight: 54,
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  captchaChallengeText: {
    color: C.text,
    fontSize: isCompact ? 18 : 21,
    fontWeight: '900',
    letterSpacing: isCompact ? 2 : 4,
  },
  captchaRefreshButton: {
    minHeight: 54,
    width: isTablet ? undefined : '100%',
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f7faff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captchaRefreshText: {
    color: C.text,
    fontSize: 12,
    fontWeight: '800',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: C.accent,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: C.accent,
    shadowOpacity: isDark ? 0.18 : 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: C.accentDark,
    fontSize: 16,
    fontWeight: '900',
  },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
    opacity: 0.85,
  },
  separatorText: {
    color: C.muted,
    marginHorizontal: 10,
    fontSize: 12,
    fontWeight: 'bold',
  },
  googleButton: {
    backgroundColor: C.white,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 5,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#dbe6f3',
    minHeight: 54,
  },
  googleButtonText: {
    color: '#13233f',
    fontSize: 16,
    fontWeight: '900',
  },
  googleButtonLoading: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f7faff',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 5,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 54,
  },
  googleButtonLoadingText: {
    color: '#13233f',
    fontSize: 14,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(247,250,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
  },
  linkRow: {
    marginTop: 16,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  linkText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '800',
  },
});
