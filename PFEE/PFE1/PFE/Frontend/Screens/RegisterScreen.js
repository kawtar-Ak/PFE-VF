import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { API_BASE_URL } from '../services/apiConfig';
import { authStorage } from '../services/authStorage';
import { favoritesService } from '../services/favoritesService';
import { notificationService } from '../services/notificationService';
import { useAppTheme } from '../src/theme/AppThemeContext';

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

  return { criteria, strength, missing };
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

const getStrengthMeta = (C) => ({
  FAIBLE: { label: 'Faible', color: C.live, width: '33%' },
  MOYEN: { label: 'Moyen', color: '#F4B942', width: '66%' },
  FORT: { label: 'Fort', color: C.success, width: '100%' },
});

export default function RegisterScreen({ navigation, route }) {
  const { width } = useWindowDimensions();
  const { palette: C, isDark } = useAppTheme();
  const isWide = width >= 980;
  const isTablet = width >= 640;
  const isCompact = width < 390;
  const styles = useMemo(
    () => createStyles(C, isDark, { isWide, isTablet, isCompact }),
    [C, isDark, isWide, isTablet, isCompact]
  );

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

  const strengthMeta = getStrengthMeta(C)[passwordAnalysis.strength];

  const criteriaItems = [
    { key: 'length', label: '10 caracteres minimum', ok: passwordAnalysis.criteria.length },
    { key: 'lowercase', label: 'Une minuscule', ok: passwordAnalysis.criteria.lowercase },
    { key: 'uppercase', label: 'Une majuscule', ok: passwordAnalysis.criteria.uppercase },
    { key: 'digit', label: 'Un chiffre', ok: passwordAnalysis.criteria.digit },
    { key: 'special', label: 'Un symbole', ok: passwordAnalysis.criteria.special },
  ];

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

  const handleRedirectAfterRegister = useCallback(() => {
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

  const handleRegister = useCallback(async () => {
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

      await authStorage.setSession(data.token, data.user);
      await favoritesService.syncWithServer();
      await notificationService.bootstrapForAuthenticatedUser({ forcePermissionPrompt: true });
      handleRedirectAfterRegister();
    } catch {
      Alert.alert('Erreur', 'Impossible de joindre le serveur.');
    } finally {
      setLoading(false);
    }
  }, [
    confirmPassword,
    confirmPasswordError,
    emailError,
    handleRedirectAfterRegister,
    normalizedEmail,
    normalizedUsername,
    password,
    passwordAnalysis.missing,
    passwordAnalysis.strength,
    usernameError,
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
              <View style={styles.heroPill}>
                <View style={styles.heroPillDot} />
                <Text style={styles.heroPillText}>KICKLY ACCOUNT</Text>
              </View>

              <Text style={styles.heroKicker}>Nouveau compte</Text>
              <Text style={styles.heroTitle}>Un compte seulement si vous en avez besoin.</Text>
              <Text style={styles.heroText}>
                L&apos;application reste accessible sans connexion. Creez un compte pour retrouver vos favoris et vos informations sur tous vos appareils.
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.9}
                onPress={() => navigation.replace('MainTabs', { screen: 'Home' })}
              >
                <Text style={styles.secondaryButtonText}>Continuer sans compte</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.authCard}>
              <View style={styles.authHeader}>
                <Text style={styles.authEyebrow}>Bienvenue</Text>
                <Text style={styles.authTitle}>Inscription</Text>
                <Text style={styles.authSubtitle}>{subtitle}</Text>
              </View>

              <TextInput
                style={[styles.input, fieldErrors.username ? styles.inputError : null]}
                placeholder="Nom d'utilisateur"
                placeholderTextColor={styles.placeholder.color}
                value={username}
                onChangeText={(value) => {
                  setUsername(value);
                  setFieldErrors((current) => ({ ...current, username: '' }));
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {!!(fieldErrors.username || usernameError) ? (
                <Text style={styles.errorText}>{fieldErrors.username || usernameError}</Text>
              ) : null}

              <TextInput
                style={[styles.input, fieldErrors.email ? styles.inputError : null]}
                placeholder="Adresse email"
                placeholderTextColor={styles.placeholder.color}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setFieldErrors((current) => ({ ...current, email: '' }));
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              {!!(fieldErrors.email || emailError) ? (
                <Text style={styles.errorText}>{fieldErrors.email || emailError}</Text>
              ) : null}

              <TextInput
                style={[styles.input, fieldErrors.password ? styles.inputError : null]}
                placeholder="Mot de passe"
                placeholderTextColor={styles.placeholder.color}
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
                <Text style={[styles.strengthValue, { color: strengthMeta.color }]}>
                  {strengthMeta.label}
                </Text>
              </View>
              <View style={styles.strengthTrack}>
                <View
                  style={[
                    styles.strengthFill,
                    { width: strengthMeta.width, backgroundColor: strengthMeta.color },
                  ]}
                />
              </View>
              <Text style={styles.helperText}>{getPasswordAdvice(passwordAnalysis.missing)}</Text>

              <View style={styles.criteriaList}>
                {criteriaItems.map((item) => (
                  <Text key={item.key} style={[styles.criteriaItem, item.ok ? styles.criteriaOk : styles.criteriaKo]}>
                    {item.ok ? '\u2713' : '\u2717'} {item.label}
                  </Text>
                ))}
              </View>

              {!!fieldErrors.password ? <Text style={styles.errorText}>{fieldErrors.password}</Text> : null}

              <TextInput
                style={[styles.input, fieldErrors.confirmPassword ? styles.inputError : null]}
                placeholder="Confirmer le mot de passe"
                placeholderTextColor={styles.placeholder.color}
                value={confirmPassword}
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  setFieldErrors((current) => ({ ...current, confirmPassword: '' }));
                }}
                secureTextEntry
                autoCorrect={false}
              />
              {!!(fieldErrors.confirmPassword || confirmPasswordError) ? (
                <Text style={styles.errorText}>{fieldErrors.confirmPassword || confirmPasswordError}</Text>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={!canSubmit}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color={C.accentDark} />
                ) : (
                  <Text style={styles.primaryButtonText}>Creer mon compte</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkRow}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Login', { redirectTo, message })}
              >
                <Text style={styles.linkText}>J&apos;ai deja un compte</Text>
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
    gap: isCompact ? 14 : 20,
    alignItems: 'stretch',
  },
  heroCard: {
    flex: isWide ? 0.95 : 0,
    minHeight: isCompact ? 196 : isTablet ? 230 : 208,
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
    fontSize: isCompact ? 24 : isTablet ? 34 : 28,
    lineHeight: isCompact ? 30 : isTablet ? 40 : 34,
    fontWeight: '900',
    maxWidth: isWide ? 420 : '100%',
  },
  heroText: {
    marginTop: 12,
    color: C.muted,
    fontSize: isCompact ? 13 : 15,
    lineHeight: isCompact ? 20 : 23,
    maxWidth: 460,
  },
  secondaryButton: {
    marginTop: 24,
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
  input: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : C.panelAlt,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: isCompact ? 12 : 14,
    marginBottom: 8,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: 15,
  },
  placeholder: {
    color: isDark ? '#8ea18f' : '#7f8aa3',
  },
  inputError: {
    borderColor: C.live,
  },
  errorText: {
    color: C.live,
    fontSize: 12,
    marginBottom: 10,
  },
  strengthHeader: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  strengthLabel: {
    color: C.text,
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
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : C.panelSoft,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 999,
  },
  helperText: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
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
    color: C.success,
  },
  criteriaKo: {
    color: C.muted,
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
    opacity: 0.45,
  },
  primaryButtonText: {
    color: C.accentDark,
    fontSize: 16,
    fontWeight: '900',
  },
  linkRow: {
    marginTop: 18,
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
