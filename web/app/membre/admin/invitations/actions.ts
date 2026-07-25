'use server';

// Un fichier "use server" ne peut exporter que des fonctions asynchrones
// (types compris, effacés à la compilation) — jamais une constante/valeur
// (voir la note dans web/app/inscription/RegisterForm.tsx, cause déjà
// rencontrée d'une erreur d'inscription silencieuse). L'état initial du
// formulaire de génération vit donc dans InvitationAdminClient.tsx, jamais
// ici.

import { createClient } from '@/lib/supabase/server';

export type InvitationStatus = 'active' | 'used' | 'expired' | 'revoked';

export type InvitationRow = {
  id: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedByUsername: string | null;
  revokedAt: string | null;
  maxUses: number;
  useCount: number;
  note: string | null;
};

/**
 * Message générique unique pour toute action d'administration refusée —
 * qu'elle échoue parce que l'appelant n'est pas owner, parce que le niveau
 * MFA (aal2) n'est pas atteint, ou pour toute autre raison serveur : jamais
 * de distinction ici (voir is_owner_aal2(), migration 20260723180000), pour
 * ne jamais laisser deviner laquelle de ces conditions manque.
 */
const ADMIN_ACTION_DENIED = 'Action réservée au propriétaire du compte, avec vérification multifacteur (MFA) à jour.';

type RawInvitationRow = {
  id: string;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_username: string | null;
  revoked_at: string | null;
  max_uses: number;
  use_count: number;
  note: string | null;
};

function mapRow(row: RawInvitationRow): InvitationRow {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedByUsername: row.used_by_username,
    revokedAt: row.revoked_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    note: row.note,
  };
}

export type ListInvitationsResult = { ok: true; invitations: InvitationRow[] } | { ok: false; error: string };

export async function listInvitationCodesAction(): Promise<ListInvitationsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_list_invitation_codes');

  if (error) {
    return { ok: false, error: ADMIN_ACTION_DENIED };
  }

  return { ok: true, invitations: ((data ?? []) as RawInvitationRow[]).map(mapRow) };
}

// `export type` uniquement : les types s'effacent à la compilation, jamais
// une valeur (voir la note en tête de fichier sur les fichiers "use server").
export type GenerateInvitationState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'success'; code: string; expiresAt: string; maxUses: number };

export async function generateInvitationCodeAction(
  _prevState: GenerateInvitationState,
  formData: FormData,
): Promise<GenerateInvitationState> {
  const supabase = await createClient();

  const expiresInDays = Number(formData.get('expiresInDays'));
  const maxUses = Number(formData.get('maxUses'));
  const noteRaw = String(formData.get('note') ?? '').trim();

  const { data, error } = await supabase.rpc('admin_create_invitation_code', {
    p_expires_in_days: Number.isFinite(expiresInDays) ? expiresInDays : 7,
    p_max_uses: Number.isFinite(maxUses) ? maxUses : 1,
    p_note: noteRaw.length > 0 ? noteRaw : null,
  });

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    return { status: 'error', error: ADMIN_ACTION_DENIED };
  }

  // Le code brut ne transite qu'ici, dans cette seule réponse — jamais
  // stocké, jamais rejournalisé, jamais renvoyé par listInvitationCodesAction.
  return { status: 'success', code: row.code, expiresAt: row.expires_at, maxUses: row.max_uses };
}

export async function revokeInvitationCodeAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_revoke_invitation_code', { p_id: id });

  if (error) {
    return { ok: false, error: ADMIN_ACTION_DENIED };
  }

  return { ok: true };
}
