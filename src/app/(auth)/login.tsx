import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { AuthScreenShell } from '@/components/auth-screen-shell';
import { Button } from '@/components/button';
import { PasswordField } from '@/components/password-field';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { LOGIN_COPY } from '@/constants/copy';
import { useAuth } from '@/contexts/auth-context';

const illustration = require('@/assets/images/white-alpha-wolf-auth.jpg');

export default function LoginScreen() {
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
    <AuthScreenShell
      illustrationSource={illustration}
      title={LOGIN_COPY.title}
      subtitle="Connectez-vous pour accéder à vos conversations privées."
      onBack={() => router.back()}
      footer={
        <>
          <Link href="/forgot-password" asChild>
            <Pressable hitSlop={8} accessibilityRole="button">
              <ThemedText type="link" themeColor="textSecondary">
                Mot de passe oublié ?
              </ThemedText>
            </Pressable>
          </Link>
          <Link href="/register" asChild>
            <Pressable hitSlop={8} accessibilityRole="button">
              <ThemedText type="link" themeColor="textSecondary">
                Pas encore de compte ? Créer un compte
              </ThemedText>
            </Pressable>
          </Link>
        </>
      }>
      <TextField
        label="Email"
        placeholder="ton@email.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        editable={!submitting}
      />
      <PasswordField
        label="Mot de passe"
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        editable={!submitting}
      />

      {error && (
        <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}

      <Button
        label={submitting ? 'Connexion…' : 'Se connecter'}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!email || !password}
      />
    </AuthScreenShell>
  );
}
