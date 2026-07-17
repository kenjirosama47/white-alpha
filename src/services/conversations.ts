import { getAvatarPublicUrl } from '@/services/avatars';
import { supabase } from '@/lib/supabase';
import type { ConversationSummary } from '@/types/chat';
import { friendlyRpcError } from '@/utils/errors';

type ListConversationsRow = {
  conversation_id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string;
  /** Chemin Storage dans le bucket `avatars` (jamais une URL complète) — voir migration 20260716140000. */
  other_avatar_url: string | null;
  last_message_content: string | null;
  last_message_created_at: string | null;
};

function mapConversationRow(row: ListConversationsRow): ConversationSummary {
  return {
    conversationId: row.conversation_id,
    otherParticipant: {
      id: row.other_user_id,
      username: row.other_username,
      displayName: row.other_display_name,
      avatarUrl: row.other_avatar_url ? getAvatarPublicUrl(row.other_avatar_url) : null,
    },
    lastMessageContent: row.last_message_content,
    lastMessageCreatedAt: row.last_message_created_at,
  };
}

/** Liste les conversations de l'utilisateur courant via la RPC `list_my_conversations`. */
export async function listConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('list_my_conversations');

  if (error) {
    throw new Error(friendlyRpcError(error, 'Impossible de charger les conversations pour le moment.'));
  }

  return (data ?? []).map(mapConversationRow);
}

/** Crée ou réutilise la conversation privée avec `targetUserId` via RPC. */
export async function getOrCreateConversation(targetUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(friendlyRpcError(error, 'Impossible de créer la conversation pour le moment.'));
  }
  if (!data) {
    throw new Error('Impossible de créer la conversation pour le moment.');
  }

  return data;
}

type ConversationForNotificationRow = {
  conversation_id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string;
  other_avatar_url: string | null;
};

/**
 * Revalide l'appartenance de l'utilisateur courant à `conversationId` avant
 * de l'ouvrir depuis une notification (jamais à partir des seules données de
 * la notification elle-même). `null` signifie explicitement "reviens à
 * Conversations" : accès perdu, conversation supprimée, ou identifiant
 * invalide — jamais une erreur qui distinguerait ces cas entre eux.
 */
export async function getConversationForNotification(
  conversationId: string,
): Promise<ConversationSummary['otherParticipant'] & { conversationId: string } | null> {
  const { data, error } = await supabase.rpc('get_conversation_for_notification', {
    p_conversation_id: conversationId,
  });

  if (error) return null;

  const row = (Array.isArray(data) ? data[0] : data) as ConversationForNotificationRow | undefined;
  if (!row) return null;

  return {
    conversationId: row.conversation_id,
    id: row.other_user_id,
    username: row.other_username,
    displayName: row.other_display_name,
    avatarUrl: row.other_avatar_url ? getAvatarPublicUrl(row.other_avatar_url) : null,
  };
}
