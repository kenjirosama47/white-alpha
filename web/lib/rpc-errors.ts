import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Code Postgres d'une exception levée explicitement par nos propres RPC
 * (`raise exception '...'`) — port de `src/utils/errors.ts` (mobile,
 * `RAISE_EXCEPTION_SQLSTATE`). Seul ce message est sûr à afficher tel quel :
 * c'est notre propre texte contrôlé, jamais un détail Postgres interne.
 */
const RAISE_EXCEPTION_SQLSTATE = 'P0001';

export function friendlyRpcError(error: PostgrestError | null, fallback: string): string {
  if (error?.code === RAISE_EXCEPTION_SQLSTATE && error.message) {
    return error.message;
  }
  return fallback;
}
