import { router } from 'expo-router';
import { useState } from 'react';

import { AuthScreenShell } from '@/components/auth-screen-shell';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/auth-context';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    const { error: resetError } = await requestPasswordReset(email.trim());
    setSubmitting(false);
    if (resetError) {
      setError(resetError);
      return;
    }
    // Message générique unique, qu'un compte existe ou non pour cet email
    // (comportement volontaire de Supabase Auth, anti-énumération de
    // comptes) : ne jamais afficher un message différent selon le résultat.
    setSent(true);
  }

  if (sent) {
    return (
      <AuthScreenShell title="Vérifie ta boîte mail" onBack={() => router.replace('/login')}>
        <ThemedText type="body" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Si un compte existe pour {email.trim()}, un lien de réinitialisation vient d&apos;être envoyé.
        </ThemedText>
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell
      title="Retrouver l'accès à la meute"
      subtitle="Recevez un lien sécurisé pour créer un nouveau mot de passe."
      onBack={() => router.back()}>
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

      {error && (
        <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}

      <Button
        label={submitting ? 'Envoi…' : 'Recevoir le lien'}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!email}
      />
    </AuthScreenShell>
  );
}
