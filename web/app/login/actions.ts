'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export type LoginState = {
  error: string | null;
};

const GENERIC_ERROR = 'Email ou mot de passe incorrect.';

/**
 * Server Action (Phase 8.2) : s'exécute exclusivement côté serveur, jamais
 * dans le navigateur. Next.js vérifie automatiquement l'en-tête Origin des
 * requêtes qui invoquent une Server Action (protection CSRF intégrée au
 * framework, aucune implémentation manuelle de jeton nécessaire ici — voir
 * la documentation "Server Actions Security").
 */
export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/app');

  if (!email || !password) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Message générique uniquement : ne jamais révéler si l'email existe ou
    // non, ni le détail technique Supabase brut.
    return { error: GENERIC_ERROR };
  }

  redirect(next.startsWith('/') ? next : '/app');
}
