'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/**
 * Déconnexion (Phase 8.2) : `signOut()` révoque la session côté Supabase et
 * déclenche la suppression des cookies de session via le mécanisme
 * `onAuthStateChange` déjà câblé dans `lib/supabase/server.ts`
 * (`createServerClient`, événement `SIGNED_OUT`) — aucune suppression
 * manuelle de cookie nécessaire ici.
 */
export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
