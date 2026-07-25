import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';

import { listInvitationCodesAction } from './actions';
import { InvitationAdminClient } from './InvitationAdminClient';

export const metadata: Metadata = {
  title: "Codes d'invitation — White Alpha",
  robots: { index: false, follow: false },
};

/**
 * Défense en profondeur, même principe que MemberHomePage
 * (web/app/membre/page.tsx) : cette page ne fait elle-même AUCUNE
 * vérification owner/aal2 — la garde réelle et unique vit dans
 * `is_owner_aal2()` / `admin_list_invitation_codes` (migration
 * 20260723180000_invitation_codes.sql), jamais dupliquée ici. Un appelant
 * refusé (non owner, aal2 non franchi, ou non authentifié) reçoit le même
 * message générique que les autres actions d'administration
 * (ADMIN_ACTION_DENIED, actions.ts) — jamais de distinction affichée entre
 * ces causes.
 */
export default async function InvitationAdminPage() {
  const result = await listInvitationCodesAction();

  if (!result.ok) {
    return (
      <PageShell>
        <h1>Codes d&apos;invitation</h1>
        <p role="alert">{result.error}</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1>Codes d&apos;invitation</h1>
      <InvitationAdminClient initialInvitations={result.invitations} />
    </PageShell>
  );
}
