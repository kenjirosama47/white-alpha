import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';

export const metadata: Metadata = {
  title: 'Hors connexion — White Alpha',
  robots: { index: false, follow: false },
};

/**
 * Page de repli hors connexion, servie par le Service Worker
 * (`public/sw.js`) quand une navigation échoue faute de réseau — jamais
 * l'écran d'erreur générique du navigateur. Contenu statique uniquement,
 * jamais de donnée privée (cette page peut être mise en cache, voir
 * `sw.js`).
 */
export default function OfflinePage() {
  return (
    <PageShell>
      <h1>Hors connexion</h1>
      <p>White Alpha n’a pas pu se connecter au serveur. Vérifie ta connexion et réessaie.</p>
    </PageShell>
  );
}
