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

/**
 * Règles de conversations/messages (Phase 8.4) — copiées à l'identique
 * depuis `src/types/chat.ts` (mobile) et depuis les contraintes réelles des
 * RPC Supabase (`search_public_profiles` : minimum 2 caractères ;
 * `create_text_message`/contrainte `messages_content_length` : 1 à 4000
 * caractères) — jamais modifiées ici, la validation côté client ne fait
 * qu'anticiper le même refus serveur.
 */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 400;

export const MESSAGE_MIN_LENGTH = 1;
export const MESSAGE_MAX_LENGTH = 4000;

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function normalizeMessageContent(raw: string): string {
  return raw.trim();
}

export function validateMessageContent(raw: string): ValidationResult {
  const trimmed = normalizeMessageContent(raw);
  if (trimmed.length < MESSAGE_MIN_LENGTH) {
    return { ok: false, error: 'Le message ne peut pas être vide.' };
  }
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: `Le message ne peut pas dépasser ${MESSAGE_MAX_LENGTH} caractères.` };
  }
  return { ok: true };
}
