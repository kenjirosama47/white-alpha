import { useCallback, useEffect, useRef, useState } from 'react';

import { getSignedAttachmentUrl } from '@/services/media';

type UseSignedAttachmentUrlResult = {
  url: string | null;
  isLoading: boolean;
  error: string | null;
  /** Redemande une URL signée fraîche (ex. après expiration détectée par un échec de chargement). */
  refresh: () => void;
};

/**
 * URL signée temporaire pour une pièce jointe privée. Jamais persistée :
 * gardée uniquement en mémoire pour la durée du composant, redemandée à
 * chaque montage (ou changement de `storagePath`) et à chaque `refresh()`.
 */
export function useSignedAttachmentUrl(storagePath: string): UseSignedAttachmentUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Identifiant de requête plutôt qu'un simple booléen "annulé" : ignore les
  // réponses obsolètes si `refresh()` est appelé pendant qu'une requête
  // précédente est encore en vol, sans dépendre uniquement du démontage.
  const requestIdRef = useRef(0);

  // Ne met à jour l'état que dans les callbacks asynchrones (then/catch/
  // finally), jamais de façon synchrone : appelée directement depuis l'effet
  // de montage, où un setState synchrone déclencherait des rendus en cascade.
  const fetchSignedUrl = useCallback(
    (requestId: number) => {
      getSignedAttachmentUrl(storagePath)
        .then((signedUrl) => {
          if (requestIdRef.current !== requestId) return;
          setUrl(signedUrl);
        })
        .catch((err) => {
          if (requestIdRef.current !== requestId) return;
          setError(err instanceof Error ? err.message : "Impossible de charger l'image.");
        })
        .finally(() => {
          if (requestIdRef.current !== requestId) return;
          setIsLoading(false);
        });
    },
    [storagePath],
  );

  useEffect(() => {
    fetchSignedUrl(++requestIdRef.current);
  }, [fetchSignedUrl]);

  // Appelée depuis un gestionnaire d'événement (ex. bouton "réessayer"),
  // jamais depuis un effet : la remise à zéro synchrone de l'état y est sûre.
  const refresh = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    fetchSignedUrl(requestId);
  }, [fetchSignedUrl]);

  return { url, isLoading, error, refresh };
}
