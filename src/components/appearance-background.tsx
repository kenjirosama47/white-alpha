/**
 * Fond d'écran par section (Accueil/Conversation/Profil) — correctif
 * d'intégration : avant ce composant, seul l'aperçu de l'écran Apparence
 * lisait `preferences.backgrounds`, les écrans réels affichaient toujours
 * une couleur unie quel que soit le fond choisi. Point de rendu unique,
 * réutilisé par les trois écrans plutôt que dupliqué.
 *
 * `resizeMode="cover"` : jamais d'image étirée/déformée. Un voile sombre
 * fixe (pas lié à `darkenLevel`, actuellement sans réglage UI et à 0 par
 * défaut) s'applique automatiquement dès qu'un fond personnalisé est actif,
 * pour garantir la lisibilité du contenu sans dépendre d'un réglage que
 * l'utilisateur ne peut pas encore ajuster.
 *
 * N'affiche et ne journalise jamais l'URI/le chemin résolu.
 */
import type { PropsWithChildren } from 'react';
import { ImageBackground, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { resolveBackgroundSource } from '@/lib/resolve-background-source';
import type { BackgroundSlot } from '@/types/appearance';

/** Opacité fixe du voile de lisibilité posé sur un fond personnalisé (catalogue ou photo). */
const READABILITY_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.35)';

type AppearanceBackgroundProps = PropsWithChildren<{
  slot: BackgroundSlot;
  /** Impose une palette indépendamment du thème système, voir `useTheme`/`ThemedView` — utilisé par l'écran de conversation (toujours sombre). */
  forcedScheme?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function AppearanceBackground({ slot, forcedScheme, style, testID, children }: AppearanceBackgroundProps) {
  const theme = useTheme(forcedScheme);
  const background = theme.preferences.backgrounds[slot];
  const source = resolveBackgroundSource(background);

  if (!source) {
    return (
      <View testID={testID} style={[styles.fill, { backgroundColor: theme.background }, style]}>
        {children}
      </View>
    );
  }

  return (
    <ImageBackground testID={testID} source={source} resizeMode="cover" style={[styles.fill, style]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: READABILITY_OVERLAY_COLOR }]} />
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
