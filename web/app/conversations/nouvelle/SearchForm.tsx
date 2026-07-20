'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/Avatar';
import type { PublicMember } from '@/lib/conversations-types';
import { SEARCH_COPY } from '@/lib/copy';
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_LENGTH } from '@/lib/validation';

import { searchMembersAction, startConversationAction } from '../actions';
import styles from './SearchForm.module.css';

/**
 * Recherche de membres protégée (Phase 8.4) : debounce anti-spam côté
 * client (`SEARCH_DEBOUNCE_MS`), aucun appel réseau sous
 * `SEARCH_MIN_LENGTH` caractères, résultats limités à 20 (déjà imposé par
 * la RPC `search_public_profiles`, jamais dupliqué ici). Avatar + nom
 * uniquement — aucun email, aucun rôle (la RPC elle-même ne renvoie pas ces
 * colonnes, impossible de les afficher même par erreur).
 */
export function SearchForm() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicMember[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      // queueMicrotask : jamais de setState synchrone dans le corps d'un
      // effet (react-hooks/set-state-in-effect).
      queueMicrotask(() => {
        setResults([]);
        setIsSearching(false);
        setError(null);
      });
      return;
    }

    queueMicrotask(() => setIsSearching(true));
    debounceRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      searchMembersAction(trimmed)
        .then((result) => {
          // Ignore une réponse arrivée après une frappe plus récente (évite
          // qu'une réponse en retard n'écrase des résultats plus à jour).
          if (requestId !== requestIdRef.current) return;
          setIsSearching(false);
          setError(result.error);
          setResults(result.results);
        })
        .catch(() => {
          // Le fetch de l'action serveur elle-même a échoué (réseau) — sans
          // ce filet, "Recherche…" reste affiché indéfiniment sans retour.
          if (requestId !== requestIdRef.current) return;
          setIsSearching(false);
          setError('Impossible de rechercher pour le moment.');
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(member: PublicMember) {
    if (startingId) return;
    setStartingId(member.id);
    setError(null);
    startConversationAction(member.id)
      .then((result) => {
        if ('error' in result) {
          setStartingId(null);
          setError(result.error);
          return;
        }
        router.push(`/conversations/${result.conversationId}`);
      })
      .catch(() => {
        // Le fetch de l'action serveur elle-même a échoué (réseau) — sans ce
        // filet, le bouton reste bloqué sur "Ouverture…" indéfiniment.
        setStartingId(null);
        setError('Impossible d’ouvrir la conversation pour le moment.');
      });
  }

  return (
    <div className={styles.container}>
      <label htmlFor="member-search" className={styles.label}>
        Nom d&apos;utilisateur
      </label>
      <input
        id="member-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher un membre…"
        autoComplete="off"
        className={styles.input}
      />

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {isSearching && (
        <p role="status" className={styles.status}>
          Recherche…
        </p>
      )}

      {!isSearching && query.trim().length >= SEARCH_MIN_LENGTH && results.length === 0 && !error && (
        <p role="status" className={styles.status}>
          {SEARCH_COPY.noResultsTitle}
        </p>
      )}

      <ul className={styles.results}>
        {results.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              className={styles.resultItem}
              onClick={() => handleSelect(member)}
              disabled={startingId !== null}>
              <Avatar avatarUrl={member.avatarUrl} avatarPreset={member.avatarPreset} displayName={member.displayName} size={40} />
              <span className={styles.resultName}>{member.displayName}</span>
              {startingId === member.id && (
                <span className={styles.resultStatus} role="status">
                  Ouverture…
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
