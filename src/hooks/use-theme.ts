/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useContext } from 'react';

import { DEFAULT_APPEARANCE_PREFERENCES } from '@/constants/appearance';
import { Colors, type ThemeColor } from '@/constants/theme';
import { AppearanceContext } from '@/contexts/appearance-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { AppearancePreferences } from '@/types/appearance';

/**
 * `Record<ThemeColor, string>` plutôt que `typeof Colors.light`/`typeof
 * Colors.dark` : ces deux palettes ont chacune des littéraux de couleur
 * figés distincts (`as const`), incompatibles entre eux au niveau du type ;
 * `scheme` n'est connu qu'à l'exécution (système, `forcedScheme` ou
 * préférence utilisateur), donc le type de retour doit accepter l'une ou
 * l'autre — `accent` en particulier n'est plus un littéral figé du tout
 * puisqu'il reflète désormais `preferences.accentColor` (Phase 10.2).
 */
export type Theme = Record<ThemeColor, string> & {
  /** Couleur des boutons pleins (variante `primary` de `Button`) — voir `constants/appearance.ts`. */
  buttonColor: string;
  bubbleSentColor: string;
  bubbleReceivedColor: string;
  /** Multiplicateur appliqué par `ThemedText` sur les variantes `Typography` (1 = taille par défaut inchangée). */
  textScale: number;
  /** Préférences complètes ayant produit ce thème (Phase 10.2) — réservées à un futur écran Apparence (Phase 10.3+), aucun autre appelant ne doit en dépendre. */
  preferences: AppearancePreferences;
};

/**
 * `forcedScheme` (Anomalie 2, build 16) : impose la PALETTE (fond, surface,
 * texte, bordure) indépendamment du thème système et du choix utilisateur,
 * réservé à l'environnement de discussion (toujours sombre, choix de
 * direction visuelle délibéré — voir conversation/[id].tsx,
 * message-bubble.tsx, date-separator.tsx). Les couleurs personnalisées
 * (accent, boutons, bulles) restent toujours appliquées même sous
 * `forcedScheme` : ce sont deux axes indépendants (palette de fond imposée
 * vs couleurs choisies par l'utilisateur), voir PLAN.md Phase 10 — Décision
 * d'architecture, point 3.
 *
 * Lit `AppearanceContext` via `useContext` brut (jamais `useAppearanceContext`,
 * qui lève une erreur hors Provider) : reste utilisable sans Provider dans
 * les tests de composants isolés (`button.test.tsx`, `card.test.tsx`, etc.,
 * aucun ne monte `AppearanceProvider`), en retombant silencieusement sur
 * `DEFAULT_APPEARANCE_PREFERENCES` — identiques à l'apparence déjà en place
 * avant cette phase, donc aucune régression sur ces tests ni sur l'apparence
 * par défaut de l'app.
 */
export function useTheme(forcedScheme?: 'light' | 'dark'): Theme {
  const systemScheme = useColorScheme();
  const appearance = useContext(AppearanceContext);
  const preferences = appearance?.preferences ?? DEFAULT_APPEARANCE_PREFERENCES;

  const systemDerivedScheme = systemScheme === 'unspecified' ? 'light' : systemScheme;
  const scheme = forcedScheme ?? (preferences.themeMode === 'system' ? systemDerivedScheme : preferences.themeMode);

  return {
    ...Colors[scheme],
    accent: preferences.accentColor,
    buttonColor: preferences.buttonColor,
    bubbleSentColor: preferences.bubbleSentColor,
    bubbleReceivedColor: preferences.bubbleReceivedColor,
    textScale: preferences.textScale,
    preferences,
  };
}
