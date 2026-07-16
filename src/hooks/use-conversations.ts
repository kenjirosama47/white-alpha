import { useCallback, useEffect, useState } from 'react';

import { useNetworkStatus } from '@/hooks/use-network-status';
import { listConversations } from '@/services/conversations';
import type { ConversationSummary } from '@/types/chat';

type UseConversationsResult = {
  conversations: ConversationSummary[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => void;
};

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aucun setState synchrone dans le corps de la fonction : tout passe par
  // .then/.catch/.finally pour rester compatible avec React Compiler
  // (react-hooks/set-state-in-effect), comme dans auth-context.tsx.
  const load = useCallback((isRefresh: boolean) => {
    listConversations()
      .then((result) => {
        setConversations(result);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue.');
      })
      .finally(() => {
        if (isRefresh) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    load(true);
  }, [load]);

  // Resynchronisation silencieuse au retour de connexion : recharge la liste
  // (jamais `isLoading`, qui remplacerait la liste déjà affichée par un écran
  // de chargement plein écran). `listConversations` n'est pas paginée : un
  // rechargement complet est sûr et suffisant ici, contrairement à
  // l'historique des messages d'une conversation (voir `use-messages.ts`, qui
  // fusionne plutôt que de tout recharger). `load(true)` uniquement — pas
  // `refresh()` — pour ne jamais déclencher l'indicateur "tirer pour
  // actualiser" lors d'une synchronisation que l'utilisateur n'a pas demandée
  // (et parce que ses seuls setState passent par .then/.catch/.finally,
  // jamais de façon synchrone dans cet effet).
  const { justReconnected } = useNetworkStatus();
  useEffect(() => {
    if (!justReconnected) return;
    load(true);
  }, [justReconnected, load]);

  return { conversations, isLoading, isRefreshing, error, refresh };
}
