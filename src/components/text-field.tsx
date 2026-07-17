import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
  /** Élément affiché à droite, à l'intérieur du champ (ex. bouton afficher/masquer — voir `PasswordField`). */
  rightAccessory?: ReactNode;
};

/**
 * Champ de saisie unique pour toute l'application (Phase 7.1) : remplace les
 * champs ad hoc dupliqués (login, register, search, security, profile —
 * voir audit Phase 7), qui n'avaient aucun état de focus visible. Bordure
 * accent au focus, bordure danger + message en cas d'erreur.
 */
export function TextField({ label, error, rightAccessory, style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? theme.danger : focused ? theme.accent : theme.border;

  return (
    <View style={styles.container}>
      {label && (
        <ThemedText type="label" themeColor="textSecondary">
          {label}
        </ThemedText>
      )}
      <View style={styles.inputRow}>
        <TextInput
          placeholderTextColor={theme.textSecondary}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            { color: theme.text, borderColor, backgroundColor: theme.surface },
            Boolean(rightAccessory) && styles.inputWithAccessory,
            style,
          ]}
          {...rest}
        />
        {rightAccessory && <View style={styles.accessory}>{rightAccessory}</View>}
      </View>
      {error && (
        <ThemedText type="caption" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  inputRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    minHeight: TouchTarget.comfortable,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  inputWithAccessory: {
    paddingRight: Spacing.five * 2,
  },
  accessory: {
    position: 'absolute',
    right: Spacing.three,
  },
});
