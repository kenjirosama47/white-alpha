import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type DateSeparatorProps = {
  label: string;
};

/** Séparateur discret entre deux jours de messages (écran de discussion, Phase 7.4) — purement visuel, dérivé de `createdAt`. */
export function DateSeparator({ label }: DateSeparatorProps) {
  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={label}>
      <ThemedText type="caption" themeColor="textSecondary">
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
