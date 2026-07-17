import { Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { getWolfAvatarLabel, resolveWolfAvatarSource, type WolfAvatarId } from '@/constants/avatars';
import { useTheme } from '@/hooks/use-theme';

type WolfAvatarTileProps = {
  id: WolfAvatarId;
  size?: number;
};

/**
 * Vignette d'un avatar loup (galerie de sélection, Phase 7.5). Tant que
 * l'image définitive n'est pas ajoutée à `WOLF_AVATAR_SOURCES`
 * (`constants/avatars.ts`), retombe sur un repli neutre — cercle + nom du
 * loup — RIGOUREUSEMENT IDENTIQUE en développement et en Release (aucun
 * élément visuel n'est ajouté ou retiré selon `__DEV__`) : ce repli n'est pas
 * un « placeholder » au sens d'un visuel provisoire qui imiterait une future
 * image, c'est le même traitement texte-seul déjà utilisé partout ailleurs
 * dans l'app quand aucune image n'est disponible (voir `AvatarImage`). Rien
 * ne peut donc « fuiter » dans un build Release au-delà de ce qui y est déjà
 * légitimement présent. La garde réelle contre un Release incomplet est
 * `scripts/avatar-assets-guard.js` (`npm run check:avatars`), à exécuter et
 * faire passer avant toute création d'APK Release.
 */
export function WolfAvatarTile({ id, size = 88 }: WolfAvatarTileProps) {
  const theme = useTheme();
  const label = getWolfAvatarLabel(id);
  const source = resolveWolfAvatarSource(id);
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (source) {
    return (
      <Image
        source={source}
        style={dimensionStyle}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    );
  }

  return (
    <View
      style={[styles.fallback, dimensionStyle, { backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2} style={styles.fallbackLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 4,
  },
  fallbackLabel: {
    textAlign: 'center',
  },
});
