import { supabase } from '@/lib/supabase';
import type { ConversationSummary } from '@/types/chat';
import { friendlyRpcError } from '@/utils/errors';

type ListConversationsRow = {
  conversation_id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string;
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
      avatarUrl: row.other_avatar_url,
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
