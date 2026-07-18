import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — White Alpha',
  robots: { index: false, follow: false },
};

/**
 * Version minimale (Phase 8.3, requise par la case à cocher de
 * l'inscription) — la version complète, avec support dédié, est prévue à la
 * Phase 8.8 (« Déploiement privé »). Ne décrit que ce qui est réellement
 * implémenté aujourd'hui, jamais une fonctionnalité future présentée comme
 * active.
 */
export default function PrivacyPolicyPage() {
  return (
    <PageShell>
      <h1>Politique de confidentialité</h1>
      <p>
        White Alpha est une application privée, réservée aux membres autorisés. Aucune donnée n&apos;est jamais
        revendue ni partagée avec un tiers à des fins publicitaires.
      </p>
      <h2>Données collectées</h2>
      <p>Adresse email, mot de passe (jamais stocké en clair, uniquement sous forme hachée par Supabase Auth).</p>
      <h2>Hébergement</h2>
      <p>Authentification et données gérées par Supabase. Aucune clé d&apos;administration n&apos;est jamais exposée côté navigateur.</p>
      <h2>Contact</h2>
      <p>Pour toute question, contacte l&apos;administrateur de White Alpha directement.</p>
    </PageShell>
  );
}
