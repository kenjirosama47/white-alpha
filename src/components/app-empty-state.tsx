import { StyleSheet } from 'react-native';

import { RetryButton } from '@/components/retry-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type AppEmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  accessibilityLabel?: string;
};

/**
 * État « liste vide » générique. Jamais utilisé pour une erreur (voir
 * `AppErrorState`) : ce composant décrit une absence légitime de contenu,
 * pas un échec de chargement.
 */
export function AppEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  accessibilityLabel,
}: AppEmptyStateProps) {
  return (
    <ThemedView
      style={[styles.container, compact ? styles.compact : styles.fullScreen]}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? title}>
      <ThemedText type="smallBold" style={styles.centeredText}>
        {title}
      </ThemedText>
      {description && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          {description}
        </ThemedText>
      )}
      {actionLabel && onAction && <RetryButton onPress={onAction} label={actionLabel} />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
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
