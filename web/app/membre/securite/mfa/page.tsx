import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';

import { getMfaEnrollmentStatusAction } from './actions';
import { MfaSetupClient } from './MfaSetupClient';

export const metadata: Metadata = {
  title: 'Sécurité — White Alpha',
  robots: { index: false, follow: false },
};

/**
 * Défense en profondeur, même principe que MemberHomePage et
 * InvitationAdminPage : cette page ne fait elle-même aucune vérification
 * owner — la garde réelle vit dans `getMfaEnrollmentStatusAction` (et
 * chaque action de `actions.ts`), jamais dupliquée ici. Volontairement
 * accessible en aal1 (pas de vérification MFA préalable exigée) : c'est
 * justement le parcours qui permet au propriétaire d'activer la MFA pour la
 * première fois — voir `proxy.ts`, aucune redirection vers
 * `/verification-mfa` tant qu'aucun facteur vérifié n'existe.
 */
export default async function MfaSetupPage() {
  const result = await getMfaEnrollmentStatusAction();

  if (!result.ok) {
    return (
      <PageShell>
        <h1>Sécurité du compte</h1>
        <p role="alert">{result.error}</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1>Sécurité du compte</h1>
      <MfaSetupClient initialStatus={result.status} />
    </PageShell>
  );
}
