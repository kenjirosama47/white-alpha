import { createBrowserClient } from '@supabase/ssr';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

/**
 * Client Supabase navigateur (Phase 8.4, activé pour Realtime — voir la note
 * `httpOnly` dans `config.ts`, tranchée ici).
 *
 * Le cookie de session est `httpOnly` (jamais lisible en JavaScript) : ce
 * client n'a donc par défaut aucune session. Il est hydraté explicitement
 * via `client.auth.setSession({ access_token, refresh_token })`, avec des
 * jetons obtenus depuis une Server Action qui les lit côté serveur depuis le
 * cookie httpOnly (jamais générés ni stockés côté client) — voir
 * `app/conversations/[id]/actions.ts#getRealtimeCredentialsAction`. C'est le
 * seul moyen d'authentifier la connexion WebSocket Realtime, qui a besoin
 * d'un jeton d'accès en mémoire côté navigateur (aucune alternative
 * documentée par Supabase pour `postgres_changes`).
 *
 * `persistSession: false` : **vérifié dans le SDK installé**
 * (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`) — avec cette
 * option, le client utilise un adaptateur mémoire (`memoryLocalStorageAdapter`)
 * au lieu du « Local Storage » réel du navigateur (`globalThis` — API jamais
 * utilisée ici) : le jeton ne touche donc jamais ce stockage local,
 * seulement la mémoire JS de l'onglet (perdue à la fermeture/rechargement,
 * d'où la nouvelle hydratation à chaque montage). `autoRefreshToken: true`
 * reste sûr avec cette configuration : le rafraîchissement automatique
 * écrit aussi uniquement dans cet adaptateur mémoire, jamais dans le vrai
 * stockage local du navigateur.
 * `detectSessionInUrl: false` : ce client n'a jamais à lire un fragment
 * d'URL (`/auth/callback`, un Route Handler serveur, s'en charge déjà).
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
