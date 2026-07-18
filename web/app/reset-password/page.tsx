import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { RESET_PASSWORD_COPY } from '@/lib/copy';

import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Nouveau mot de passe — White Alpha',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <PageShell>
      <h1>{RESET_PASSWORD_COPY.title}</h1>
      <p>{RESET_PASSWORD_COPY.subtitle}</p>
      <ResetPasswordForm />
    </PageShell>
  );
}
