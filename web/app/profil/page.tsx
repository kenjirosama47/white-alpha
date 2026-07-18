import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Profil — White Alpha',
  robots: { index: false, follow: false },
};

/**
 * Placeholder protégé (Phase 8.3) : seule la route est établie et protégée
 * dès maintenant (voir `proxy.ts`) — le contenu réel (avatar, préférences)
 * arrive avec les écrans Web complets, hors du périmètre « authentification »
 * de cette sous-phase.
 */
export default async function ProfilePage() {
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
      <h1>Profil</h1>
      <p>Connecté en tant que {user.email}.</p>
      <p>Le profil complet (avatar, préférences) arrive dans une prochaine sous-phase.</p>
    </PageShell>
  );
}
