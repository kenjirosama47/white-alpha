'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { isStandaloneDisplay } from '@/lib/device-detection';

/** Événement non standard (extension WHATWG en discussion) : absent des types DOM officiels de TypeScript. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Installation Android déclenchée par l'événement `beforeinstallprompt`
 * (Phase 8.7) — Chrome/Edge/Samsung Internet le déclenchent automatiquement
 * quand les critères PWA sont réunis (manifest valide, Service Worker,
 * HTTPS) ; jamais garanti de se déclencher (répétition trop rapprochée,
 * critère navigateur non rempli). Repli systématique vers des instructions
 * manuelles quand l'événement n'arrive pas, jamais un bouton mort.
 */
export function InstallAndroidGuide() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | null>(null);

  useEffect(() => {
    // Même règle que InstallIOSGuide : jamais de setState synchrone dans le
    // corps de l'effet, seule la lecture (matchMedia) doit s'y trouver
    // directement (indisponible côté serveur).
    const standaloneMediaQuery = window.matchMedia('(display-mode: standalone)').matches;
    queueMicrotask(() => setIsStandalone(isStandaloneDisplay(standaloneMediaQuery, false)));

    function handleBeforeInstallPrompt(event: Event) {
      // Empêche la mini-infobar automatique de Chrome : c'est ce bouton qui
      // déclenche l'installation, jamais un popup navigateur non maîtrisé.
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setIsStandalone(true);
      setInstallEvent(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setOutcome(choice.outcome);
    // Un événement `beforeinstallprompt` ne peut être utilisé qu'une seule
    // fois (API navigateur) : jamais réutilisé après ce point, que
    // l'utilisateur ait accepté ou refusé.
    setInstallEvent(null);
  }

  if (isStandalone === null) {
    // Détection encore en cours (premier rendu serveur/hydratation) :
    // n'affiche rien plutôt qu'un état potentiellement faux qui clignoterait.
    return null;
  }

  if (isStandalone) {
    return <p role="status">White Alpha est déjà installée sur cet appareil.</p>;
  }

  if (outcome === 'dismissed') {
    return (
      <div>
        <p role="status">Installation annulée. Tu peux réessayer à tout moment.</p>
        <ManualAndroidInstructions />
      </div>
    );
  }

  if (installEvent) {
    return (
      <Button type="button" variant="primary" onClick={handleInstallClick}>
        Installer White Alpha
      </Button>
    );
  }

  return <ManualAndroidInstructions />;
}

function ManualAndroidInstructions() {
  return (
    <ol>
      <li>Ouvrir White Alpha dans Chrome</li>
      <li>Toucher le menu ⋮ (en haut à droite)</li>
      <li>Choisir « Installer l’application » ou « Ajouter à l’écran d’accueil »</li>
      <li>Confirmer l’installation</li>
    </ol>
  );
}
