import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { MEMBER_HOME_COPY } from '@/lib/copy';
import { createClient } from '@/lib/supabase/server';

import { logoutAction } from './actions';

export const metadata: Metadata = {
  title: 'White Alpha',
  robots: { index: false, follow: false },
};

/**
 * Zone membre protégée (Phase 8.2/8.3). Le middleware garantit déjà qu'aucun
 * utilisateur non authentifié — ou authentifié sans avoir franchi la
 * vérification MFA requise — n'atteint cette page, mais on revérifie ici en
 * profondeur de défense (jamais une confiance aveugle en une seule couche)
 * plutôt que de supposer que `proxy.ts` ne sera jamais contourné ou mal
 * configuré à l'avenir.
 */
export default async function MemberHomePage() {
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
      <h1>{MEMBER_HOME_COPY.welcomeTitle}</h1>
      <p>Connecté en tant que {user.email}.</p>
      <p>Les conversations, la recherche et le profil arrivent dans une prochaine sous-phase (Phase 8.4).</p>
      <form action={logoutAction}>
        <button type="submit">Se déconnecter</button>
      </form>
    </PageShell>
  );
}
