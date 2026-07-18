'use client';

import { useEffect } from 'react';

/**
 * Enregistre le Service Worker minimal (`public/sw.js`, Phase 8.2). Ne fait
 * rien si l'API est absente (navigateur trop ancien, contexte non
 * sécurisé) — jamais une erreur bloquante pour le reste de l'app.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Best-effort : l'absence de Service Worker ne doit jamais empêcher
      // l'utilisation normale de l'app (mode hors connexion simplement
      // indisponible).
    });
  }, []);

  return null;
}
