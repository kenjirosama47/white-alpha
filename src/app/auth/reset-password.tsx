import { router } from 'expo-router';
import { useState } from 'react';

import { AuthScreenShell } from '@/components/auth-screen-shell';
import { Button } from '@/components/button';
import { PasswordField } from '@/components/password-field';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/auth-context';

/**
 * Atteint uniquement depuis une session de récupération valide (lien email
 * ouvert via `auth/callback`, voir Phase 7.3) — jamais lié depuis un autre
 * écran de l'application. Aucun texte officiel spécifique n'a été fourni
 * pour cet écran (seul « Mot de passe oublié » en a un) : titre/sous-titre
 * choisis dans la même voix, à valider.
 */
export default function ResetPasswordScreen() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <AuthScreenShell title="Mot de passe mis à jour">
        <ThemedText type="body" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Ton mot de passe a été changé. Tu peux maintenant accéder à tes conversations.
        </ThemedText>
        <Button label="Continuer" onPress={() => router.replace('/')} />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell title="Créer un nouveau mot de passe" subtitle="Choisis un nouveau mot de passe pour ton compte.">
      <PasswordField
        label="Nouveau mot de passe"
        placeholder="Nouveau mot de passe"
        value={password}
        onChangeText={setPassword}
        editable={!submitting}
      />
      <PasswordField
        label="Confirmer le mot de passe"
        placeholder="Confirmer le mot de passe"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!submitting}
      />

      {error && (
        <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}

      <Button
        label={submitting ? 'Mise à jour…' : 'Valider le nouveau mot de passe'}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!password || !confirmPassword}
      />
    </AuthScreenShell>
  );
}
