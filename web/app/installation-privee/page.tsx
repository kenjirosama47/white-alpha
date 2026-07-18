import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Installation privée — White Alpha',
  robots: { index: false, follow: false },
};

/**
 * Placeholder protégé (Phase 8.3) : seule la route est établie et protégée
 * dès maintenant (voir `proxy.ts`) — le contenu réel (téléchargement APK,
 * guide iPhone) reste pour l'instant sur `/install` (page publique existante
 * de la Phase 8.2) et sera déplacé/complété ici à la Phase 8.7 (« Page
 * privée et distribution Android/iPhone »), hors du périmètre
 * « authentification » de cette sous-phase.
 */
export default async function PrivateInstallPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <PageShell>
        <p>Session introuvable.</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1>Installation privée</h1>
      <p>Connecté en tant que {user.email}.</p>
      <p>Le téléchargement Android et le guide iPhone protégés par authentification arrivent à la Phase 8.7.</p>
    </PageShell>
  );
}
