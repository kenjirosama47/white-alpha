'use server';

import { getOrCreateConversation, listMyConversations, searchMembers, type ConversationSummary, type PublicMember } from '@/lib/conversations';
import { SEARCH_MIN_LENGTH } from '@/lib/validation';

export type ListConversationsResult = { conversations: ConversationSummary[] } | { error: string };

export async function listConversationsAction(): Promise<ListConversationsResult> {
  try {
    const conversations = await listMyConversations();
    return { conversations };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Une erreur est survenue. Réessaie.' };
  }
}

export type SearchMembersResult = { results: PublicMember[]; error: string | null };

/**
 * Recherche protégée (Phase 8.4) : sous le minimum de caractères, retourne
 * une liste vide sans jamais appeler la RPC (anticipe le refus serveur,
 * évite un aller-retour réseau inutile à chaque frappe) — le délai
 * anti-spam lui-même (debounce) est géré côté client
 * (`SEARCH_DEBOUNCE_MS`), pas ici.
 */
export async function searchMembersAction(query: string): Promise<SearchMembersResult> {
  const trimmed = query.trim();
  if (trimmed.length < SEARCH_MIN_LENGTH) {
    return { results: [], error: null };
  }

  try {
    const results = await searchMembers(trimmed);
    return { results, error: null };
  } catch (error) {
    return { results: [], error: error instanceof Error ? error.message : 'Une erreur est survenue. Réessaie.' };
  }
}

export type StartConversationResult = { conversationId: string } | { error: string };

/**
 * Jamais de `redirect()` ici : appelée depuis un composant client de façon
 * impérative (pas une soumission de formulaire) — `redirect()` lève un
 * signal interne Next.js qu'un `try/catch` autour de cet appel intercepterait
 * par erreur. Le composant appelant navigue lui-même après réception de
 * `conversationId`.
 */
export async function startConversationAction(targetUserId: string): Promise<StartConversationResult> {
  try {
    const conversationId = await getOrCreateConversation(targetUserId);
    return { conversationId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Une erreur est survenue. Réessaie.' };
  }
}
