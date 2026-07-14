import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const theme = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    router.replace('/');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Se connecter</ThemedText>

        <ThemedView style={styles.form}>
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
              {submitting ? 'Connexion...' : 'Se connecter'}
            </ThemedText>
          </Pressable>
        </ThemedView>

        <Link href="/register" style={styles.link}>
          <ThemedText type="link" themeColor="textSecondary">
            Pas encore de compte ? Créer un compte
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
