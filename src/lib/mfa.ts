import { supabase } from '@/lib/supabase';
import { describeError } from '@/utils/errors';

/**
 * Wrapper autour de `supabase.auth.mfa.*` (TOTP uniquement, Phase 5.S3).
 * Aucune nouvelle table nécessaire : Supabase Auth gère déjà l'enrôlement,
 * les facteurs et les challenges via son schéma interne (voir migration
 * `20260717150000_owner_role_and_mfa.sql`). Ce module ne journalise jamais
 * `secret`/`qr_code`/`uri`/code temporaire — ni via `console.*`, ni via une
 * erreur qui les inclurait.
 */

export type AuthenticatorLevel = 'aal1' | 'aal2';

export type MfaFactor = {
  id: string;
  createdAt: string;
};

export type MfaStatus = {
  currentLevel: AuthenticatorLevel;
  nextLevel: AuthenticatorLevel;
  /** Facteurs TOTP déjà vérifiés (jamais les facteurs `unverified` en cours d'enrôlement, absents de listFactors().totp). */
  verifiedFactors: MfaFactor[];
};

export type TotpEnrollment = {
  factorId: string;
  /** Data URI SVG prête à afficher (`expo-image`), affichée uniquement pendant l'enrôlement. */
  qrCodeDataUri: string;
  /** Secret pour saisie manuelle si le QR code est inutilisable. Jamais journalisé, jamais stocké. */
  secret: string;
};

const KNOWN_MFA_ERROR_MESSAGES: Record<string, string> = {
  'Invalid TOTP code entered': 'Code incorrect. Vérifie l\'heure de ton appareil et réessaie.',
  'Invalid one-time password': 'Code incorrect. Vérifie l\'heure de ton appareil et réessaie.',
};

/**
 * Messages connus (code incorrect, etc.) d'abord ; sinon classement
 * générique réseau/session/accès (voir utils/errors.ts), jamais le message
 * technique brut de Supabase Auth affiché tel quel.
 */
function translateMfaError(error: { message: string }): string {
  if (KNOWN_MFA_ERROR_MESSAGES[error.message]) {
    return KNOWN_MFA_ERROR_MESSAGES[error.message];
  }
  if (/security purposes|after \d+ seconds/i.test(error.message)) {
    return 'Trop de tentatives : merci de patienter quelques instants avant de réessayer.';
  }
  if (/expired/i.test(error.message)) {
    return 'Ce code a expiré. Génère-en un nouveau depuis ton application d\'authentification.';
  }
  return describeError(error);
}

function toAuthenticatorLevel(level: string | null): AuthenticatorLevel {
  return level === 'aal2' ? 'aal2' : 'aal1';
}

/** Niveau AAL courant/suivant de la session, et facteurs TOTP déjà vérifiés. */
export async function getMfaStatus(): Promise<MfaStatus> {
  const [aalResult, factorsResult] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  if (aalResult.error || !aalResult.data) {
    throw new Error(
      aalResult.error
        ? describeError(aalResult.error, 'Impossible de vérifier le niveau de sécurité de la session.')
        : 'Impossible de vérifier le niveau de sécurité de la session.',
    );
  }
  if (factorsResult.error || !factorsResult.data) {
    throw new Error(
      factorsResult.error
        ? describeError(factorsResult.error, 'Impossible de charger les facteurs de sécurité.')
        : 'Impossible de charger les facteurs de sécurité.',
    );
  }

  return {
    currentLevel: toAuthenticatorLevel(aalResult.data.currentLevel),
    nextLevel: toAuthenticatorLevel(aalResult.data.nextLevel),
    verifiedFactors: factorsResult.data.totp.map((factor) => ({
      id: factor.id,
      createdAt: factor.created_at,
    })),
  };
}

/**
 * Démarre l'enrôlement d'un facteur TOTP. Le facteur reste `unverified`
 * (absent de `getMfaStatus().verifiedFactors`) tant que
 * `verifyTotpEnrollment` n'a pas réussi.
 */
export async function enrollTotpFactor(): Promise<TotpEnrollment> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });

  if (error || !data) {
    throw new Error(
      error
        ? describeError(error, 'Impossible de démarrer l\'activation de l\'authentification multifacteur.')
        : 'Impossible de démarrer l\'activation de l\'authentification multifacteur.',
    );
  }

  return {
    factorId: data.id,
    qrCodeDataUri: `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`,
    secret: data.totp.secret,
  };
}

/**
 * Termine l'enrôlement : crée un challenge puis le vérifie avec le code
 * temporaire saisi, en un seul appel. Succès → la session passe à aal2 et le
 * facteur devient `verified`. `code` n'est jamais journalisé ni ici, ni dans
 * l'erreur retournée en cas d'échec.
 */
export async function verifyTotpEnrollment(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    throw new Error(translateMfaError(error));
  }
}

/**
 * Désactive un facteur déjà vérifié. Nécessite déjà d'être en aal2 côté
 * Supabase Auth (imposé par Supabase lui-même pour un facteur `verified`,
 * pas par ce module) : l'appelant doit s'assurer que l'utilisateur vient de
 * revérifier son facteur juste avant (voir écran Sécurité).
 */
export async function unenrollTotpFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    throw new Error(describeError(error, 'Impossible de désactiver ce facteur pour le moment.'));
  }
}
