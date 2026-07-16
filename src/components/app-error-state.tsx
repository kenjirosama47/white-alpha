import { StyleSheet } from 'react-native';

import { RetryButton } from '@/components/retry-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type AppErrorStateProps = {
  /** Message déjà traduit en français (voir `@/utils/errors`) — jamais une erreur technique brute. */
  description: string;
  title?: string;
  /** Omis pour une erreur non récupérable (pas de nouvelle tentative possible). */
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  accessibilityLabel?: string;
};

/** État d'erreur récupérable générique, avec bouton « Réessayer » optionnel. */
export function AppErrorState({
  description,
  title = 'Une erreur est survenue',
  onRetry,
  retryLabel = 'Réessayer',
  compact = false,
  accessibilityLabel,
}: AppErrorStateProps) {
  return (
    <ThemedView
      style={[styles.container, compact ? styles.compact : styles.fullScreen]}
      accessibilityRole="alert"
      accessibilityLabel={accessibilityLabel ?? description}>
      <ThemedText type="smallBold" style={styles.centeredText}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
        {description}
      </ThemedText>
      {onRetry && <RetryButton onPress={onRetry} label={retryLabel} />}
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
