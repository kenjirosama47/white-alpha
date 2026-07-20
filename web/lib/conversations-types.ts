/**
 * Types et constantes partagés entre le serveur (`lib/conversations.ts`,
 * qui dépend de `next/headers` via le client Supabase serveur) et le
 * navigateur (hooks/composants clients, Realtime) — ce fichier n'importe
 * strictement rien qui ne soit utilisable côté client, pour ne jamais faire
 * fuiter `next/headers` dans le bundle navigateur.
 */

export type PublicMember = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarPreset: string;
};

export type ConversationSummary = {
  conversationId: string;
  otherParticipant: PublicMember;
  lastMessageContent: string | null;
  lastMessageCreatedAt: string | null;
};

export type ConversationHeader = PublicMember & { conversationId: string };

export type MessageType = 'text' | 'image' | 'video';

export type MessageStatus = 'sent' | 'pending' | 'failed';

export type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
  createdAt: string;
};

/** Message affiché côté client : `status` n'existe que pour un message envoyé pendant cette session (jamais pour un message chargé depuis le serveur ou reçu via Realtime, toujours `'sent'`). */
export type DisplayMessage = MessageRow & { status: MessageStatus };

export const MESSAGES_PAGE_SIZE = 30;
