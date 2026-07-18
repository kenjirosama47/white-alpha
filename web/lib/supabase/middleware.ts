import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

import { SUPABASE_COOKIE_OPTIONS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

type UpdateSessionResult = {
  response: NextResponse;
  user: User | null;
};

/**
 * Rafraîchit la session Supabase à chaque requête et renvoie l'utilisateur
 * courant (`null` si absent/expiré) — appelé depuis `middleware.ts` à la
 * racine. `getUser()` (jamais `getSession()`) revalide le jeton auprès du
 * serveur Supabase à chaque appel : ne fait jamais confiance à un cookie
 * potentiellement expiré ou falsifié sans le revérifier.
 */
export async function updateSession(request: NextRequest): Promise<UpdateSessionResult> {
  let response = NextResponse.next({ request });

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

  return { response, user };
}
