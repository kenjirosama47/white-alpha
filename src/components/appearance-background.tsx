/**
 * Fond d'écran par section (Accueil/Conversation/Profil) — correctif
 * d'intégration : avant ce composant, seul l'aperçu de l'écran Apparence
 * lisait `preferences.backgrounds`, les écrans réels affichaient toujours
 * une couleur unie quel que soit le fond choisi. Point de rendu unique,
 * réutilisé par les trois écrans plutôt que dupliqué.
 *
 * Correctif build 20 (A5) : `expo-image` (déjà utilisé partout ailleurs
 * dans l'app, y compris pour les mêmes URI locales `file://` de photo
 * personnelle — `appearance.tsx`, `avatar-image.tsx`) remplace
 * `ImageBackground` de React Native, qui déformait/recadrait mal certaines
 * photos personnelles. `contentFit="cover"` : jamais d'image étirée, ratio
 * toujours conservé, recadrage centré, aucune bande. Positionnement en
 * absoluteFill dans un conteneur `flex: 1` plutôt qu'un composant
 * "background + enfants" tout-en-un (`expo-image` n'en fournit pas) :
 * remplit tout l'écran de la même façon.
 *
 * Correctif build 20 (A4) : le voile de lisibilité n'est plus une valeur
 * fixe unique — `resolveOverlayOpacity` l'adapte à la palette EFFECTIVEMENT
 * appliquée (`theme.scheme`, pas `preferences.themeMode` brut). Sous
 * `forcedScheme="dark"` (écran de conversation), la palette est déjà sombre
 * par elle-même : un voile identique à celui utilisé sur un thème clair
 * (Accueil/Profil) cumulait deux couches de noir et rendait le fond choisi
 * à peine visible. Valeur plus légère en contexte sombre, inchangée en
 * contexte clair (aucune régression Accueil/Profil).
 *
 * N'affiche et ne journalise jamais l'URI/le chemin résolu.
 */
import { Image } from 'expo-image';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { resolveBackgroundSource } from '@/lib/resolve-background-source';
import type { BackgroundSlot } from '@/types/appearance';

/** Voile sur un thème clair (Accueil/Profil, inchangé depuis la version précédente) — non concerné par le correctif A4. */
const LIGHT_SCHEME_OVERLAY_OPACITY = 0.35;
/** Voile sur une palette déjà sombre (Conversation, `forcedScheme="dark"`) — allégé (correctif A4) pour ne pas cumuler deux noirs. */
const DARK_SCHEME_OVERLAY_OPACITY = 0.15;

export function resolveOverlayOpacity(scheme: 'light' | 'dark'): number {
  return scheme === 'dark' ? DARK_SCHEME_OVERLAY_OPACITY : LIGHT_SCHEME_OVERLAY_OPACITY;
}

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

  const overlayOpacity = resolveOverlayOpacity(theme.scheme);

  return (
    <View testID={testID} style={[styles.fill, style]}>
      <Image testID={testID ? `${testID}-image` : undefined} source={source} contentFit="cover" style={StyleSheet.absoluteFill} />
      <View
        testID={testID ? `${testID}-overlay` : undefined}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})` }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
