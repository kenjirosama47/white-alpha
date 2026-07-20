'use server';

import { fetchMessageById, sendTextMessage, type MessageRow } from '@/lib/conversations';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/media-config';
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

/**
 * Recharge un message complet (avec sa pièce jointe éventuelle) après un
 * événement Realtime `INSERT` — le payload brut `postgres_changes` ne
 * contient jamais la jointure `message_attachments`, jamais utilisé seul
 * pour l'affichage d'un message média (Phase 8.5.4). `null` en cas d'échec
 * ou d'absence (message supprimé entre-temps, accès refusé) : jamais
 * distingué, jamais bloquant pour le reste du fil déjà affiché.
 */
export async function fetchMessageByIdAction(messageId: string): Promise<MessageRow | null> {
  try {
    return await fetchMessageById(messageId);
  } catch {
    return null;
  }
}

/**
 * Résout une URL signée temporaire pour une pièce jointe (Phase 8.5.4).
 * Entrée : uniquement `attachmentId` — **jamais un `storagePath` transmis
 * par le navigateur**, celui-ci n'est ni sélectionné ni renvoyé par aucune
 * autre action/fonction serveur (voir la note sur `message_attachments`
 * dans `conversations-types.ts`). Le chemin réel est retrouvé ici, côté
 * serveur uniquement, via un SELECT protégé par la policy RLS existante "Un
 * participant peut voir les pièces jointes" (Phase 4A) — aucune vérification
 * d'appartenance supplémentaire nécessaire : une ligne inexistante ou hors
 * des conversations de l'utilisateur courant produit le même `null`, jamais
 * distingué (anti-énumération). `createSignedUrl` utilise le client serveur
 * authentifié par la session cookie (jamais `service_role`). Ne renvoie
 * jamais le détail brut d'une erreur Supabase — uniquement `null` en cas
 * d'échec, jamais journalisé avec l'URL ou le chemin.
 */
export async function getSignedAttachmentUrlAction(attachmentId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: attachment } = await supabase
    .from('message_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .maybeSingle();

  if (!attachment) return null;

  const { data, error } = await supabase.storage.from('chat-media').createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;

  return data.signedUrl;
}
