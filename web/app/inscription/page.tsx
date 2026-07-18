import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { REGISTER_COPY } from '@/lib/copy';

import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = {
  title: 'Créer un compte — White Alpha',
};

export default function RegisterPage() {
  return (
    <PageShell>
      <h1>{REGISTER_COPY.title}</h1>
      <p>Créez votre espace privé et sécurisé.</p>
      <RegisterForm />
    </PageShell>
  );
}
