import { useCallback, useEffect, useState } from 'react';

import { getMyProfile, type MyProfile } from '@/services/profiles';

type UseMyProfileResult = {
  profile: MyProfile | null;
  isLoading: boolean;
  error: string | null;
  /** Relance le chargement après une erreur (bouton « Réessayer »). */
  refresh: () => void;
  /** Met à jour l'état local sans re-fetch, après une modification déjà confirmée par la RPC. */
  setProfile: (profile: MyProfile) => void;
};

/** Profil de l'utilisateur connecté (écran Profil). Même structure chargement/erreur/retry que use-conversations.ts. */
export function useMyProfile(): UseMyProfileResult {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Aucun setState synchrone dans le corps de la fonction : tout passe par
  // .then/.catch/.finally (même principe que use-conversations.ts).
  const load = useCallback(() => {
    getMyProfile()
      .then((result) => {
        setProfile(result);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Appelée depuis un gestionnaire d'événement (bouton « Réessayer »), jamais
  // depuis un effet : la remise à zéro synchrone de l'état y est sûre.
  const refresh = useCallback(() => {
    setIsLoading(true);
    setError(null);
    load();
  }, [load]);

  return { profile, isLoading, error, refresh, setProfile };
}
