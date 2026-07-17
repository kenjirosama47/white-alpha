import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type BadgeTone = 'accent' | 'neutral' | 'danger' | 'warning';

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
};

/**
 * Badge unique pour toute l'application (Phase 7.1) : remplace le badge
 * « Propriétaire » codé en dur (`security.tsx`). `accent` (vert forêt)
 * réservé aux badges qui signalent réellement un état actif ou l'identité
 * White Alpha (ex. rôle propriétaire) — jamais un badge décoratif.
 */
export function Badge({ label, tone = 'accent' }: BadgeProps) {
  const theme = useTheme();
  const toneColor: Record<BadgeTone, string> = {
    accent: theme.accent,
    neutral: theme.textSecondary,
    danger: theme.danger,
    warning: theme.warning,
  };
  const color = toneColor[tone];

  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: `${color}1F` }]}>
      <ThemedText type="caption" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.three,
  },
});
