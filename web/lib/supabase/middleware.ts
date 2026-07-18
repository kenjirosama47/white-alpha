import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { SUPABASE_COOKIE_OPTIONS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export type AuthenticatorLevel = 'aal1' | 'aal2' | null;

type UpdateSessionResult = {
  response: NextResponse;
  user: User | null;
  /** Vrai si un cookie de session Supabase existait avant cette requête mais n'a produit aucun utilisateur valide (session expirée/révoquée) — jamais vrai pour un visiteur qui n'a simplement jamais été connecté. */
  hadExpiredSession: boolean;
  supabase: SupabaseClient;
};

const SUPABASE_COOKIE_PREFIX = 'sb-';

/**
 * Rafraîchit la session Supabase à chaque requête et renvoie l'utilisateur
 * courant (`null` si absent/expiré) — appelé depuis `proxy.ts` à la racine.
 * `getUser()` (jamais `getSession()`) revalide le jeton auprès du serveur
 * Supabase à chaque appel : ne fait jamais confiance à un cookie
 * potentiellement expiré ou falsifié sans le revérifier.
 */
export async function updateSession(request: NextRequest): Promise<UpdateSessionResult> {
  let response = NextResponse.next({ request });

  const hadSupabaseCookieBefore = request.cookies.getAll().some((cookie) => cookie.name.startsWith(SUPABASE_COOKIE_PREFIX));

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, hadExpiredSession: hadSupabaseCookieBefore && !user, supabase };
}

/**
 * Niveau AAL courant/suivant de la session en cours (voir `lib/mfa.ts`
 * mobile pour la même logique) — lu depuis le jeton déjà en mémoire du
 * client fourni, sans appel réseau supplémentaire. `currentLevel !==
 * nextLevel` signifie qu'un facteur TOTP vérifié existe pour ce compte mais
 * que cette session précise ne l'a pas encore franchi (écran de
 * vérification requis avant tout accès aux pages sensibles).
 */
export async function getSessionAuthenticatorLevels(
  supabase: SupabaseClient,
): Promise<{ currentLevel: AuthenticatorLevel; nextLevel: AuthenticatorLevel }> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) {
    return { currentLevel: null, nextLevel: null };
  }
  return { currentLevel: data.currentLevel as AuthenticatorLevel, nextLevel: data.nextLevel as AuthenticatorLevel };
}
