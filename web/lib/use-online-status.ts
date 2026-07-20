'use client';

import { useEffect, useState } from 'react';

/**
 * État de connexion réseau (Phase 8.4) — `navigator.onLine` reflète l'état
 * de l'interface réseau du système, pas une vérification active de
 * Supabase : un faux positif (Wi-Fi connecté sans Internet réel) reste
 * possible, comme sur toute plateforme. `useState(() => ...)` : lu une seule
 * fois au montage (jamais pendant le rendu serveur, où `navigator` est
 * absent), puis mis à jour uniquement par les événements `online`/`offline`.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // queueMicrotask : jamais de setState synchrone dans le corps d'un effet
    // (react-hooks/set-state-in-effect), même politique que
    // `use-conversations.ts` côté mobile.
    queueMicrotask(() => setIsOnline(navigator.onLine));

    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
