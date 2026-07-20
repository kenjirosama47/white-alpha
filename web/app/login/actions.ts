'use server';

import { redirect } from 'next/navigation';

import { logAuthDiagnostic } from '@/lib/auth-diagnostics';
import { sanitizeRedirectPath } from '@/lib/redirect';
import { createClient } from '@/lib/supabase/server';

export type LoginState = {
  error: string | null;
};

const GENERIC_ERROR = 'Email ou mot de passe incorrect.';
const DEFAULT_DESTINATION = '/membre';

/**
 * Server Action (Phase 8.2/8.3) : s'exécute exclusivement côté serveur,
 * jamais dans le navigateur. Next.js vérifie automatiquement l'en-tête
 * Origin des requêtes qui invoquent une Server Action (protection CSRF
 * intégrée au framework, aucune implémentation manuelle de jeton nécessaire
 * ici — voir la documentation "Server Actions Security").
 */
export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = sanitizeRedirectPath(String(formData.get('next') ?? ''), DEFAULT_DESTINATION);

  if (!email || !password) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Diagnostic serveur temporaire (voir lib/auth-diagnostics.ts) : catégorie
    // Supabase (ex. "email_not_confirmed", "invalid_credentials") et statut
    // HTTP uniquement, jamais l'email/mot de passe saisis. Message générique
    // ci-dessous inchangé : ne casse jamais l'anti-énumération.
    logAuthDiagnostic('login', error.code ?? 'unknown_error', error.status);
    // Message générique uniquement : ne jamais révéler si l'email existe ou
    // non, ni le détail technique Supabase brut.
    return { error: GENERIC_ERROR };
  }

  // Détection du niveau AAL (Phase 8.3) : un facteur TOTP vérifié existant
  // pour ce compte place `nextLevel` à `aal2` alors que cette session
  // fraîchement ouverte reste à `aal1` tant qu'elle n'a pas été
  // explicitement vérifiée — jamais d'accès direct aux pages protégées dans
  // ce cas, toujours un passage par l'écran de vérification.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.currentLevel !== aal.nextLevel) {
    const params = new URLSearchParams({ next });
    redirect(`/verification-mfa?${params.toString()}`);
  }

  redirect(next);
}
