import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'default' | 'small';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Bouton unique pour toute l'application (Phase 7.1) : remplace les styles
 * ad hoc dupliqués sur chaque écran (voir audit Phase 7). `primary` est la
 * seule variante à utiliser l'accent en remplissage plein — conforme à la
 * consigne « le vert ne doit pas être utilisé partout » : `secondary` et
 * `ghost` restent neutres, `danger` reste dans les tons rouges.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const variantStyle: StyleProp<ViewStyle> =
    variant === 'primary'
      ? { backgroundColor: theme.accent, borderWidth: 0 }
      : variant === 'secondary'
        ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border }
        : variant === 'danger'
          ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.danger }
          : { backgroundColor: 'transparent', borderWidth: 0 };

  const labelColor =
    variant === 'primary' ? theme.onAccent : variant === 'danger' ? theme.danger : variant === 'ghost' ? theme.accent : theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        size === 'small' ? styles.small : styles.default,
        variantStyle,
        (pressed || isDisabled) && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={labelColor} />
      ) : (
        <ThemedText type="label" style={{ color: labelColor }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
  },
  default: {
    minHeight: TouchTarget.comfortable,
  },
  small: {
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
