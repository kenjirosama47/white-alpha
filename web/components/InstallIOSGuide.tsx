'use client';

import { useEffect, useState } from 'react';

import { INSTALL_IOS_COPY } from '@/lib/copy';

/**
 * Détecte si la PWA est déjà installée (mode standalone) pour n'afficher le
 * guide d'installation Safari que si nécessaire (Phase 8.2, section
 * « installation iPhone »). `navigator.standalone` est spécifique à Safari
 * iOS (non standard, mais c'est le seul indicateur fiable sur cette
 * plateforme) ; `display-mode: standalone` couvre les autres navigateurs.
 */
export function InstallIOSGuide() {
  const [isStandalone, setIsStandalone] = useState<boolean | null>(null);

  useEffect(() => {
    // Jamais de setState synchrone dans le corps de l'effet (règle
    // react-hooks/set-state-in-effect, même principe que
    // use-conversations.ts côté mobile) : la lecture elle-même
    // (window.matchMedia/navigator.standalone) doit rester dans l'effet
    // (indisponible pendant le rendu serveur), seule la mise à jour d'état
    // est différée.
    const standaloneMediaQuery = window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    queueMicrotask(() => setIsStandalone(standaloneMediaQuery || iosStandalone));
  }, []);

  if (isStandalone === null) {
    // Détection encore en cours (premier rendu serveur/hydratation) :
    // n'affiche rien plutôt qu'un guide potentiellement inutile qui
    // clignoterait à l'écran.
    return null;
  }

  if (isStandalone) {
    return <p role="status">White Alpha est déjà installée sur cet appareil.</p>;
  }

  return (
    <ol>
      {INSTALL_IOS_COPY.steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}
