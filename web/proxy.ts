import { NextResponse, type NextRequest } from 'next/server';

import { SUPABASE_URL } from '@/lib/supabase/config';
import { getSessionAuthenticatorLevels, updateSession } from '@/lib/supabase/middleware';
import { sanitizeRedirectPath } from '@/lib/redirect';

const DEFAULT_PROTECTED_DESTINATION = '/membre';
const PROTECTED_PREFIXES = ['/membre', '/profil', '/installation-privee'];
const AUTH_ONLY_WHEN_LOGGED_OUT = ['/login', '/inscription', '/forgot-password'];
/** Étapes intermédiaires d'authentification : ni publiques, ni pleinement protégées — voir la section dédiée ci-dessous. */
const MFA_CHALLENGE_PATH = '/verification-mfa';
/** Jamais mis en cache par le navigateur ni le Service Worker (Phase 8.3, section 10) : sessions et étapes d'authentification uniquement. */
const NEVER_CACHED_PATHS = [...PROTECTED_PREFIXES, MFA_CHALLENGE_PATH, '/reset-password'];

/**
 * Protection d'accès côté serveur (jamais uniquement en JavaScript
 * navigateur, Phase 8.2/8.3) : ce fichier (convention `proxy.ts`, qui
 * remplace `middleware.ts` depuis Next.js 16 — voir
 * https://nextjs.org/docs/messages/middleware-to-proxy) s'exécute sur le
 * serveur/edge avant qu'aucune page ne soit rendue. Une page sous `/membre`,
 * `/profil` ou `/installation-privee` sans utilisateur authentifié est
 * redirigée avant tout envoi de contenu — un utilisateur sans JavaScript
 * actif (ou l'ayant désactivé) est protégé exactement de la même façon.
 */
export async function proxy(request: NextRequest) {
  const { response, user, hadExpiredSession, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isAuthOnlyWhenLoggedOut = AUTH_ONLY_WHEN_LOGGED_OUT.some((prefix) => pathname === prefix);
  const isMfaChallenge = pathname === MFA_CHALLENGE_PATH;

  if ((isProtected || isMfaChallenge) && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', pathname);
    // Distingue « jamais connecté » de « session expirée/révoquée » : seul
    // ce second cas affiche le message dédié (voir SESSION_EXPIRED_COPY,
    // page /login) — jamais affiché à un visiteur qui n'a simplement jamais
    // ouvert de session.
    if (hadExpiredSession) redirectUrl.searchParams.set('reason', 'expired');
    return NextResponse.redirect(redirectUrl);
  }

  if (isProtected && user) {
    const { currentLevel, nextLevel } = await getSessionAuthenticatorLevels(supabase);
    if (currentLevel && nextLevel && currentLevel !== nextLevel) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = MFA_CHALLENGE_PATH;
      redirectUrl.search = '';
      redirectUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isMfaChallenge && user) {
    const { currentLevel, nextLevel } = await getSessionAuthenticatorLevels(supabase);
    // Rien à vérifier (pas de facteur, ou déjà vérifié pour cette session) :
    // cet écran n'a plus lieu d'être, on ne le laisse jamais s'afficher
    // inutilement.
    if (!currentLevel || !nextLevel || currentLevel === nextLevel) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = sanitizeRedirectPath(request.nextUrl.searchParams.get('next'), DEFAULT_PROTECTED_DESTINATION);
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isAuthOnlyWhenLoggedOut && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = DEFAULT_PROTECTED_DESTINATION;
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  if (NEVER_CACHED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    response.headers.set('Cache-Control', 'no-store');
  }

  applySecurityHeaders(response, request);
  return response;
}

/**
 * CSP avec nonce généré à chaque requête (recette officielle Next.js pour
 * l'App Router) : un nonce statique/réutilisé n'apporterait aucune
 * protection réelle contre l'injection de script (XSS), puisqu'un
 * attaquant capable d'injecter du HTML pourrait alors réutiliser ce même
 * nonce connu à l'avance.
 */
function applySecurityHeaders(response: NextResponse, request: NextRequest): void {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const supabaseOrigin = new URL(SUPABASE_URL).origin;
  const supabaseWebSocketOrigin = supabaseOrigin.replace('https://', 'wss://');
  // `unsafe-eval` uniquement en développement (`next dev`) : React et les
  // outils de rafraîchissement à chaud (Turbopack HMR) utilisent eval() pour
  // reconstruire les piles d'appel en développement — jamais en production,
  // où React ne l'utilise jamais (voir avertissement React officiel). Ne
  // jamais laisser cette valeur passer dans un build de production.
  const scriptSrcEval = process.env.NODE_ENV !== 'production' ? ` 'unsafe-eval'` : '';

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' + nonce : les scripts Next.js chargés dynamiquement
    // par un script déjà autorisé (nonce valide) héritent de la confiance,
    // sans avoir besoin d'énumérer chaque hash — recette officielle Next.js.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${scriptSrcEval}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: ${supabaseOrigin}`,
    `font-src 'self'`,
    // connect-src : uniquement le projet Supabase (API REST + Realtime
    // WebSocket, ce dernier pas encore utilisé dans cette fondation mais
    // autorisé par avance pour éviter une régression de CSP silencieuse
    // quand les conversations seront ajoutées) — aucun autre domaine.
    `connect-src 'self' ${supabaseOrigin} ${supabaseWebSocketOrigin}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ');

  request.headers.set('x-nonce', nonce);
  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', csp);
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf : fichiers statiques Next.js, favicon, icônes,
     * manifest, robots.txt et le Service Worker (jamais besoin d'une
     * session/CSP dynamique pour ces réponses statiques publiques).
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|robots.txt|sw.js).*)',
  ],
};
