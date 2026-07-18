/**
 * Règles partagées entre le formulaire d'inscription et ses tests — copiées
 * à l'identique depuis l'app mobile (`src/app/(auth)/register.tsx`) et,
 * pour le nom d'utilisateur, depuis la contrainte réelle du déclencheur
 * Supabase `handle_new_user` (`supabase/migrations/20260714190417_create_profiles.sql`,
 * jamais modifié ici) : une valeur qui ne correspond pas à ce motif fait
 * échouer `signUp` côté serveur (le déclencheur lève une exception), donc la
 * validation côté client ne fait qu'anticiper ce même refus sans jamais le
 * remplacer.
 */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

/** Aligné sur le message d'erreur Supabase déjà traduit ailleurs dans le projet ("Password should be at least 6 characters"). */
export const MIN_PASSWORD_LENGTH = 6;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(raw));
}
