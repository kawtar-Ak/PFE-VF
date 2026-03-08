import React, { useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../services/apiConfig';

const API_URL = `${API_BASE_URL}/api/user`;
const EMAIL_REGEX = /^(?!.*\s)(?!\.)(?!.*\.\.)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const USERNAME_REGEX = /^(?=.{3,20}$)[A-Za-z0-9._]+$/;
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  '10minutemail.com',
  'guerrillamail.com',
  'tempmail.com',
  'yopmail.com',
  'trashmail.com',
]);

const getPasswordAnalysis = (password) => {
  const criteria = {
    length: password.length >= 10,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':",.<>/?\\|~`]/.test(password),
  };

  const passedCount = Object.values(criteria).filter(Boolean).length;
  let strength = 'FAIBLE';

  if (passedCount === 5) {
    strength = 'FORT';
  } else if (passedCount >= 3) {
    strength = 'MOYEN';
  }

  const missing = [];
  if (!criteria.length) missing.push('10 caracteres minimum');
  if (!criteria.lowercase) missing.push('une minuscule');
  if (!criteria.uppercase) missing.push('une majuscule');
  if (!criteria.digit) missing.push('un chiffre');
  if (!criteria.special) missing.push('un symbole');

  return { criteria, passedCount, strength, missing };
};

const normalizeEmail = (value) => value.trim().toLowerCase();
const normalizeUsername = (value) => value.trim();

const getEmailError = (email) => {
  if (!email) return 'Adresse email requise.';
  if (/\s/.test(email)) return "L'email ne doit pas contenir d'espaces.";
  if (!EMAIL_REGEX.test(email)) return 'Adresse email invalide.';

  const domain = email.split('@')[1];
  if (!domain || !domain.includes('.')) return 'Adresse email invalide.';
  if (DISPOSABLE_DOMAINS.has(domain)) return 'Les emails temporaires ne sont pas autorises.';

  return '';
};

const getUsernameError = (username) => {
  if (!username) return "Nom d'utilisateur requis.";
  if (/\s/.test(username)) return "Pas d'espaces dans le nom d'utilisateur.";
  if (!USERNAME_REGEX.test(username)) return '3 a 20 caracteres: lettres, chiffres, . ou _.';
  return '';
};

const getPasswordAdvice = (missing) => {
  if (!missing.length) return 'Mot de passe solide.';
  if (missing.length === 1) return `Ajoutez ${missing[0]}.`;
  if (missing.length === 2) return `Ajoutez ${missing[0]} et ${missing[1]}.`;
  return `Ajoutez ${missing.slice(0, -1).join(', ')} et ${missing[missing.length - 1]}.`;
};

const strengthMeta = {
  FAIBLE: { label: 'Faible', color: '#FF6B6B', width: '33%' },
  MOYEN: { label: 'Moyen', color: '#F4B942', width: '66%' },
  FORT: { label: 'Fort', color: '#2ECC71', width: '100%' },
};

