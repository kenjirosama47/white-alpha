/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * `forcedScheme` (Anomalie 2, build 16) : impose une palette indépendamment
 * du thème système, réservé à l'environnement de discussion (toujours
 * sombre, choix de direction visuelle délibéré — voir conversation/[id].tsx,
 * message-bubble.tsx, date-separator.tsx). `useColorScheme` reste toujours
 * appelé (règle des Hooks), même quand sa valeur n'est pas utilisée.
 */
export function useTheme(forcedScheme?: 'light' | 'dark') {
  const systemScheme = useColorScheme();
  if (forcedScheme) {
    return Colors[forcedScheme];
  }
  const scheme = systemScheme === 'unspecified' ? 'light' : systemScheme;
  return Colors[scheme];
}
