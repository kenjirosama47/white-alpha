import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { AuthScreenShell } from '@/components/auth-screen-shell';
import { Button } from '@/components/button';
import { PasswordField } from '@/components/password-field';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { REGISTER_COPY } from '@/constants/copy';
import { useAuth } from '@/contexts/auth-context';

const illustration = require('@/assets/images/white-alpha-wolf-auth.jpg');
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const RESEND_COOLDOWN_SECONDS = 30;

export default function RegisterScreen() {
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
      <AuthScreenShell
        illustrationSource={illustration}
        title="Vérifie ta boîte mail"
        subtitle={`Un email de confirmation a été envoyé à ${registeredEmail}. Clique sur le lien qu'il contient pour activer ton compte.`}>
        {resendNotice && (
          <ThemedText type="bodySmall" accessibilityRole="alert">
            {resendNotice}
          </ThemedText>
        )}

        <Button
          label={resendCooldown > 0 ? `Renvoyer (${resendCooldown}s)` : resending ? 'Envoi…' : "Renvoyer l'email de confirmation"}
          onPress={handleResend}
          loading={resending}
          disabled={resendCooldown > 0}
          variant="secondary"
        />

        <Link href="/login" asChild>
          <Pressable hitSlop={8} accessibilityRole="button">
            <ThemedText type="link" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Retour à la connexion
            </ThemedText>
          </Pressable>
        </Link>
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell
      illustrationSource={illustration}
      title={REGISTER_COPY.title}
      subtitle="Créez votre espace privé et sécurisé."
      onBack={() => router.back()}
      footer={
        <Link href="/login" asChild>
          <Pressable hitSlop={8} accessibilityRole="button">
            <ThemedText type="link" themeColor="textSecondary">
              Déjà un compte ? Se connecter
            </ThemedText>
          </Pressable>
        </Link>
      }>
      <TextField
        label="Nom d'utilisateur"
        placeholder="Nom d'utilisateur"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitting}
      />
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
        label={submitting ? 'Création…' : 'Créer mon compte'}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!username || !email || !password}
      />
    </AuthScreenShell>
  );
}
