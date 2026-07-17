import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type ScreenHeaderProps = {
  title: string;
  /** Repli sur `router.back()` si omis (comportement déjà utilisé partout). */
  onBack?: () => void;
  /** Libellé du bouton retour — « Retour » par défaut (ex. « Annuler » pour un formulaire d'édition, Phase 7.5). */
  backLabel?: string;
  /** Élément affiché à droite (ex. bouton d'action) — un `View` de largeur fixe le remplace si absent, pour garder le titre centré. */
  rightElement?: ReactNode;
};

/**
 * En-tête d'écran unique pour toute l'application (Phase 7.1) : remplace le
 * motif Retour/titre/spacer dupliqué sur 4 écrans (search, security,
 * notifications, profile — voir audit Phase 7).
 */
export function ScreenHeader({ title, onBack, backLabel = 'Retour', rightElement }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack ?? (() => router.back())} hitSlop={8} accessibilityRole="button" accessibilityLabel={backLabel}>
        <ThemedText type="link" themeColor="textSecondary">
          {backLabel}
        </ThemedText>
      </Pressable>
      <ThemedText type="title" numberOfLines={1} style={styles.title}>
        {title}
      </ThemedText>
      <View style={styles.side}>{rightElement}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  side: {
    minWidth: 50,
    alignItems: 'flex-end',
  },
});
