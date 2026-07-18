import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { WolfAvatarId } from '@/constants/avatars';
import { useTheme } from '@/hooks/use-theme';
import { resolveAvatarDisplay } from '@/utils/avatar-resolution';

type AvatarImageProps = {
  avatarUrl: string | null;
  /** Utilisé pour l'initiale de repli quand ni `avatarUrl` ni `wolfPreset` (une fois les images ajoutées, Phase 7.2/7.5) ne sont disponibles. */
  displayName: string;
  size?: number;
  /**
   * Avatar loup prédéfini (Phase 7.1 : architecture uniquement, voir
   * `constants/avatars.ts` — aucune image définitive pour l'instant, retombe
   * silencieusement sur l'initiale tant que le catalogue n'est pas rempli).
   * Ignoré si `avatarUrl` est défini : une photo personnalisée reste
   * toujours prioritaire sur un préréglage.
   */
  wolfPreset?: WolfAvatarId | null;
  /** Anneau de mise en avant (ex. avatar du propriétaire) — jamais utilisé pour le logo lui-même. */
  highlighted?: boolean;
  /** Impose une palette indépendamment du thème système (Anomalie 2, build 16) — voir `useTheme`. */
  forcedScheme?: 'light' | 'dark';
};

/**
 * Avatar circulaire : photo personnalisée si `avatarUrl` est réellement
 * valide, sinon avatar loup prédéfini, sinon l'initiale du nom affiché
 * (repli final). Résolution centralisée dans `resolveAvatarDisplay` (Anomalie
 * 1, build 16) : une avatarUrl vide/"null"/"undefined"/invalide ne bloque
 * jamais l'affichage de `wolfPreset` — ce composant est le seul point de
 * résolution de l'avatar dans toute l'app, aucun écran ne doit réimplémenter
 * cette logique.
 */
export function AvatarImage({
  avatarUrl,
  displayName,
  size = 44,
  wolfPreset,
  highlighted = false,
  forcedScheme,
}: AvatarImageProps) {
  const theme = useTheme(forcedScheme);
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };
  const ringStyle = highlighted ? { borderWidth: 2, borderColor: theme.accent } : undefined;

  const display = resolveAvatarDisplay(avatarUrl, wolfPreset);

  let content;
  if (display.kind === 'photo') {
    content = (
      <Image
        source={{ uri: display.uri }}
        style={dimensionStyle}
        contentFit="cover"
        accessibilityLabel={`Photo de profil de ${displayName}`}
      />
    );
  } else if (display.kind === 'wolf') {
    content = (
      <Image
        source={display.source}
        style={dimensionStyle}
        contentFit="cover"
        accessibilityLabel={`Avatar loup de ${displayName}`}
      />
    );
  } else {
    content = (
      <ThemedView type="backgroundElement" forcedScheme={forcedScheme} style={[styles.placeholder, dimensionStyle]}>
        <ThemedText type="smallBold" forcedScheme={forcedScheme}>
          {displayName.charAt(0).toUpperCase()}
        </ThemedText>
      </ThemedView>
    );
  }

  if (!highlighted) return content;

  return <View style={[styles.ring, { borderRadius: size / 2 + 2 }, ringStyle]}>{content}</View>;
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    padding: 2,
  },
});
