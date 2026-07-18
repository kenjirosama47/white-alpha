import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { MFA_CHALLENGE_COPY } from '@/lib/copy';
import { sanitizeRedirectPath } from '@/lib/redirect';

import { MfaChallengeForm } from './MfaChallengeForm';

export const metadata: Metadata = {
  title: 'Vérification — White Alpha',
  robots: { index: false, follow: false },
};

type MfaChallengePageProps = {
  searchParams: Promise<{ next?: string }>;
};

/**
 * Atteinte uniquement pour une session déjà authentifiée à `aal1` avec un
 * facteur TOTP vérifié en attente de confirmation (voir `proxy.ts`, qui
 * redirige ici et empêche tout accès direct sans session, et redirige
 * ailleurs si aucune vérification n'est nécessaire).
 */
export default async function MfaChallengePage({ searchParams }: MfaChallengePageProps) {
  const { next } = await searchParams;

  return (
    <PageShell>
      <h1>{MFA_CHALLENGE_COPY.title}</h1>
      <p>{MFA_CHALLENGE_COPY.subtitle}</p>
      <MfaChallengeForm next={sanitizeRedirectPath(next, '/membre')} />
    </PageShell>
  );
}
