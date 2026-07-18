'use client';

import { useEffect } from 'react';

import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';

/** État d'erreur global (convention App Router `error.tsx`, doit être un Client Component). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Jamais le détail technique brut affiché à l'utilisateur — voir le
    // message générique ci-dessous. Le détail reste disponible ici pour un
    // futur envoi vers un outil de suivi d'erreurs, jamais journalisé avec
    // des données utilisateur.
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <h1>Une erreur est survenue</h1>
      <p>Quelque chose ne s’est pas passé comme prévu. Réessaie, ou reviens plus tard.</p>
      <Button onClick={reset} variant="primary">
        Réessayer
      </Button>
    </PageShell>
  );
}
