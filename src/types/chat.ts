export type PublicProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ConversationSummary = {
  conversationId: string;
  otherParticipant: PublicProfile;
  lastMessageContent: string | null;
  lastMessageCreatedAt: string | null;
};

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export type MessageAttachment = {
  id: string;
  messageId: string;
  conversationId: string;
  uploaderId: string;
  mediaType: 'image';
  storagePath: string;
  mimeType: ImageMimeType;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  attachment: MessageAttachment | null;
};

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 400;

export const MESSAGE_MIN_LENGTH = 1;
export const MESSAGE_MAX_LENGTH = 4000;

export type ValidationResult = { ok: true } | { ok: false; error: string };

export const ALLOWED_IMAGE_MIME_TYPES: readonly ImageMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo

export function isAllowedImageMimeType(mimeType: string | null | undefined): mimeType is ImageMimeType {
  return !!mimeType && (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Valide un fichier image avant upload : type MIME et taille uniquement (le contenu n'est pas inspecté ici). */
export function validateImageFile(input: { mimeType: string | null | undefined; sizeBytes: number }): ValidationResult {
  if (!isAllowedImageMimeType(input.mimeType)) {
    return { ok: false, error: 'Format d’image non pris en charge. Utilise JPEG, PNG ou WebP.' };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: 'Fichier invalide.' };
  }
  if (input.sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    return { ok: false, error: 'L’image ne doit pas dépasser 10 Mo.' };
  }
  return { ok: true };
}

export function validateSearchQuery(query: string): ValidationResult {
  if (query.trim().length < SEARCH_MIN_LENGTH) {
    return { ok: false, error: `La recherche doit contenir au moins ${SEARCH_MIN_LENGTH} caractères.` };
  }
  return { ok: true };
}

export function validateMessageContent(content: string): ValidationResult {
  const trimmedLength = content.trim().length;
  if (trimmedLength < MESSAGE_MIN_LENGTH) {
    return { ok: false, error: 'Le message ne peut pas être vide.' };
  }
  if (trimmedLength > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: `Le message ne peut pas dépasser ${MESSAGE_MAX_LENGTH} caractères.` };
  }
  return { ok: true };
}
