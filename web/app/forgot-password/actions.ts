'use server';

import { getAuthCallbackUrl } from '@/lib/site-url';
import { createClient } from '@/lib/supabase/server';

export type ForgotPasswordState = {
  /** Toujours le même message de succès générique, qu'un compte existe ou non pour cet email (jamais une confirmation d'existence de compte) — même politique que l'app mobile (`auth-context.tsx`). */
  submitted: boolean;
};

export async function forgotPasswordAction(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get('email') ?? '').trim();

  if (email) {
    const supabase = await createClient();
    // Erreur volontairement ignorée : le message affiché à l'utilisateur
    // reste identique dans tous les cas (voir ForgotPasswordState.submitted).
    // Passe par /auth/callback (jamais directement /reset-password) — même
    // point d'entrée unique que la confirmation d'inscription, seul capable
    // de gérer les trois formats de lien possibles selon la configuration
    // Supabase (voir `app/auth/callback/route.ts`, calqué sur le mobile
    // `src/app/auth/callback.tsx`). Le paramètre `next=/reset-password`
    // ci-dessous est le seul moyen fiable de distinguer un échec de
    // récupération d'un échec de confirmation d'inscription au niveau du
    // callback (Phase 8.4) : Supabase ne réachemine pas systématiquement
    // `type` dans sa redirection d'erreur (`error`/`error_code`), mais
    // réachemine toujours l'intégralité de la chaîne `redirectTo` fournie
    // ici, y compris ce paramètre.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAuthCallbackUrl()}?next=/reset-password`,
    });
  }

  return { submitted: true };
}
