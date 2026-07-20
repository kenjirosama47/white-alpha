import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

const SIGNUP_FAILURE_DESTINATION = '/login?reason=confirmation_failed';
const RECOVERY_FAILURE_DESTINATION = '/forgot-password?reason=link_expired';

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
  // `next` vient exclusivement de notre propre construction de `redirectTo`
  // (voir `app/forgot-password/actions.ts`) — jamais une valeur arbitraire
  // acceptée depuis l'extérieur : seule la valeur fixe `/reset-password` est
  // reconnue ci-dessous, jamais utilisée telle quelle comme cible de
  // redirection. Nécessaire car Supabase ne réachemine pas toujours `type`
  // dans sa redirection d'erreur (« error », « error_code », détail texte
  // brut), seul `redirectTo` (et donc ce paramètre) est garanti de survivre
  // à l'échec comme au succès.
  const isRecoveryFlow = type === 'recovery' || searchParams.get('next') === '/reset-password';

  if (errorParam) {
    // Ne jamais faire figurer le détail brut renvoyé par Supabase (code
    // d'erreur, texte explicatif) dans l'URL finale : uniquement l'une de
    // ces deux cibles fixes, jamais un gabarit interpolé avec la valeur reçue.
    const destination = isRecoveryFlow ? RECOVERY_FAILURE_DESTINATION : SIGNUP_FAILURE_DESTINATION;
    return NextResponse.redirect(new URL(destination, origin));
  }

  const supabase = await createClient();
  const failureDestination = isRecoveryFlow ? RECOVERY_FAILURE_DESTINATION : SIGNUP_FAILURE_DESTINATION;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(failureDestination, origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return NextResponse.redirect(new URL(failureDestination, origin));
  } else {
    return NextResponse.redirect(new URL(failureDestination, origin));
  }

  // Une session de récupération de mot de passe mène toujours à l'écran de
  // réinitialisation, jamais directement à la zone membre — même si
  // l'échange ci-dessus établit déjà une session valide au sens de Supabase
  // Auth (même raisonnement que le mobile, voir
  // `src/app/auth/reset-password.tsx`), et même si l'utilisateur possédait
  // déjà une session active avant de cliquer ce lien (jamais /membre comme
  // repli pendant ce parcours, voir aussi proxy.ts).
  const destination = isRecoveryFlow ? '/reset-password' : '/membre';
  return NextResponse.redirect(new URL(destination, origin));
}
