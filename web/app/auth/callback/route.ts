import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

const FAILURE_DESTINATION = '/login?reason=confirmation_failed';

/**
 * Point d'entrée unique pour tout lien Supabase Auth (confirmation
 * d'inscription, mot de passe oublié) — calqué sur `src/app/auth/callback.tsx`
 * (mobile), qui gère déjà les mêmes trois formats possibles selon la
 * configuration du projet Supabase : `code` (PKCE) ou `token_hash` + `type`
 * (OTP). Jamais de journalisation de `code`/`token_hash` (ni ici, ni dans
 * une erreur), qui sont des secrets à usage unique.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const errorParam = searchParams.get('error');
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (errorParam) {
    return NextResponse.redirect(new URL(FAILURE_DESTINATION, origin));
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(FAILURE_DESTINATION, origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return NextResponse.redirect(new URL(FAILURE_DESTINATION, origin));
  } else {
    return NextResponse.redirect(new URL(FAILURE_DESTINATION, origin));
  }

  // Une session de récupération de mot de passe (`type=recovery`) mène
  // toujours à l'écran de réinitialisation, jamais directement à la zone
  // membre, même si l'échange ci-dessus établit déjà une session valide au
  // sens de Supabase Auth (même raisonnement que le mobile, voir
  // `src/app/auth/reset-password.tsx`).
  const destination = type === 'recovery' ? '/reset-password' : '/membre';
  return NextResponse.redirect(new URL(destination, origin));
}
