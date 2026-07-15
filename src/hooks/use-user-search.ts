import { useEffect, useRef, useState } from 'react';

import { searchProfiles } from '@/services/profiles';
import { SEARCH_DEBOUNCE_MS, validateSearchQuery, type PublicProfile } from '@/types/chat';

type UseUserSearchResult = {
  query: string;
  setQuery: (query: string) => void;
  results: PublicProfile[];
  isSearching: boolean;
  error: string | null;
};

/** Recherche d'utilisateurs avec anti-rebond : n'appelle la RPC qu'après une pause de saisie. */
export function useUserSearch(): UseUserSearchResult {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    // Tout le travail (y compris la validation de longueur minimale) est
    // différé dans le timeout : aucun setState synchrone dans le corps de
    // l'effet, pour rester compatible avec React Compiler.
    const timeoutId = setTimeout(() => {
      if (requestIdRef.current !== requestId) return;

      const validation = validateSearchQuery(query);
      if (!validation.ok) {
        setResults([]);
        setError(null);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setError(null);

      searchProfiles(query)
        .then((profiles) => {
          if (requestIdRef.current !== requestId) return;
          setResults(profiles);
        })
        .catch((err) => {
          if (requestIdRef.current !== requestId) return;
          setError(err instanceof Error ? err.message : 'Erreur inconnue.');
          setResults([]);
        })
        .finally(() => {
          if (requestIdRef.current !== requestId) return;
          setIsSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [query]);

  return { query, setQuery, results, isSearching, error };
}
