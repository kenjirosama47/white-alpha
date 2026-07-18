import Link from 'next/link';
import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';

import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Mot de passe oublié — White Alpha',
};

export default function ForgotPasswordPage() {
  return (
    <PageShell>
      <h1>Mot de passe oublié</h1>
      <ForgotPasswordForm />
      <Link href="/login">Retour à la connexion</Link>
    </PageShell>
  );
}
