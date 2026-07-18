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
  /** Impose une palette indépendamment du thème système (Anomalie 2, build 16) — voir `useTheme`. */
  forcedScheme?: 'light' | 'dark';
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
  forcedScheme,
}: AppEmptyStateProps) {
  return (
    <ThemedView
      forcedScheme={forcedScheme}
      style={[styles.container, compact ? styles.compact : styles.fullScreen]}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? title}>
      <ThemedText type="smallBold" forcedScheme={forcedScheme} style={styles.centeredText}>
        {title}
      </ThemedText>
      {description && (
        <ThemedText type="small" themeColor="textSecondary" forcedScheme={forcedScheme} style={styles.centeredText}>
          {description}
        </ThemedText>
      )}
      {actionLabel && onAction && <RetryButton onPress={onAction} label={actionLabel} forcedScheme={forcedScheme} />}
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
