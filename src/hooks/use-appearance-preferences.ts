import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_APPEARANCE_PREFERENCES } from '@/constants/appearance';
import { getAppearancePreferences, resetAppearancePreferences, saveAppearancePreferences } from '@/lib/appearance-storage';
import type { AppearancePreferences } from '@/types/appearance';

export type UseAppearancePreferencesResult = {
  preferences: AppearancePreferences;
  /** `true` tant que la lecture initiale du stockage local n'est pas terminée — voir le gate du splash dans `src/app/_layout.tsx` (aucun flash visuel). */
  isLoading: boolean;
  updatePreferences: (partial: Partial<AppearancePreferences>) => Promise<void>;
  resetPreferences: () => Promise<void>;
};

/**
 * Charge les préférences d'apparence locales au démarrage. Même structure
 * chargement/état que `use-my-profile.ts`, à ceci près que `getAppearancePreferences`
 * (voir `lib/appearance-storage.ts`) ne lève jamais d'erreur : un stockage
 * absent ou corrompu y retombe déjà sur `DEFAULT_APPEARANCE_PREFERENCES`
 * avant même d'arriver ici. Cette même valeur par défaut est aussi l'état
 * initial synchrone ci-dessous, et reproduit l'apparence déjà en place avant
 * cette phase à l'identique — aucun flash visuel n'est donc possible tant
 * qu'aucune préférence non par défaut n'a jamais été enregistrée.
 */
export function useAppearancePreferences(): UseAppearancePreferencesResult {
  const [preferences, setPreferences] = useState<AppearancePreferences>(DEFAULT_APPEARANCE_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAppearancePreferences().then((loaded) => {
      if (cancelled) return;
      setPreferences(loaded);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Écriture optimiste : l'état local change immédiatement (aperçu instantané
  // pour un futur écran Apparence, Phase 10.3), la persistance locale suit en
  // arrière-plan. Aucun réseau impliqué (contrairement aux éditeurs de profil
  // qui passent par une RPC Supabase) : un échec ne peut venir que du
  // stockage local lui-même, propagé tel quel à l'appelant.
  const updatePreferences = useCallback(
    async (partial: Partial<AppearancePreferences>) => {
      const next = { ...preferences, ...partial };
      setPreferences(next);
      await saveAppearancePreferences(next);
    },
    [preferences],
  );

  const resetPreferences = useCallback(async () => {
    const defaults = await resetAppearancePreferences();
    setPreferences(defaults);
  }, []);

  return { preferences, isLoading, updatePreferences, resetPreferences };
}
