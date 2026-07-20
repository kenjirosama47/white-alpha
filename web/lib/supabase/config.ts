import type { CookieOptions } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Variables Supabase manquantes : renseigne NEXT_PUBLIC_SUPABASE_URL et ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans web/.env.local (voir web/.env.example). ' +
      'Jamais la clé service_role ni une clé sb_secret_... ici.',
  );
}

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_PUBLISHABLE_KEY = supabasePublishableKey;

/**
 * Options de cookie communes serveur/middleware (Phase 8.2, fondation).
 *
 * `httpOnly: true` — remplace le défaut de `@supabase/ssr`
 * (`DEFAULT_COOKIE_OPTIONS.httpOnly === false`, vérifié dans
 * `node_modules/@supabase/ssr/dist/main/utils/constants.js`) : cette
 * fondation n'utilise aucun `createBrowserClient` (aucun écran authentifié
 * type conversations/Realtime n'existe encore), donc rien côté navigateur
 * n'a besoin de lire ce cookie en JavaScript — le forcer en `httpOnly`
 * dès maintenant est strictement plus sûr, sans aucune perte de
 * fonctionnalité actuelle.
 *
 * DÉCISION (Phase 8.4, Realtime conversations) : ce cookie reste `httpOnly`
 * — le client navigateur (`lib/supabase/client.ts`, désormais utilisé pour
 * Realtime) ne le lit jamais directement. À la place, une Server Action lit
 * la session côté serveur (où le cookie httpOnly reste lisible) et transmet
 * uniquement `access_token`/`refresh_token` au client, qui les garde en
 * mémoire (`persistSession: false`, jamais dans le « Local Storage » du
 * navigateur — voir la note dans `client.ts`). Option (b) de l'ancienne note ci-dessous (passer
 * ce cookie en non-httpOnly) a été explicitement écartée : option (a)
 * retenue, risque XSS résiduel identique à celui de tout jeton en mémoire
 * JS, mitigé par la CSP stricte déjà en place.
 */
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // 8 heures : bien plus court que le défaut de 400 jours de @supabase/ssr —
  // une messagerie privée doit expirer une session inactive, pas la
  // maintenir indéfiniment. Le rafraîchissement automatique de session
  // (`updateSession`, middleware) prolonge une session active normalement ;
  // seule une session réellement inactive expire.
  maxAge: 60 * 60 * 8,
};
