'use server';

import { MFA_CODE_GENERIC_ERROR, translateMfaError } from '@/lib/mfa-errors';
import { buildQrCodeDataUri } from '@/lib/mfa-qr';
import { createClient } from '@/lib/supabase/server';

/**
 * Contrairement aux actions d'administration des invitations
 * (`app/membre/admin/invitations/actions.ts`), aucune fonction Postgres
 * `SECURITY DEFINER` ne porte ici la garde owner : `supabase.auth.mfa.*` est
 * une API Supabase Auth générique, valable pour n'importe quel compte
 * authentifié, sans notion de rôle applicatif. La garde owner est donc
 * explicite ici, dans chaque action — jamais héritée d'un `is_owner_aal2()`
 * comme pour les invitations.
 */
const OWNER_ONLY_DENIED = 'Action réservée au propriétaire du compte.';
const OWNER_AAL2_DENIED = 'Action réservée au propriétaire du compte, avec vérification multifacteur (MFA) à jour.';
const UNEXPECTED_ERROR = 'Une erreur est survenue. Réessaie.';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function isOwner(supabase: SupabaseServerClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'owner';
}

export type EnrollMfaResult =
  | { status: 'success'; factorId: string; qrCode: string; secret: string }
  | { status: 'already_enrolled' }
  | { status: 'error'; error: string };

/**
 * Démarre l'enrôlement TOTP. Le QR code et le secret ne transitent que dans
 * cette seule réponse — jamais journalisés (`console.*`), jamais stockés
 * ailleurs que dans l'état React du client le temps de l'enrôlement (voir
 * MfaSetupClient.tsx).
 */
export async function enrollMfaAction(): Promise<EnrollMfaResult> {
  const supabase = await createClient();
  if (!(await isOwner(supabase))) {
    return { status: 'error', error: OWNER_ONLY_DENIED };
  }

  const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError || !factorsData) {
    return { status: 'error', error: UNEXPECTED_ERROR };
  }

  // `listFactors().data.totp` ne contient QUE les facteurs déjà `verified`
  // (filtré ainsi par GoTrue lui-même, voir `_listFactors` dans
  // @supabase/auth-js/GoTrueClient.js) : un simple test de présence suffit,
  // jamais besoin de revérifier `status` ici.
  if (factorsData.totp.length > 0) {
    return { status: 'already_enrolled' };
  }

  // Nettoie les tentatives précédentes non vérifiées (double-clic, onglet
  // abandonné, enrôlement recommencé) avant d'en créer une nouvelle —
  // best-effort, jamais bloquant si ce nettoyage échoue. Ces facteurs
  // n'apparaissent que dans `data.all` (jamais dans `data.totp`, réservé aux
  // facteurs déjà vérifiés).
  await Promise.all(
    factorsData.all
      .filter((factor) => factor.factor_type === 'totp' && factor.status === 'unverified')
      .map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => null)),
  );

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (error || !data) {
    return { status: 'error', error: UNEXPECTED_ERROR };
  }

  return {
    status: 'success',
    factorId: data.id,
    qrCode: buildQrCodeDataUri(data.totp.qr_code),
    secret: data.totp.secret,
  };
}

/** Annule un enrôlement en cours : désenrôle le facteur `unverified` créé par enrollMfaAction. */
export async function cancelMfaEnrollmentAction(factorId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  if (!(await isOwner(supabase))) {
    return { ok: false };
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return { ok: !error };
}

export type VerifyEnrollmentResult = { status: 'success' } | { status: 'error'; error: string };

/** Termine l'enrôlement : vérifie le code temporaire, fait passer la session à aal2. */
export async function verifyMfaEnrollmentAction(factorId: string, code: string): Promise<VerifyEnrollmentResult> {
  const supabase = await createClient();
  if (!(await isOwner(supabase))) {
    return { status: 'error', error: OWNER_ONLY_DENIED };
  }
  if (!/^\d{6}$/.test(code)) {
    return { status: 'error', error: MFA_CODE_GENERIC_ERROR };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { status: 'error', error: translateMfaError(error.message) };
  }

  return { status: 'success' };
}

export type DisableMfaResult = { status: 'success' } | { status: 'error'; error: string };

/**
 * Désactive le facteur TOTP déjà vérifié. Exige à la fois une session déjà
 * en aal2 ET un nouveau code fraîchement saisi (step-up sensible) — jamais
 * l'un sans l'autre : une session aal2 ancienne ne suffit pas seule à
 * désactiver la MFA, et un simple code seul sans session aal2 non plus.
 */
export async function disableMfaAction(code: string): Promise<DisableMfaResult> {
  const supabase = await createClient();
  if (!(await isOwner(supabase))) {
    return { status: 'error', error: OWNER_ONLY_DENIED };
  }

  const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || aalData?.currentLevel !== 'aal2') {
    return { status: 'error', error: OWNER_AAL2_DENIED };
  }

  if (!/^\d{6}$/.test(code)) {
    return { status: 'error', error: MFA_CODE_GENERIC_ERROR };
  }

  // `data.totp` ne contient que des facteurs déjà `verified` (voir
  // enrollMfaAction ci-dessus) : le premier suffit, un seul facteur TOTP
  // owner existe en pratique à la fois.
  const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
  const factor = factorsData?.totp[0];
  if (factorsError || !factor) {
    return { status: 'error', error: UNEXPECTED_ERROR };
  }

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (verifyError) {
    return { status: 'error', error: translateMfaError(verifyError.message) };
  }

  const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (unenrollError) {
    return { status: 'error', error: UNEXPECTED_ERROR };
  }

  return { status: 'success' };
}

export type MfaEnrollmentStatus = 'verified' | 'none';

/** Statut initial affiché par la page (lecture seule, jamais de mutation). */
export async function getMfaEnrollmentStatusAction(): Promise<
  { ok: true; status: MfaEnrollmentStatus } | { ok: false; error: string }
> {
  const supabase = await createClient();
  if (!(await isOwner(supabase))) {
    return { ok: false, error: OWNER_ONLY_DENIED };
  }

  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) {
    return { ok: false, error: UNEXPECTED_ERROR };
  }

  return { ok: true, status: data.totp.length > 0 ? 'verified' : 'none' };
}
