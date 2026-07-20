import { getAvatarPublicUrl } from '@/lib/avatars';
import type { ConversationHeader, ConversationSummary, MessageRow, MessageType, PublicMember } from '@/lib/conversations-types';
import { MESSAGES_PAGE_SIZE } from '@/lib/conversations-types';
import { friendlyRpcError } from '@/lib/rpc-errors';
import { SUPABASE_URL } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

/**
 * Couche de données conversations (Phase 8.4) — réutilise strictement les
 * RPC/tables Supabase déjà existantes (voir audit avant implémentation,
 * migrations 20260715104100/125649/140000/130037/210000,
 * 20260718090000) : aucune migration nécessaire, aucun accès direct qui
 * contournerait RLS. Fichier serveur uniquement (`createClient` dépend de
 * `next/headers`) — jamais importable depuis un composant client, par
 * construction. Types/constantes partagés avec le client : voir
 * `lib/conversations-types.ts`.
 */

export type { ConversationHeader, ConversationSummary, MessageRow, MessageType, PublicMember };
export { MESSAGES_PAGE_SIZE };

/** `other_avatar_url`/`avatar_url` renvoyés par les RPC sont des chemins Storage, jamais une URL complète (voir migration 20260716140000). */
function resolveAvatarUrl(storagePath: string | null): string | null {
  return storagePath ? getAvatarPublicUrl(SUPABASE_URL, storagePath) : null;
}

type ListConversationsRow = {
  conversation_id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string;
  other_avatar_url: string | null;
  other_avatar_preset: string;
  last_message_content: string | null;
  last_message_created_at: string | null;
};

/** Liste les conversations de l'utilisateur courant via `list_my_conversations` (déjà filtrée par `auth.uid()` côté serveur). */
export async function listMyConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_my_conversations');

  if (error) {
    throw new Error(friendlyRpcError(error, 'Impossible de charger les conversations pour le moment.'));
  }

  return ((data ?? []) as ListConversationsRow[]).map((row) => ({
    conversationId: row.conversation_id,
    otherParticipant: {
      id: row.other_user_id,
      username: row.other_username,
      displayName: row.other_display_name,
      avatarUrl: resolveAvatarUrl(row.other_avatar_url),
      avatarPreset: row.other_avatar_preset,
    },
    lastMessageContent: row.last_message_content,
    lastMessageCreatedAt: row.last_message_created_at,
  }));
}

type ConversationHeaderRow = {
  conversation_id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string;
  other_avatar_url: string | null;
  other_avatar_preset: string;
};

/**
 * Revalide l'appartenance de l'utilisateur courant à `conversationId` et
 * renvoie le profil public de l'autre participant, via
 * `get_conversation_for_notification` — zéro ligne = accès refusé OU
 * conversation inexistante, jamais distingué (anti-énumération déjà en
 * place côté RPC, réutilisée telle quelle pour l'écran de discussion).
 */
export async function getConversationHeader(conversationId: string): Promise<ConversationHeader | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_conversation_for_notification', {
    p_conversation_id: conversationId,
  });

  if (error) return null;

  const row = (Array.isArray(data) ? data[0] : data) as ConversationHeaderRow | undefined;
  if (!row) return null;

  return {
    conversationId: row.conversation_id,
    id: row.other_user_id,
    username: row.other_username,
    displayName: row.other_display_name,
    avatarUrl: resolveAvatarUrl(row.other_avatar_url),
    avatarPreset: row.other_avatar_preset,
  };
}

type SearchRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_preset: string;
};

/** Recherche de profils publics via `search_public_profiles` — jamais d'email, jamais de rôle (colonnes non renvoyées par la RPC elle-même). */
export async function searchMembers(query: string): Promise<PublicMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_public_profiles', { search_query: query });

  if (error) {
    throw new Error(friendlyRpcError(error, 'Impossible de rechercher pour le moment.'));
  }

  return ((data ?? []) as SearchRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: resolveAvatarUrl(row.avatar_url),
    avatarPreset: row.avatar_preset,
  }));
}

/** Crée ou réutilise la conversation privée avec `targetUserId` via `get_or_create_direct_conversation`. */
export async function getOrCreateConversation(targetUserId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(friendlyRpcError(error, 'Impossible de créer la conversation pour le moment.'));
  }
  if (!data) {
    throw new Error('Impossible de créer la conversation pour le moment.');
  }

  return data as string;
}

type MessageDbRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
};

function mapMessageRow(row: MessageDbRow): MessageRow {
  const messageType: MessageType = row.message_type === 'image' || row.message_type === 'video' ? row.message_type : 'text';
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    messageType,
    createdAt: row.created_at,
  };
}

/**
 * Charge une page de messages, du plus récent au plus ancien puis remise en
 * ordre chronologique — SELECT direct protégé par RLS (policy "Un
 * participant peut lire les messages de ses conversations", jamais
 * contournée), même stratégie que `src/services/messages.ts` (mobile).
 * Passer `before` (created_at du message le plus ancien déjà chargé) pour
 * paginer vers l'historique.
 */
export async function fetchMessagesPage(conversationId: string, before?: string): Promise<MessageRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('messages')
    .select('id, conversation_id, sender_id, content, message_type, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MESSAGES_PAGE_SIZE);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error('Impossible de charger les messages pour le moment.');
  }

  return ((data ?? []) as MessageDbRow[]).map(mapMessageRow).reverse();
}

type CreateTextMessageRow = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

/**
 * Envoie un message texte via `create_text_message` — l'INSERT direct sur
 * `messages` est révoqué pour `authenticated` (migration 20260715140000) :
 * `sender_id` vient exclusivement de `auth.uid()` côté serveur, jamais du
 * client. Validation de longueur également faite côté serveur (RPC), la
 * validation client (`lib/validation.ts`) n'en est qu'une anticipation.
 */
export async function sendTextMessage(conversationId: string, content: string): Promise<MessageRow> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_text_message', {
    p_conversation_id: conversationId,
    p_content: content,
  });

  if (error) {
    throw new Error(friendlyRpcError(error, "Impossible d'envoyer le message pour le moment."));
  }

  const row = (Array.isArray(data) ? data[0] : data) as CreateTextMessageRow | undefined;
  if (!row) {
    throw new Error("Impossible d'envoyer le message pour le moment.");
  }

  return {
    id: row.message_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    messageType: 'text',
    createdAt: row.created_at,
  };
}
