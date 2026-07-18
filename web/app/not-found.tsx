import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';

/** Page introuvable (convention App Router `not-found.tsx`). */
export default function NotFound() {
  return (
    <PageShell>
      <h1>Page introuvable</h1>
      <p>Cette page n’existe pas ou n’est plus disponible.</p>
      <Button href="/" variant="primary">
        Retour à l’accueil
      </Button>
    </PageShell>
  );
}
