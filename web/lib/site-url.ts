/**
 * URL absolue de callback Supabase Auth (confirmation email, mot de passe
 * oublié) — partagée entre l'inscription et la réinitialisation de mot de
 * passe (Phase 8.3). `NEXT_PUBLIC_SITE_URL` reste vide en local (voir
 * `.env.example`) : Supabase retombe alors sur son propre "Site URL" de
 * configuration, jamais une valeur codée en dur ici.
 */
export function getAuthCallbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  return `${base}/auth/callback`;
}
