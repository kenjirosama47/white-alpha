import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type DateSeparatorProps = {
  label: string;
};

/**
 * Séparateur discret entre deux jours de messages (écran de discussion,
 * Phase 7.4) — purement visuel, dérivé de `createdAt`. `forcedScheme="dark"` :
 * l'environnement de discussion impose la palette sombre indépendamment du
 * thème système (Anomalie 2, build 16).
 */
export function DateSeparator({ label }: DateSeparatorProps) {
  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={label}>
      <ThemedText type="caption" themeColor="textSecondary" forcedScheme="dark">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
