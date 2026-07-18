'use server';

import { redirect } from 'next/navigation';

import { sanitizeRedirectPath } from '@/lib/redirect';
import { createClient } from '@/lib/supabase/server';

export type MfaChallengeState = {
  error: string | null;
};

const GENERIC_ERROR = 'Code incorrect. Réessaie.';
const DEFAULT_DESTINATION = '/membre';

/**
 * Messages connus traduits explicitement (voir `src/lib/mfa.ts`, mobile,
 * même politique) ; tout le reste retombe sur un message générique — jamais
 * le détail technique brut de Supabase Auth affiché tel quel, et jamais le
 * code saisi journalisé ni ici ni dans l'erreur retournée.
 */
function translateMfaError(message: string): string {
  if (message === 'Invalid TOTP code entered' || message === 'Invalid one-time password') {
    return GENERIC_ERROR;
  }
  if (/security purposes|after \d+ seconds/i.test(message)) {
    return 'Trop de tentatives : merci de patienter quelques instants avant de réessayer.';
  }
  if (/expired/i.test(message)) {
    return "Ce code a expiré. Génère-en un nouveau depuis ton application d'authentification.";
  }
  return GENERIC_ERROR;
}

export async function verifyMfaAction(_prevState: MfaChallengeState, formData: FormData): Promise<MfaChallengeState> {
  const code = String(formData.get('code') ?? '').trim();
  const next = sanitizeRedirectPath(String(formData.get('next') ?? ''), DEFAULT_DESTINATION);

  if (!/^\d{6}$/.test(code)) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();

  const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
  const factorId = factorsData?.totp[0]?.id;
  if (factorsError || !factorId) {
    return { error: GENERIC_ERROR };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { error: translateMfaError(error.message) };
  }

  redirect(next);
}
