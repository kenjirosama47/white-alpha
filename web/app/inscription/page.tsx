import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '@/components/PageShell';
import { REGISTER_COPY, REGISTRATION_CLOSED_COPY } from '@/lib/copy';
import { PUBLIC_REGISTRATION_ENABLED } from '@/lib/registration-config';

import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = {
  title: 'Créer un compte — White Alpha',
};

/**
 * Rendu entièrement côté serveur (composant serveur, Phase 8) : quand
 * l'inscription publique est désactivée, `RegisterForm` n'est jamais inclus
 * dans le HTML envoyé au navigateur — un visiteur sans JavaScript actif (ou
 * l'ayant désactivé) ne voit jamais de formulaire fonctionnel non plus.
 * `registerAction` refuse en plus toute soumission directe (défense en
 * profondeur, voir actions.ts) : cette page n'est pas l'unique protection.
 */
export default function RegisterPage() {
  if (!PUBLIC_REGISTRATION_ENABLED) {
    return (
      <PageShell>
        <h1>{REGISTRATION_CLOSED_COPY.title}</h1>
        <p>{REGISTRATION_CLOSED_COPY.message}</p>
        <Link href="/login">Se connecter</Link>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1>{REGISTER_COPY.title}</h1>
      <p>Créez votre espace privé et sécurisé.</p>
      <RegisterForm />
    </PageShell>
  );
}
