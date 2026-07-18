'use server';

import { createClient } from '@/lib/supabase/server';
import { MIN_PASSWORD_LENGTH } from '@/lib/validation';

export type ResetPasswordState = {
  error: string | null;
  success: boolean;
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
 * `/auth/callback`, jamais atteinte directement autrement) — voir
 * `src/contexts/auth-context.tsx#updatePassword` (mobile), même logique.
 * `updateUser` révoque implicitement le lien à usage unique déjà consommé :
 * aucune invalidation manuelle supplémentaire nécessaire.
 */
export async function resetPasswordAction(_prevState: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`, success: false };
  }
  if (password !== confirmPassword) {
    return { error: PASSWORD_MISMATCH_ERROR, success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: translateError(error.message), success: false };
  }

  return { error: null, success: true };
}
