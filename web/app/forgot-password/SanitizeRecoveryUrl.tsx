'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Paramètres qu'un lien de récupération Supabase peut faire atterrir ici
// (directement, ou via un aléa de réacheminement — voir la note détaillée
// dans app/auth/callback/route.ts) : jamais laissés dans la barre d'adresse,
// même si /auth/callback les a déjà filtrés avant de rediriger ici. Filet de
// sécurité côté client, purement cosmétique (history.replaceState via
// router.replace, aucun rechargement) — la protection réelle (jamais de
// détail brut utilisé pour une décision, jamais journalisé) reste côté
// serveur dans /auth/callback.
const FORBIDDEN_PARAMS = ['error', 'error_code', 'error_description', 'token', 'token_hash', 'code', 'type'];

/** Ne rend rien : nettoie uniquement l'URL affichée si un paramètre interdit y traîne encore. */
export function SanitizeRecoveryUrl() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const hasForbiddenParam = FORBIDDEN_PARAMS.some((param) => searchParams.has(param));
    if (!hasForbiddenParam) return;

    const reason = searchParams.get('reason');
    const clean = reason ? `/forgot-password?reason=${encodeURIComponent(reason)}` : '/forgot-password';
    router.replace(clean);
  }, [searchParams, router]);

  return null;
}
