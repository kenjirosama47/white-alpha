import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { createClient } from '@/lib/supabase/server';

import { logoutAction } from './actions';

export const metadata: Metadata = {
  title: 'White Alpha',
  robots: { index: false, follow: false },
};

/**
 * Zone membre protégée — fondation temporaire (Phase 8.2). Le middleware
 * garantit déjà qu'aucun utilisateur non authentifié n'atteint cette page,
 * mais on revérifie ici en profondeur de défense (jamais une confiance
 * aveugle en une seule couche) plutôt que de supposer que `middleware.ts`
 * ne sera jamais contourné ou mal configuré à l'avenir.
 */
export default async function AppHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Défense en profondeur : ne devrait jamais arriver (middleware.ts
    // protège déjà cette route), mais si jamais le middleware était
    // contourné ou mal configuré, ne rien afficher plutôt que de faire
    // confiance à son seul passage.
    return (
      <PageShell>
        <p>Session introuvable.</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1>Bienvenue</h1>
      <p>Connecté en tant que {user.email}.</p>
      <p>
        Les conversations, la recherche et le profil arrivent dans une prochaine étape (voir Phase 8.2, section «
        premiers écrans »).
      </p>
      <form action={logoutAction}>
        <button type="submit">Se déconnecter</button>
      </form>
    </PageShell>
  );
}
