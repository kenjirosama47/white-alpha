import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const RESEND_COOLDOWN_SECONDS = 30;

export default function RegisterScreen() {
  const theme = useTheme();
  const { signUp, resendConfirmation } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError(
        "Le nom d'utilisateur doit contenir entre 3 et 24 caractères : lettres minuscules, chiffres ou underscore uniquement.",
      );
      return;
    }

    setSubmitting(true);
    const { error: signUpError } = await signUp(email.trim(), password, normalizedUsername);
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    setRegisteredEmail(email.trim());
  }

  async function handleResend() {
    if (resending || resendCooldown > 0 || !registeredEmail) return;
    setResending(true);
    setResendNotice(null);
    const { error: resendError } = await resendConfirmation(registeredEmail);
    setResending(false);
    if (resendError) {
      setResendNotice(resendError);
      return;
    }
    setResendNotice('Email de confirmation renvoyé.');
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  if (registeredEmail) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle">Vérifie ta boîte mail</ThemedText>
          <ThemedText themeColor="textSecondary">
            Un email de confirmation a été envoyé à {registeredEmail}. Clique sur le lien qu&apos;il
            contient pour activer ton compte.
          </ThemedText>

          {resendNotice && <ThemedText type="small">{resendNotice}</ThemedText>}

          <Pressable
            onPress={handleResend}
            disabled={resending || resendCooldown > 0}
            style={({ pressed }) => [
              styles.buttonPrimary,
              (pressed || resending || resendCooldown > 0) && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={styles.buttonPrimaryLabel}>
              {resendCooldown > 0
                ? `Renvoyer (${resendCooldown}s)`
                : resending
                  ? 'Envoi...'
                  : "Renvoyer l'email de confirmation"}
            </ThemedText>
          </Pressable>

          <Link href="/login" style={styles.link}>
            <ThemedText type="link" themeColor="textSecondary">
              Retour à la connexion
            </ThemedText>
          </Link>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Créer un compte</ThemedText>

        <ThemedView style={styles.form}>
          <TextInput
            placeholder="Nom d'utilisateur"
            placeholderTextColor={theme.textSecondary}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            editable={!submitting}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!submitting}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <TextInput
            placeholder="Mot de passe"
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!submitting}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.buttonPrimary,
              (pressed || submitting) && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={styles.buttonPrimaryLabel}>
              {submitting ? 'Création...' : 'Créer mon compte'}
            </ThemedText>
          </Pressable>
        </ThemedView>

        <Link href="/login" style={styles.link}>
          <ThemedText type="link" themeColor="textSecondary">
            Déjà un compte ? Se connecter
          </ThemedText>
        </Link>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.five,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  form: {
    gap: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: '#D14343',
  },
  buttonPrimary: {
    backgroundColor: '#208AEF',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonPrimaryLabel: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
  link: {
    alignSelf: 'center',
  },
});
