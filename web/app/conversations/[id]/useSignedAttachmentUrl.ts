'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getSignedAttachmentUrlAction } from './actions';

type UseSignedAttachmentUrlResult = {
  url: string | null;
  isLoading: boolean;
  error: boolean;
  /** Redemande une URL signée fraîche (ex. après une erreur de chargement du média détectée par `onError`, ou une expiration). */
  refresh: () => void;
};

type ResolvedState = { attachmentId: string; url: string | null; error: boolean; isLoading: boolean };

/**
 * URL signée temporaire pour une pièce jointe privée (Phase 8.5.4) — jamais
 * persistée : gardée uniquement en mémoire (état React) pour la durée du
 * composant, redemandée à chaque montage, à chaque changement
 * d'`attachmentId` et à chaque `refresh()`. Ne journalise jamais l'URL ni
 * l'erreur brute (`getSignedAttachmentUrlAction` ne renvoie jamais de détail
 * Supabase, uniquement `string | null`).
 *
 * L'état résolu (`ResolvedState`) mémorise l'`attachmentId` auquel il
 * correspond : quand `attachmentId` change, l'état encore associé à
 * l'ancien identifiant est traité comme obsolète et **dérivé** en
 * chargement (`isStale` ci-dessous) au moment du rendu — jamais réinitialisé
 * par un `setState` synchrone dans le corps de l'effet (anti-pattern React :
 * provoque un rendu en cascade), qui n'existe que pour déclencher la
 * nouvelle résolution.
 *
 * Identifiant de requête (`requestIdRef`) : ignore une réponse obsolète si
 * `attachmentId` change ou si `refresh()` est appelé pendant qu'une requête
 * précédente est encore en vol.
 */
export function useSignedAttachmentUrl(attachmentId: string): UseSignedAttachmentUrlResult {
  const [state, setState] = useState<ResolvedState>({ attachmentId, url: null, error: false, isLoading: true });
  const requestIdRef = useRef(0);

  const fetchSignedUrl = useCallback((requestId: number, forAttachmentId: string) => {
    getSignedAttachmentUrlAction(forAttachmentId)
      .then((signedUrl) => {
        if (requestIdRef.current !== requestId) return;
        setState({ attachmentId: forAttachmentId, url: signedUrl, error: !signedUrl, isLoading: false });
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setState({ attachmentId: forAttachmentId, url: null, error: true, isLoading: false });
      });
  }, []);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    fetchSignedUrl(requestId, attachmentId);

    // Démontage : invalide toute requête encore en vol pour ce composant —
    // aucun setState après ce point, jamais une URL conservée au-delà du
    // cycle de vie du composant.
    return () => {
      requestIdRef.current += 1;
    };
  }, [attachmentId, fetchSignedUrl]);

  const refresh = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setState((previous) => ({ ...previous, isLoading: true, error: false }));
    fetchSignedUrl(requestId, attachmentId);
  }, [attachmentId, fetchSignedUrl]);

  // L'état résolu appartient encore à un attachmentId différent de celui
  // demandé maintenant : jamais afficher son url/erreur, toujours un état de
  // chargement le temps que le nouvel effet ci-dessus résolve.
  const isStale = state.attachmentId !== attachmentId;

  return {
    url: isStale ? null : state.url,
    isLoading: isStale ? true : state.isLoading,
    error: isStale ? false : state.error,
    refresh,
  };
}
