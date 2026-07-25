'use server';

import { redirect } from 'next/navigation';

import { MFA_CODE_GENERIC_ERROR as GENERIC_ERROR, translateMfaError } from '@/lib/mfa-errors';
import { sanitizeRedirectPath } from '@/lib/redirect';
import { createClient } from '@/lib/supabase/server';

export type MfaChallengeState = {
  error: string | null;
};

const DEFAULT_DESTINATION = '/membre';

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
