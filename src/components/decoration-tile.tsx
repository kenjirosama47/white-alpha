import { Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { getDecorationLabel, resolveDecorationSource, type DecorationId } from '@/constants/decorations';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type DecorationTileProps = {
  id: DecorationId;
  width?: number;
  height?: number;
};

/**
 * Vignette d'une décoration de fond (galerie de sélection, Phase 10.4).
 * Tant que l'image n'est pas résolue (`resolveDecorationSource`), retombe
 * sur un repli neutre — carte + libellé — jamais une erreur de bundling
 * sur un asset manquant (même principe que `WolfAvatarTile`).
 */
export function DecorationTile({ id, width = 96, height = 96 }: DecorationTileProps) {
  const theme = useTheme();
  const label = getDecorationLabel(id);
  const source = resolveDecorationSource(id);
  const dimensionStyle = { width, height, borderRadius: Radius.md };

  if (source) {
    return (
      <Image
        source={source}
        style={[dimensionStyle, styles.image]}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    );
  }

  return (
    <View style={[styles.fallback, dimensionStyle, { backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2} style={styles.fallbackLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    overflow: 'hidden',
  },
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
