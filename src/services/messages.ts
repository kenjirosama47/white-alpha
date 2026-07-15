import { supabase } from '@/lib/supabase';
import { validateMessageContent, type Message } from '@/types/chat';

export const MESSAGES_PAGE_SIZE = 30;

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

function mapMessageRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * Charge une page de messages d'une conversation, du plus récent au plus
 * ancien puis remis en ordre chronologique. Passer `before` (created_at du
 * message le plus ancien déjà chargé) pour paginer vers l'historique.
 */
export async function fetchMessages(conversationId: string, before?: string): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('id, conversation_id, sender_id, content, created_at')
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

  return (data ?? []).map(mapMessageRow).reverse();
}

/** Envoie un message. `senderId` doit toujours venir de la session courante, jamais de l'UI. */
export async function sendMessage(conversationId: string, senderId: string, content: string): Promise<Message> {
  const validation = validateMessageContent(content);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content: content.trim() })
    .select('id, conversation_id, sender_id, content, created_at')
    .single();

  if (error) {
    throw new Error("Impossible d'envoyer le message pour le moment.");
  }

  return mapMessageRow(data);
}
