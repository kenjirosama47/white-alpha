import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { CONFIRMATION_FAILED_COPY, LOGIN_COPY, SESSION_EXPIRED_COPY } from '@/lib/copy';
import { sanitizeRedirectPath } from '@/lib/redirect';

import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Se connecter — White Alpha',
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, reason } = await searchParams;

  return (
    <PageShell>
      <h1>{LOGIN_COPY.title}</h1>
      {reason === 'expired' && <p role="status">{SESSION_EXPIRED_COPY.message}</p>}
      {reason === 'confirmation_failed' && <p role="alert">{CONFIRMATION_FAILED_COPY.message}</p>}
      <LoginForm next={sanitizeRedirectPath(next, '/membre')} />
    </PageShell>
  );
}
