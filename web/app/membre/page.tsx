import Link from 'next/link';
import type { Metadata } from 'next';

import { Button } from '@/components/Button';
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

  // Jamais l'email complet à l'écran (voir anomalie Phase 8.4) : seul le
  // pseudonyme public, déjà utilisé partout ailleurs dans l'app (recherche,
  // conversations) — `profiles` est RLS-protégée, une ligne uniquement pour
  // l'utilisateur courant ici.
  const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
  const displayName = profile?.username ?? MEMBER_HOME_COPY.fallbackName;

  return (
    <PageShell>
      <h1>{MEMBER_HOME_COPY.welcomeTitle}</h1>
      <p>Connecté en tant que {displayName}.</p>
      <Button href="/conversations" variant="primary">
        Voir mes conversations
      </Button>
      <p>Le profil complet arrive dans une prochaine sous-phase.</p>
      <form action={logoutAction}>
        <button type="submit">Se déconnecter</button>
      </form>
      <Link href="/profil">Profil</Link>
    </PageShell>
  );
}
