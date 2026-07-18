import Link from 'next/link';
import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';

import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Se connecter — White Alpha',
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;

  return (
    <PageShell>
      <h1>Se connecter</h1>
      <LoginForm next={next && next.startsWith('/') ? next : '/app'} />
      <Link href="/forgot-password">Mot de passe oublié ?</Link>
    </PageShell>
  );
}
