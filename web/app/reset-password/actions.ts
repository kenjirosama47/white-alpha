'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { MIN_PASSWORD_LENGTH } from '@/lib/validation';

export type ResetPasswordState = {
  error: string | null;
};

const GENERIC_ERROR = 'Une erreur est survenue. Réessaie.';
const PASSWORD_MISMATCH_ERROR = 'Les deux mots de passe ne correspondent pas.';

const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
  'New password should be different from the old password.': "Le nouveau mot de passe doit être différent de l'ancien.",
  'Auth session missing!': 'Ce lien de réinitialisation est invalide ou a expiré. Demande un nouveau lien.',
};

function translateError(message: string): string {
  return KNOWN_ERROR_MESSAGES[message] ?? GENERIC_ERROR;
}

/**
 * Valide uniquement dans une session de récupération (établie par
 * `/auth/callback`, jamais atteinte directement autrement — revérifié aussi
 * dans `page.tsx`) — voir `src/contexts/auth-context.tsx#updatePassword`
 * (mobile), même logique. `updateUser` révoque implicitement le lien à
 * usage unique déjà consommé : aucune invalidation manuelle supplémentaire
 * nécessaire pour le lien lui-même.
 *
 * Succès (Phase 8.4) : déconnexion explicite de la session de récupération
 * (jamais laissée active silencieusement) puis redirection serveur vers
 * `/login?reason=password_updated` — jamais un état `success` renvoyé au
 * composant, `redirect()` interrompt l'exécution avant tout retour normal.
 */
export async function resetPasswordAction(_prevState: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }
  if (password !== confirmPassword) {
    return { error: PASSWORD_MISMATCH_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: translateError(error.message) };
  }

  await supabase.auth.signOut();
  redirect('/login?reason=password_updated');
}
