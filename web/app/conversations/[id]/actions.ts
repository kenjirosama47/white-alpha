'use server';

import { sendTextMessage, type MessageRow } from '@/lib/conversations';
import { createClient } from '@/lib/supabase/server';
import { normalizeMessageContent, validateMessageContent } from '@/lib/validation';

export type SendMessageResult = { message: MessageRow } | { error: string };

/**
 * Validation dupliquée côté serveur (jamais uniquement côté client) : la RPC
 * `create_text_message` revalide aussi la longueur (voir
 * `MESSAGE_MAX_LENGTH`, `lib/validation.ts`) — cette étape n'est qu'une
 * anticipation plus rapide du même refus, jamais un remplacement. Contenu
 * jamais journalisé, y compris en cas d'erreur.
 */
export async function sendMessageAction(conversationId: string, content: string): Promise<SendMessageResult> {
  const normalized = normalizeMessageContent(content);
  const validation = validateMessageContent(normalized);
  if (!validation.ok) {
    return { error: validation.error };
  }

  try {
    const message = await sendTextMessage(conversationId, normalized);
    return { message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Impossible d'envoyer le message pour le moment." };
  }
}

export type RealtimeCredentials = { accessToken: string; refreshToken: string } | null;

/**
 * Fournit au client navigateur les jetons nécessaires pour authentifier sa
 * propre connexion WebSocket Realtime (voir la note détaillée dans
 * `lib/supabase/client.ts`) — jamais journalisés, jamais stockés côté
 * serveur au-delà de cette requête, jamais renvoyés à un autre endroit que
 * l'appelant.
 *
 * `getSession()` (pas `getUser()`) : ce choix est délibéré et sûr ici,
 * contrairement à la règle générale du projet ("toujours getUser(), jamais
 * getSession(), pour une décision d'autorisation"). Cette action ne PREND
 * aucune décision d'autorisation — `proxy.ts` a déjà revalidé
 * l'authentification via `getUser()` avant que cette requête n'atteigne ce
 * code (toute route sous `/conversations` est protégée). On ne fait ici que
 * relayer les jetons déjà validés à l'instant ; un jeton invalide/expiré ne
 * permettrait de toute façon aucun contournement de RLS côté Realtime.
 */
export async function getRealtimeCredentialsAction(): Promise<RealtimeCredentials> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) return null;

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}
