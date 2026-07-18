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
 * LIMITE À REVISITER (Phase suivante, conversations/Realtime) : le jour où
 * un `createBrowserClient` est introduit côté client pour Realtime, ce
 * client aura besoin de lire la session — impossible depuis un cookie
 * `httpOnly`. Deux options à trancher à ce moment-là, jamais avant : (a)
 * exposer un jeton d'accès de très courte durée par un canal dédié
 * (ex. endpoint serveur qui le fournit à la demande, jamais stocké), ou
 * (b) repasser `httpOnly` à `false` pour ce cookie précis en acceptant le
 * compromis (lecture JS possible), avec CSP stricte comme mitigation contre
 * le XSS. Ne jamais trancher cela silencieusement dans une phase ultérieure
 * sans le documenter explicitement ici.
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
