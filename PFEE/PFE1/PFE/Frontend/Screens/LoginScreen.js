import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, ImageBackground
} from 'react-native';
import { API_BASE_URL } from '../services/apiConfig';
import { authStorage } from '../services/authStorage';
import { favoritesService } from '../services/favoritesService';
import { notificationService } from '../services/notificationService';

// Nouveaux imports pour Expo Auth Session
import * as WebBrowser from 'expo-web-browser';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';

const API_URL = `${API_BASE_URL}/api/user`;

// Obligatoire pour refermer la fenêtre web automatiquement après la connexion
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation, route }) {
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

  // 1. Configuration de la requête Google
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

  // 2. Écouter la réponse de la fenêtre Google
  useEffect(() => {
    if (response?.type === 'success') {
      const { access_token } = response.params;
      console.log("🎯 ACCESS TOKEN GOOGLE RECU:", access_token);
      console.log("📦 Réponse complète Google:", response);
      handleGoogleLoginWithBackend(access_token);
    } else if (response?.type === 'error' || response?.type === 'dismiss') {
      // Si l'utilisateur ferme la fenêtre ou s'il y a une erreur
      console.log("❌ Google Auth annulé ou erreur:", response);
      setGoogleLoading(false);
    }
  }, [response]);

  const fetchCaptcha = async () => {
    setCaptchaLoading(true);
    setCaptchaError('');
    try {
      const response = await fetch(`${API_URL}/captcha`);
      const data = await response.json();

      if (!response.ok || !data?.captchaId || !data?.challenge) {
        throw new Error(data?.message || 'Impossible de charger le captcha.');
      }

      setCaptchaMode('server');
      setCaptchaId(data.captchaId);
      setCaptchaChallenge(data.challenge);
      setCaptchaAnswer('');
    } catch (error) {
      // Fallback local: utile quand l'API ne fournit pas encore /captcha.
      const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let localCode = '';
      for (let i = 0; i < 5; i += 1) {
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
  };

  useEffect(() => {
    fetchCaptcha();
  }, []);

  const handleRedirectAfterLogin = () => {
    if (redirectTo === 'Favoris') {
      navigation.replace('MainTabs', { screen: 'Favoris' });
      return;
    }
    if (redirectTo === 'Profile') {
      navigation.replace('Profile');
      return;
    }
    navigation.replace('MainTabs', { screen: 'Home' });
  };

  const handleLogin = async () => {
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

    if (!captchaId || !captchaAnswer.trim()) {
      if (captchaMode === 'server') {
        Alert.alert('Erreur', 'Veuillez saisir le captcha.');
        return;
      }
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

      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();
      if (!response.ok) {
        Alert.alert('Erreur', data.error || data.message || 'Connexion impossible.');
        fetchCaptcha();
        return;
      }
      await authStorage.setSession(data.token, data.user);
      await favoritesService.syncWithServer();
      await notificationService.bootstrapForAuthenticatedUser({ forcePermissionPrompt: true });
      handleRedirectAfterLogin();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de se connecter au serveur.');
    } finally {
      setLoading(false);
    }
  };

  // 3. NOUVELLE VERSION: Récupérer les infos Google et les envoyer au backend
  const handleGoogleLoginWithBackend = async (accessToken) => {
    try {
      if (!accessToken) {
        throw new Error('Token Google manquant');
      }

      console.log("🔄 Étape 1: Récupération des infos utilisateur depuis Google...");
      
      // Étape 1: Récupérer les infos utilisateur depuis Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!userInfoResponse.ok) {
        throw new Error('Impossible de récupérer les infos Google');
      }
      
      const userInfo = await userInfoResponse.json();
      console.log("✅ Étape 2: Infos Google reçues:", userInfo);
      
      // Étape 2: Préparer les données pour le backend
      const dataToSend = {
        email: userInfo.email,
        name: userInfo.name || userInfo.given_name || 'Utilisateur Google',
        googleId: userInfo.sub,
        photoUrl: userInfo.picture
      };
      console.log("📤 Étape 3: Envoi au backend:", dataToSend);
      
      // Étape 3: Envoyer au backend
      const response = await fetch(`${API_URL}/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      });
      
      const data = await response.json();
      console.log("📥 Étape 4: Réponse du backend:", data);
      
      if (!response.ok) {
        Alert.alert('Erreur', data.error || 'Connexion Google impossible.');
        setGoogleLoading(false);
        return;
      }
      
      // Étape 4: Succès - Stocker les données
      console.log("✅ Étape 5: Connexion réussie, stockage des données...");
      await authStorage.setSession(data.token, data.user);
      await favoritesService.syncWithServer();
      await notificationService.bootstrapForAuthenticatedUser({ forcePermissionPrompt: true });
      
      // Rediriger
      handleRedirectAfterLogin();
      
    } catch (error) {
      console.error("❌ ERREUR COMPLÈTE:", error);
      Alert.alert('Erreur', error.message || 'La connexion avec Google a échoué.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const subtitle = useMemo(() => {
    if (message) return message;
    return 'Connectez-vous pour synchroniser vos favoris et votre profil.';
  }, [message]);

  return (
    <ImageBackground
      source={require('../img/result_0.jpeg')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            <View style={styles.hero}>
              <Text style={styles.kicker}>Foot Live</Text>
              <Text style={styles.heroTitle}>Le match commence sans login.</Text>
              <Text style={styles.heroText}>
                Parcourez les matchs, le live et les news librement. Connectez-vous seulement pour les favoris et le profil.
              </Text>
              <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.9} onPress={() => navigation.replace('MainTabs', { screen: 'Home' })}>
                <Text style={styles.secondaryButtonText}>Continuer sans compte</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Connexion</Text>
              <Text style={styles.cardSubtitle}>{subtitle}</Text>
              {!!captchaError && <Text style={styles.captchaErrorText}>{captchaError}</Text>}

              <TextInput 
                style={styles.input} 
                placeholder="Adresse email" 
                placeholderTextColor="#7F8AA3" 
                value={email} 
                onChangeText={setEmail} 
                autoCapitalize="none" 
                keyboardType="email-address" 
                autoCorrect={false}
              />
              
              <TextInput 
                style={styles.input} 
                placeholder="Mot de passe" 
                placeholderTextColor="#7F8AA3" 
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry 
              />

              <View style={styles.captchaRow}>
                <View style={styles.captchaChallengeBox}>
                  {captchaLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
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
                placeholderTextColor="#7F8AA3"
                value={captchaAnswer}
                onChangeText={setCaptchaAnswer}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <TouchableOpacity 
                style={[styles.primaryButton, loading && styles.buttonDisabled]} 
                onPress={handleLogin} 
                disabled={loading || googleLoading || captchaLoading} 
                activeOpacity={0.9}
              >
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Se connecter</Text>}
              </TouchableOpacity>

              <View style={styles.separatorContainer}>
                <View style={styles.separatorLine} />
                <Text style={styles.separatorText}>OU</Text>
                <View style={styles.separatorLine} />
              </View>

              {/* Bouton Google avec indicateur de chargement */}
              {googleLoading ? (
                <View style={styles.googleButtonLoading}>
                  <ActivityIndicator color="#050B16" size="small" />
                  <Text style={styles.googleButtonLoadingText}>Connexion en cours...</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.googleButton, (!request || loading) && styles.buttonDisabled]}
                  onPress={() => {
                    console.log("🟢 Clic sur bouton Google, ouverture de la fenêtre...");
                    setGoogleLoading(true);
                    promptAsync(); // Ouvre la fenêtre Web Google
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
                <Text style={styles.linkText}>Créer un compte</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  background: { flex: 1, backgroundColor: '#050B16' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 11, 22, 0.72)' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 32 },
  shell: { width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 20 },
  hero: { flex: 1, minHeight: 260, backgroundColor: 'rgba(11, 18, 32, 0.82)', borderWidth: 1, borderColor: '#15233A', borderRadius: 28, padding: 28, justifyContent: 'space-between' },
  kicker: { color: '#FF4D4D', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { marginTop: 14, color: '#FFFFFF', fontSize: 32, lineHeight: 38, fontWeight: '900' },
  heroText: { marginTop: 12, color: '#A9B6CC', fontSize: 15, lineHeight: 23, maxWidth: 460 },
  secondaryButton: { marginTop: 24, alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: '#223552', backgroundColor: '#0F1A2D' },
  secondaryButtonText: { color: '#E8EEF8', fontSize: 14, fontWeight: '800' },
  card: { flex: 1, maxWidth: Platform.OS === 'web' ? 420 : '100%', backgroundColor: 'rgba(11, 18, 32, 0.94)', borderWidth: 1, borderColor: '#15233A', borderRadius: 28, padding: 24, alignSelf: 'center', width: '100%' },
  cardTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  cardSubtitle: { color: '#A9B6CC', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 22 },
  captchaErrorText: { color: '#F7C948', fontSize: 12, marginBottom: 10, fontWeight: '700' },
  input: { backgroundColor: '#121C2E', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14, color: '#FFFFFF', borderWidth: 1, borderColor: '#15233A', fontSize: 15 },
  captchaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  captchaChallengeBox: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#2A3E63', backgroundColor: '#0F1728', justifyContent: 'center', paddingHorizontal: 14 },
  captchaChallengeText: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', letterSpacing: 4 },
  captchaRefreshButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#2A3E63', backgroundColor: '#0F1A2D', justifyContent: 'center', paddingHorizontal: 12 },
  captchaRefreshText: { color: '#E8EEF8', fontSize: 12, fontWeight: '800' },
  primaryButton: { marginTop: 8, backgroundColor: '#FF4D4D', borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  linkRow: { marginTop: 18, alignSelf: 'center' },
  linkText: { color: '#7DB5FF', fontSize: 14, fontWeight: '800' },
  separatorContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#15233A' },
  separatorText: { color: '#7F8AA3', marginHorizontal: 10, fontSize: 12, fontWeight: 'bold' },
  googleButton: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 5 },
  googleButtonText: { color: '#050B16', fontSize: 16, fontWeight: '900' },
  googleButtonLoading: { 
    backgroundColor: '#E0E0E0', 
    borderRadius: 16, 
    paddingVertical: 15, 
    alignItems: 'center', 
    marginTop: 5,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10
  },
  googleButtonLoadingText: { color: '#050B16', fontSize: 14, fontWeight: '600' }
});
