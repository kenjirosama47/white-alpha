import { createContext, useContext, type PropsWithChildren } from 'react';

import { useAppearancePreferences, type UseAppearancePreferencesResult } from '@/hooks/use-appearance-preferences';

export type AppearanceContextValue = UseAppearancePreferencesResult;

/**
 * `null` par défaut, jamais lu directement en dehors de ce fichier et de
 * `hooks/use-theme.ts` : `useTheme()` lit ce contexte via `useContext` brut
 * (pas via `useAppearanceContext` ci-dessous, qui lève une erreur hors
 * Provider) afin de rester utilisable sans Provider dans les tests de
 * composants isolés (`button.test.tsx`, `card.test.tsx`, etc. — aucun ne
 * monte `AppearanceProvider`). Un contexte absent y retombe silencieusement
 * sur `DEFAULT_APPEARANCE_PREFERENCES`, identiques à l'apparence déjà en
 * place avant cette phase (voir `constants/appearance.ts`).
 */
export const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/**
 * Monté une seule fois à la racine (`src/app/_layout.tsx`), au-dessus de
 * `AuthProvider` : disponible aussi bien pour les écrans (auth) que (app),
 * même principe qu'`MyProfileProvider`/`useMyProfile` (délègue toute la
 * logique d'état à un hook simple, ici `useAppearancePreferences`).
 */
export function AppearanceProvider({ children }: PropsWithChildren) {
  const value = useAppearancePreferences();
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/**
 * Réservé aux futurs écrans de gestion des préférences (Phase 10.3+) : lève
 * une erreur explicite hors Provider, contrairement à `useTheme()`.
 */
export function useAppearanceContext(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearanceContext doit être utilisé à l’intérieur de AppearanceProvider.');
  }
  return context;
}
