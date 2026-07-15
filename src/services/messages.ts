import { supabase } from '@/lib/supabase';
import { validateMessageContent, type ImageMimeType, type Message } from '@/types/chat';

export const MESSAGES_PAGE_SIZE = 30;

const MESSAGE_SELECT =
  'id, conversation_id, sender_id, content, created_at, ' +
  'message_attachments(id, storage_path, mime_type, size_bytes, width, height, uploader_id, created_at)';

type AttachmentRow = {
  id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  uploader_id: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  message_attachments: AttachmentRow[] | null;
};

function mapMessageRow(row: MessageRow): Message {
  const attachmentRow = row.message_attachments?.[0] ?? null;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    createdAt: row.created_at,
    attachment: attachmentRow
      ? {
          id: attachmentRow.id,
          messageId: row.id,
          conversationId: row.conversation_id,
          uploaderId: attachmentRow.uploader_id,
          mediaType: 'image',
          storagePath: attachmentRow.storage_path,
          mimeType: attachmentRow.mime_type as ImageMimeType,
          sizeBytes: attachmentRow.size_bytes,
          width: attachmentRow.width,
          height: attachmentRow.height,
          createdAt: attachmentRow.created_at,
        }
      : null,
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
    .select(MESSAGE_SELECT)
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

  return ((data ?? []) as unknown as MessageRow[]).map(mapMessageRow).reverse();
}

type CreateTextMessageRow = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

/**
 * Envoie un message texte via la RPC `create_text_message`. L'INSERT direct
 * sur `messages` est révoqué pour `authenticated` (voir migration Phase 4A) :
 * sender_id vient exclusivement de `auth.uid()` côté serveur, jamais de l'UI.
 */
export async function sendMessage(conversationId: string, content: string): Promise<Message> {
  const validation = validateMessageContent(content);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const { data, error } = await supabase.rpc('create_text_message', {
    p_conversation_id: conversationId,
    p_content: content.trim(),
  });

  if (error) {
    throw new Error(error.message || "Impossible d'envoyer le message pour le moment.");
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
    createdAt: row.created_at,
    attachment: null,
  };
}

type CreateImageMessageParams = {
  conversationId: string;
  storagePath: string;
  mimeType: ImageMimeType;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  /** Légende optionnelle. Un message photo peut n'avoir aucun texte. */
  content?: string;
};

type CreateImageMessageRow = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachment_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
};

/**
 * Crée un message photo via la RPC `create_image_message`. Le fichier doit
 * déjà avoir été uploadé vers `chat-media` sous `storagePath` avant cet
 * appel : l'upload Storage n'est PAS transactionnel avec cette RPC (deux
 * systèmes distincts). Seules les lignes `messages`/`message_attachments`
 * sont insérées de façon atomique, côté PostgreSQL, à l'intérieur de la RPC.
 * Si l'appel échoue après un upload réussi, l'appelant (`useMediaUpload`)
 * supprime le fichier Storage en compensation (pas un rollback automatique).
 */
export async function sendImageMessage(params: CreateImageMessageParams): Promise<Message> {
  const { data, error } = await supabase.rpc('create_image_message', {
    p_conversation_id: params.conversationId,
    p_storage_path: params.storagePath,
    p_mime_type: params.mimeType,
    p_size_bytes: params.sizeBytes,
    p_width: params.width ?? null,
    p_height: params.height ?? null,
    p_content: params.content?.trim() ?? '',
  });

  if (error) {
    throw new Error(error.message || "Impossible d'envoyer l'image pour le moment.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as CreateImageMessageRow | undefined;
  if (!row) {
    throw new Error("Impossible d'envoyer l'image pour le moment.");
  }

  return {
    id: row.message_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    createdAt: row.created_at,
    attachment: {
      id: row.attachment_id,
      messageId: row.message_id,
      conversationId: row.conversation_id,
      uploaderId: row.sender_id,
      mediaType: 'image',
      storagePath: row.storage_path,
      mimeType: row.mime_type as ImageMimeType,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
    },
  };
}

/**
 * Recharge un message unique avec sa pièce jointe éventuelle. Utilisé après
 * un événement Realtime `INSERT` sur `messages`, dont la charge utile ne
 * contient jamais les lignes jointes de `message_attachments`.
 */
export async function fetchMessageById(messageId: string): Promise<Message | null> {
  const { data, error } = await supabase.from('messages').select(MESSAGE_SELECT).eq('id', messageId).maybeSingle();

  if (error) {
    throw new Error('Impossible de charger le message pour le moment.');
  }
  if (!data) {
    return null;
  }

  return mapMessageRow(data as unknown as MessageRow);
}

/** Supprime un message (et sa pièce jointe, en cascade côté base). Réservé à l'expéditeur, appliqué via RLS. */
export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase.from('messages').delete().eq('id', messageId);

  if (error) {
    throw new Error('Impossible de supprimer le message pour le moment.');
  }
}
