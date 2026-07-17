import { useState } from 'react';
import { Pressable, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TextField } from '@/components/text-field';

type PasswordFieldProps = Omit<TextInputProps, 'secureTextEntry' | 'autoCapitalize' | 'autoCorrect'> & {
  label?: string;
  error?: string;
};

/**
 * Champ mot de passe unique pour toute l'application (Phase 7.3) : masqué
 * par défaut, bouton afficher/masquer accessible (texte, pas d'icône —
 * aucun système d'icônes n'existe encore dans ce projet), autocorrection et
 * capitalisation automatique désactivées (non configurables par
 * l'appelant : ce sont des protections, pas des options).
 */
export function PasswordField({ label, error, ...rest }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      label={label}
      error={error}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="password"
      rightAccessory={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
          <ThemedText type="label" themeColor="accent">
            {visible ? 'Masquer' : 'Afficher'}
          </ThemedText>
        </Pressable>
      }
      {...rest}
    />
  );
}
