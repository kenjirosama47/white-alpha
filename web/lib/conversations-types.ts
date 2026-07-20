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

/**
 * Métadonnées d'affichage d'une pièce jointe (Phase 8.5.4) — **jamais**
 * `storagePath` : ce champ n'est jamais sélectionné côté serveur pour être
 * envoyé au client (voir `lib/conversations.ts#mapMessageRow`), ni transmis
 * par aucune réponse client. La résolution d'une URL affichable passe
 * exclusivement par `getSignedAttachmentUrlAction(attachmentId)`
 * (`app/conversations/[id]/actions.ts`), qui retrouve le chemin
 * exclusivement côté serveur.
 */
export type MessageAttachment = {
  id: string;
  mediaType: 'image' | 'video';
  mimeType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
  createdAt: string;
  attachment: MessageAttachment | null;
};

/** Message affiché côté client : `status` n'existe que pour un message envoyé pendant cette session (jamais pour un message chargé depuis le serveur ou reçu via Realtime, toujours `'sent'`). */
export type DisplayMessage = MessageRow & { status: MessageStatus };

export const MESSAGES_PAGE_SIZE = 30;
