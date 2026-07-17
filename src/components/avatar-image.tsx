import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveWolfAvatarSource, type WolfAvatarId } from '@/constants/avatars';
import { useTheme } from '@/hooks/use-theme';

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
};

/** Avatar circulaire : photo personnalisée, sinon avatar loup prédéfini, sinon l'initiale du nom affiché (repli historique, conservé). */
export function AvatarImage({ avatarUrl, displayName, size = 44, wolfPreset, highlighted = false }: AvatarImageProps) {
  const theme = useTheme();
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };
  const ringStyle = highlighted ? { borderWidth: 2, borderColor: theme.accent } : undefined;

  const wolfSource = avatarUrl ? null : resolveWolfAvatarSource(wolfPreset);

  let content;
  if (avatarUrl) {
    content = (
      <Image
        source={{ uri: avatarUrl }}
        style={dimensionStyle}
        contentFit="cover"
        accessibilityLabel={`Photo de profil de ${displayName}`}
      />
    );
  } else if (wolfSource) {
    content = (
      <Image
        source={wolfSource}
        style={dimensionStyle}
        contentFit="cover"
        accessibilityLabel={`Avatar loup de ${displayName}`}
      />
    );
  } else {
    content = (
      <ThemedView type="backgroundElement" style={[styles.placeholder, dimensionStyle]}>
        <ThemedText type="smallBold">{displayName.charAt(0).toUpperCase()}</ThemedText>
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