export default function RegisterScreen({ navigation, route }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const redirectTo = route?.params?.redirectTo || 'Home';
  const message = route?.params?.message || '';

  const subtitle = useMemo(() => {
    if (message) return message;
    return 'Creez un compte pour sauvegarder vos favoris et acceder a votre profil.';
  }, [message]);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const emailError = useMemo(() => getEmailError(normalizedEmail), [normalizedEmail]);
  const usernameError = useMemo(() => getUsernameError(normalizedUsername), [normalizedUsername]);
  const passwordAnalysis = useMemo(() => getPasswordAnalysis(password), [password]);
  const confirmPasswordError = useMemo(() => {
    if (!confirmPassword) return '';
    if (password !== confirmPassword) return 'Les mots de passe ne correspondent pas.';
    return '';
  }, [confirmPassword, password]);

  const canSubmit = useMemo(() => (
    !loading &&
    normalizedUsername &&
    normalizedEmail &&
    password &&
    confirmPassword &&
    !usernameError &&
    !emailError &&
    !confirmPasswordError &&
    passwordAnalysis.strength !== 'FAIBLE'
  ), [
    loading,
    normalizedUsername,
    normalizedEmail,
    password,
    confirmPassword,
    usernameError,
    emailError,
    confirmPasswordError,
    passwordAnalysis.strength,
  ]);

  const handleRedirectAfterRegister = () => {
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

  const handleRegister = async () => {
    const nextErrors = {
      username: usernameError,
      email: emailError,
      password: passwordAnalysis.strength === 'FAIBLE' ? getPasswordAdvice(passwordAnalysis.missing) : '',
      confirmPassword: confirmPasswordError,
    };

    setFieldErrors(nextErrors);

    if (!normalizedUsername || !normalizedEmail || !password || !confirmPassword) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs.');
      return;
    }

    if (nextErrors.username || nextErrors.email || nextErrors.confirmPassword) {
      Alert.alert('Erreur', 'Corrigez les champs en rouge.');
      return;
    }

    if (passwordAnalysis.strength === 'FAIBLE') {
      Alert.alert('Mot de passe faible', getPasswordAdvice(passwordAnalysis.missing));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: normalizedUsername,
          email: normalizedEmail,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFieldErrors({
          username: data?.errors?.username || '',
          email: data?.errors?.email || '',
          password: data?.errors?.password || '',
          confirmPassword: '',
        });

        Alert.alert(
          'Erreur',
          data?.message || data?.errors?.email || data?.errors?.password || 'Inscription impossible.'
        );
        return;
      }

      await AsyncStorage.setItem('userToken', data.token);
      await AsyncStorage.setItem('userData', JSON.stringify(data.user));
      handleRedirectAfterRegister();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de joindre le serveur.');
    } finally {
      setLoading(false);
    }
  };

  const currentStrength = strengthMeta[passwordAnalysis.strength];
  const criteriaItems = [
    { key: 'length', label: '10 caracteres minimum', ok: passwordAnalysis.criteria.length },
    { key: 'lowercase', label: 'Une minuscule', ok: passwordAnalysis.criteria.lowercase },
    { key: 'uppercase', label: 'Une majuscule', ok: passwordAnalysis.criteria.uppercase },
    { key: 'digit', label: 'Un chiffre', ok: passwordAnalysis.criteria.digit },
    { key: 'special', label: 'Un symbole', ok: passwordAnalysis.criteria.special },
  ];

  return (
    <ImageBackground
      source={require('../img/result_0.jpeg')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            <View style={styles.hero}>
              <Text style={styles.kicker}>Nouveau compte</Text>
              <Text style={styles.heroTitle}>Un compte seulement si vous en avez besoin.</Text>
              <Text style={styles.heroText}>
                L'application reste accessible sans connexion. Creez un compte pour retrouver vos favoris et vos
                informations sur tous vos appareils.
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.9}
                onPress={() => navigation.replace('MainTabs', { screen: 'Home' })}
              >
                <Text style={styles.secondaryButtonText}>Continuer sans compte</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Inscription</Text>
              <Text style={styles.cardSubtitle}>{subtitle}</Text>

              <TextInput
                style={[styles.input, fieldErrors.username ? styles.inputError : null]}
                placeholder="Nom d'utilisateur"
                placeholderTextColor="#7F8AA3"
                value={username}
                onChangeText={(value) => {
                  setUsername(value);
                  setFieldErrors((current) => ({ ...current, username: '' }));
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {!!(fieldErrors.username || usernameError) && (
                <Text style={styles.errorText}>{fieldErrors.username || usernameError}</Text>
              )}

              <TextInput
                style={[styles.input, fieldErrors.email ? styles.inputError : null]}
                placeholder="Adresse email"
                placeholderTextColor="#7F8AA3"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setFieldErrors((current) => ({ ...current, email: '' }));
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              {!!(fieldErrors.email || emailError) && (
                <Text style={styles.errorText}>{fieldErrors.email || emailError}</Text>
              )}

              <TextInput
                style={[styles.input, fieldErrors.password ? styles.inputError : null]}
                placeholder="Mot de passe"
                placeholderTextColor="#7F8AA3"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setFieldErrors((current) => ({ ...current, password: '' }));
                }}
                secureTextEntry
                autoCorrect={false}
              />

              <View style={styles.strengthHeader}>
                <Text style={styles.strengthLabel}>Niveau</Text>
                <Text style={[styles.strengthValue, { color: currentStrength.color }]}>
                  {currentStrength.label}
                </Text>
              </View>
              <View style={styles.strengthTrack}>
                <View style={[styles.strengthFill, { width: currentStrength.width, backgroundColor: currentStrength.color }]} />
              </View>
              <Text style={styles.helperText}>{getPasswordAdvice(passwordAnalysis.missing)}</Text>

              <View style={styles.criteriaList}>
                {criteriaItems.map((item) => (
                  <Text key={item.key} style={[styles.criteriaItem, item.ok ? styles.criteriaOk : styles.criteriaKo]}>
                    {item.ok ? '\u2713' : '\u2717'} {item.label}
                  </Text>
                ))}
              </View>

              {!!fieldErrors.password && <Text style={styles.errorText}>{fieldErrors.password}</Text>}

              <TextInput
                style={[styles.input, fieldErrors.confirmPassword ? styles.inputError : null]}
                placeholder="Confirmer le mot de passe"
                placeholderTextColor="#7F8AA3"
                value={confirmPassword}
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  setFieldErrors((current) => ({ ...current, confirmPassword: '' }));
                }}
                secureTextEntry
                autoCorrect={false}
              />
              {!!(fieldErrors.confirmPassword || confirmPasswordError) && (
                <Text style={styles.errorText}>{fieldErrors.confirmPassword || confirmPasswordError}</Text>
              )}

              <TouchableOpacity
                style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={!canSubmit}
                activeOpacity={0.9}
              >
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Creer mon compte</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkRow}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Login', { redirectTo, message })}
              >
                <Text style={styles.linkText}>J'ai deja un compte</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  background: {
    flex: 1,
    backgroundColor: '#050B16',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 11, 22, 0.72)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  shell: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 20,
  },
  hero: {
    flex: 1,
    minHeight: 260,
    backgroundColor: 'rgba(11, 18, 32, 0.82)',
    borderWidth: 1,
    borderColor: '#15233A',
    borderRadius: 28,
    padding: 28,
    justifyContent: 'space-between',
  },
  kicker: {
    color: '#7DB5FF',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    marginTop: 14,
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
  },
  heroText: {
    marginTop: 12,
    color: '#A9B6CC',
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 460,
  },
  secondaryButton: {
    marginTop: 24,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#223552',
    backgroundColor: '#0F1A2D',
  },
  secondaryButtonText: {
    color: '#E8EEF8',
    fontSize: 14,
    fontWeight: '800',
  },
  card: {
    flex: 1,
    maxWidth: Platform.OS === 'web' ? 420 : '100%',
    backgroundColor: 'rgba(11, 18, 32, 0.94)',
    borderWidth: 1,
    borderColor: '#15233A',
    borderRadius: 28,
    padding: 24,
    alignSelf: 'center',
    width: '100%',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: '#A9B6CC',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 22,
  },
  input: {
    backgroundColor: '#121C2E',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#15233A',
    fontSize: 15,
  },
  inputError: {
    borderColor: '#FF6B6B',
  },
  errorText: {
    color: '#FF9B9B',
    fontSize: 12,
    marginBottom: 10,
  },
  helperText: {
    color: '#A9B6CC',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  strengthHeader: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  strengthLabel: {
    color: '#E8EEF8',
    fontSize: 13,
    fontWeight: '700',
  },
  strengthValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  strengthTrack: {
    marginTop: 8,
    height: 8,
    width: '100%',
    borderRadius: 999,
    backgroundColor: '#16243B',
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 999,
  },
  criteriaList: {
    marginTop: 12,
    marginBottom: 14,
    gap: 6,
  },
  criteriaItem: {
    fontSize: 12,
    fontWeight: '600',
  },
  criteriaOk: {
    color: '#7BE495',
  },
  criteriaKo: {
    color: '#A9B6CC',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#FF4D4D',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  linkRow: {
    marginTop: 18,
    alignSelf: 'center',
  },
  linkText: {
    color: '#7DB5FF',
    fontSize: 14,
    fontWeight: '800',
  },
});
