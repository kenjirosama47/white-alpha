import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { RESET_PASSWORD_COPY } from '@/lib/copy';
import { createClient } from '@/lib/supabase/server';

import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Nouveau mot de passe — White Alpha',
  robots: { index: false, follow: false },
};

/**
 * Le formulaire ne doit jamais s'afficher sans session de récupération
 * valide (Phase 8.4) — revérifié ici en profondeur de défense, même si
 * `/auth/callback` est censé être l'unique point d'entrée légitime. Session
 * absente/expirée/incorrecte : jamais /membre en repli, toujours
 * /forgot-password?reason=link_expired (même destination que le callback,
 * même message générique).
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/forgot-password?reason=link_expired');
  }

  return (
    <PageShell>
      <h1>{RESET_PASSWORD_COPY.title}</h1>
      <p>{RESET_PASSWORD_COPY.subtitle}</p>
      <ResetPasswordForm />
    </PageShell>
  );
}
