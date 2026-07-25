import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { REGISTER_COPY } from '@/lib/copy';

import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = {
  title: 'Créer un compte — White Alpha',
};

/**
 * L'inscription publique en libre-service n'existe plus depuis
 * l'introduction des codes d'invitation (Phase 8.9, migration
 * 20260723180000_invitation_codes.sql) : ce formulaire reste affiché à
 * tous, mais `handle_new_user` refuse systématiquement toute création de
 * compte sans code d'invitation valide, quel que soit le chemin
 * emprunté (cette page, un appel direct à l'API Auth...). Remplace
 * l'ancien registration-config.ts (PUBLIC_REGISTRATION_ENABLED), supprimé :
 * le code d'invitation est désormais LE mécanisme de fermeture, appliqué
 * côté serveur/base de données, jamais une condition d'affichage cliente.
 */
export default function RegisterPage() {
  return (
    <PageShell>
      <h1>{REGISTER_COPY.title}</h1>
      <p>Créez votre espace privé et sécurisé avec un code d&apos;invitation.</p>
      <RegisterForm />
    </PageShell>
  );
}
