import Link from 'next/link';
import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { RECOVERY_LINK_EXPIRED_COPY } from '@/lib/copy';

import { ForgotPasswordForm } from './ForgotPasswordForm';
import { SanitizeRecoveryUrl } from './SanitizeRecoveryUrl';

export const metadata: Metadata = {
  title: 'Mot de passe oublié — White Alpha',
};

type ForgotPasswordPageProps = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const { reason } = await searchParams;

  return (
    <PageShell>
      {/* Filet de sécurité client : voir SanitizeRecoveryUrl.tsx — /auth/callback
          construit déjà une redirection propre (reason=link_expired uniquement),
          ce composant ne fait que nettoyer l'URL affichée si un paramètre
          Supabase brut y traînait malgré tout (aléa de réacheminement). */}
      <SanitizeRecoveryUrl />
      <h1>Mot de passe oublié</h1>
      {reason === 'link_expired' && <p role="alert">{RECOVERY_LINK_EXPIRED_COPY.message}</p>}
      <ForgotPasswordForm />
      <Link href="/login">Retour à la connexion</Link>
    </PageShell>
  );
}
