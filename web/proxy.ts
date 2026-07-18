import { NextResponse, type NextRequest } from 'next/server';

import { SUPABASE_URL } from '@/lib/supabase/config';
import { updateSession } from '@/lib/supabase/middleware';

const PROTECTED_PREFIXES = ['/app'];
const AUTH_ONLY_WHEN_LOGGED_OUT = ['/login', '/forgot-password'];

/**
 * Protection d'accès côté serveur (jamais uniquement en JavaScript
 * navigateur, Phase 8.2) : ce fichier (convention `proxy.ts`, qui remplace
 * `middleware.ts` depuis Next.js 16 — voir
 * https://nextjs.org/docs/messages/middleware-to-proxy) s'exécute sur le
 * serveur/edge avant qu'aucune page ne soit rendue. Une page sous `/app`
 * sans utilisateur authentifié est redirigée avant tout envoi de contenu —
 * un utilisateur sans JavaScript actif (ou l'ayant désactivé) est protégé
 * exactement de la même façon.
 */
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isAuthOnlyWhenLoggedOut = AUTH_ONLY_WHEN_LOGGED_OUT.some((prefix) => pathname === prefix);

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthOnlyWhenLoggedOut && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/app';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
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

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' + nonce : les scripts Next.js chargés dynamiquement
    // par un script déjà autorisé (nonce valide) héritent de la confiance,
    // sans avoir besoin d'énumérer chaque hash — recette officielle Next.js.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
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
