import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Lu par le lecteur d'écran avant les options (ex. "Thème") — jamais la seule indication du regroupement. */
  accessibilityLabel: string;
  disabled?: boolean;
};

/**
 * Sélecteur à options exclusives (Phase 10.3, écran Apparence) : chaque
 * option a une cible tactile de hauteur `TouchTarget.min` minimum, et
 * l'option sélectionnée se distingue par un remplissage ET un texte en gras
 * — jamais la seule couleur (même principe que le repère de sélection de
 * `avatar-gallery.tsx`).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.row, { borderColor: theme.border }]}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isSelected, disabled }}
            style={({ pressed }) => [
              styles.segment,
              isSelected && { backgroundColor: theme.accent },
              pressed && !isSelected && styles.pressed,
            ]}>
            <ThemedText
              type="label"
              style={{ color: isSelected ? theme.onAccent : theme.textSecondary, fontWeight: isSelected ? '700' : '500' }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
