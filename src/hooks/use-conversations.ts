import { useCallback, useEffect, useState } from 'react';

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

  return { conversations, isLoading, isRefreshing, error, refresh };
}
