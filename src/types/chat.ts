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

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
};

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 400;

export const MESSAGE_MIN_LENGTH = 1;
export const MESSAGE_MAX_LENGTH = 4000;

export type ValidationResult = { ok: true } | { ok: false; error: string };

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
