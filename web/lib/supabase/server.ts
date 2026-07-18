import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { SUPABASE_COOKIE_OPTIONS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

/**
 * Client Supabase pour Server Components, Server Actions et Route Handlers
 * (Phase 8.2, fondation). Jamais utilisé côté navigateur — voir la note sur
 * `httpOnly` dans `config.ts`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Un Server Component pur (jamais une Server Action ni un Route
          // Handler) ne peut pas écrire de cookie — attendu et sans
          // conséquence : le middleware (`middleware.ts`) rafraîchit déjà la
          // session à chaque requête, avant même que ce composant s'exécute.
        }
      },
    },
  });
}
