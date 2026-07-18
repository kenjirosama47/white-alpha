import { createBrowserClient } from '@supabase/ssr';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

/**
 * Client Supabase navigateur (Phase 8.3). N'est invoqué par aucun code de
 * cette sous-phase : connexion, inscription, confirmation, mot de passe
 * oublié/réinitialisation, MFA et déconnexion passent tous par des Server
 * Actions ou un Route Handler (`lib/supabase/server.ts`), jamais par ce
 * client — `supabase.auth.getAuthenticatorAssuranceLevel()` lit la session
 * depuis le cookie côté serveur, sans réseau supplémentaire, donc aucun
 * appel navigateur n'est nécessaire pour l'authentification elle-même.
 *
 * Créé maintenant pour suivre la structure standard recommandée par
 * `@supabase/ssr` (navigateur/serveur/middleware) et anticiper la Phase 8.4
 * (Realtime pour les conversations, qui nécessitera un client navigateur
 * pour s'abonner aux canaux). Ce jour-là, le cookie de session devra être
 * lisible par ce client — voir la note `httpOnly` dans `config.ts` : ne
 * jamais supposer silencieusement que ce client peut lire la session tant
 * que ce point n'a pas été tranché explicitement.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
