import { supabase } from '@/lib/supabase';
import { validateMessageContent, type ImageMimeType, type Message, type VideoMimeType } from '@/types/chat';

export const MESSAGES_PAGE_SIZE = 30;

// SQLSTATE que Postgres assigne à `raise exception '...'` sans code explicite
// (notre style dans toutes les RPC create_*_message). Ne faire confiance à
// `error.message` que pour ce code précis : toute autre erreur (contrainte
// violée en dehors d'un raise exception, erreur de type, panne réseau, etc.)
// est un détail technique brut qui ne doit jamais atteindre l'utilisateur.
const RAISE_EXCEPTION_SQLSTATE = 'P0001';

function rpcErrorMessage(error: { message?: string; code?: string } | null, fallback: string): string {
  if (error?.code === RAISE_EXCEPTION_SQLSTATE && error.message) {
    return error.message;
  }
  return fallback;
}

const MESSAGE_SELECT =
  'id, conversation_id, sender_id, content, created_at, ' +
  'message_attachments(id, storage_path, media_type, mime_type, size_bytes, width, height, duration_ms, uploader_id, created_at)';

type AttachmentRow = {
  id: string;
  storage_path: string;
  media_type: 'image' | 'video';
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
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
    attachment:
      attachmentRow == null
        ? null
        : attachmentRow.media_type === 'video'
          ? {
              id: attachmentRow.id,
              messageId: row.id,
              conversationId: row.conversation_id,
              uploaderId: attachmentRow.uploader_id,
              mediaType: 'video',
              storagePath: attachmentRow.storage_path,
              mimeType: attachmentRow.mime_type as VideoMimeType,
              sizeBytes: attachmentRow.size_bytes,
              durationMs: attachmentRow.duration_ms ?? 0,
              width: attachmentRow.width,
              height: attachmentRow.height,
              createdAt: attachmentRow.created_at,
            }
          : {
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
            },
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
    throw new Error(rpcErrorMessage(error, "Impossible d'envoyer le message pour le moment."));
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
    throw new Error(rpcErrorMessage(error, "Impossible d'envoyer l'image pour le moment."));
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

type CreateVideoMessageParams = {
  conversationId: string;
  storagePath: string;
  mimeType: VideoMimeType;
  sizeBytes: number;
  durationMs: number;
  width?: number | null;
  height?: number | null;
  /** Légende optionnelle. Un message vidéo peut n'avoir aucun texte. */
  content?: string;
};

type CreateVideoMessageRow = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachment_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number;
  width: number | null;
  height: number | null;
};

/**
 * Crée un message vidéo via la RPC `create_video_message`. Le fichier doit
 * déjà avoir été uploadé vers `chat-media` (upload TUS reprenable, voir
 * `services/media.ts`) sous `storagePath` avant cet appel : l'upload Storage
 * n'est PAS transactionnel avec cette RPC. Seules les lignes
 * `messages`/`message_attachments` sont insérées de façon atomique, côté
 * PostgreSQL. Si l'appel échoue après un upload réussi, l'appelant supprime
 * le fichier Storage en compensation (pas un rollback automatique).
 */
export async function sendVideoMessage(params: CreateVideoMessageParams): Promise<Message> {
  const { data, error } = await supabase.rpc('create_video_message', {
    p_conversation_id: params.conversationId,
    p_storage_path: params.storagePath,
    p_mime_type: params.mimeType,
    p_size_bytes: params.sizeBytes,
    p_duration_ms: params.durationMs,
    p_width: params.width ?? null,
    p_height: params.height ?? null,
    p_content: params.content?.trim() ?? '',
  });

  if (error) {
    throw new Error(rpcErrorMessage(error, "Impossible d'envoyer la vidéo pour le moment."));
  }

  const row = (Array.isArray(data) ? data[0] : data) as CreateVideoMessageRow | undefined;
  if (!row) {
    throw new Error("Impossible d'envoyer la vidéo pour le moment.");
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
      mediaType: 'video',
      storagePath: row.storage_path,
      mimeType: row.mime_type as VideoMimeType,
      sizeBytes: row.size_bytes,
      durationMs: row.duration_ms,
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

export type DeleteOwnMessageResult = {
  messageId: string;
  messageType: 'text' | 'image' | 'video';
  /** Chemin du média associé, `null` pour un message texte. Jamais une URL signée. */
  storagePath: string | null;
};

type DeleteOwnMessageRow = {
  message_id: string;
  message_type: string;
  storage_path: string | null;
};

/**
 * Supprime un message via la RPC `delete_own_message` (et sa pièce jointe,
 * en cascade côté base). `sender_id` n'est jamais transmis : la RPC vérifie
 * elle-même que le message appartient à `auth.uid()`, et refuse sinon.
 * Idempotente : appeler cette fonction sur un message déjà supprimé résout
 * `null` plutôt que d'échouer — nécessaire pour la reprise après un échec
 * survenant après la suppression du fichier Storage (voir
 * `hooks/use-message-deletion.ts`), qui doit pouvoir réessayer cet appel
 * sans risque de doublon ou d'erreur incohérente.
 */
export async function deleteOwnMessage(messageId: string): Promise<DeleteOwnMessageResult | null> {
  const { data, error } = await supabase.rpc('delete_own_message', { p_message_id: messageId });

  if (error) {
    throw new Error(rpcErrorMessage(error, 'Impossible de supprimer le message pour le moment.'));
  }

  const row = (Array.isArray(data) ? data[0] : data) as DeleteOwnMessageRow | undefined;
  if (!row) {
    // Idempotence : déjà supprimé par un appel précédent, pas une erreur.
    return null;
  }

  return {
    messageId: row.message_id,
    messageType: row.message_type as DeleteOwnMessageResult['messageType'],
    storagePath: row.storage_path,
  };
}
