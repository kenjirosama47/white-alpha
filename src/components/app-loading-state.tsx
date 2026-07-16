import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type AppLoadingStateProps = {
  /** Sous-titre optionnel affiché sous l'indicateur. */
  title?: string;
  description?: string;
  /** `true` pour un indicateur inline (ex. pagination) plutôt que plein écran. */
  compact?: boolean;
  accessibilityLabel?: string;
};

/** État de chargement générique : jamais un écran blanc, annoncé aux lecteurs d'écran. */
export function AppLoadingState({ title, description, compact = false, accessibilityLabel }: AppLoadingStateProps) {
  return (
    <ThemedView
      style={[styles.container, compact ? styles.compact : styles.fullScreen]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? title ?? 'Chargement en cours'}>
      <ActivityIndicator size={compact ? 'small' : 'large'} />
      {title && (
        <ThemedText type="smallBold" style={styles.centeredText}>
          {title}
        </ThemedText>
      )}
      {description && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          {description}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  fullScreen: {
    flex: 1,
  },
  compact: {
    paddingVertical: Spacing.three,
  },
  centeredText: {
    textAlign: 'center',
  },
});
