export const MFA_CODE_GENERIC_ERROR = 'Code incorrect. Réessaie.';

/**
 * Messages connus traduits explicitement (voir `src/lib/mfa.ts`, mobile,
 * même politique) ; tout le reste retombe sur un message générique — jamais
 * le détail technique brut de Supabase Auth affiché tel quel, et jamais le
 * code saisi journalisé ni ici ni dans l'erreur retournée. Partagé entre le
 * challenge de connexion (`app/verification-mfa/actions.ts`) et l'enrôlement
 * (`app/membre/securite/mfa/actions.ts`) pour ne jamais faire dériver les
 * deux parcours.
 */
export function translateMfaError(message: string): string {
  if (message === 'Invalid TOTP code entered' || message === 'Invalid one-time password') {
    return MFA_CODE_GENERIC_ERROR;
  }
  if (/security purposes|after \d+ seconds/i.test(message)) {
    return 'Trop de tentatives : merci de patienter quelques instants avant de réessayer.';
  }
  if (/expired/i.test(message)) {
    return "Ce code a expiré. Génère-en un nouveau depuis ton application d'authentification.";
  }
  return MFA_CODE_GENERIC_ERROR;
}
