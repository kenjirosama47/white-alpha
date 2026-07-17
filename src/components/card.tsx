import { View, type ViewProps } from 'react-native';

import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

type CardProps = ViewProps & {
  /** `false` pour un conteneur sans marge intérieure (ex. liste d'items gérant son propre padding). */
  padded?: boolean;
  /** Ombre portée en clair uniquement (jamais en sombre, voir `constants/theme.ts`) — réservé aux éléments réellement flottants (ex. modales). */
  elevated?: boolean;
};

/** Carte unique pour toute l'application (Phase 7.1) : surface + bordure discrète, rayon `Radius.lg`. */
export function Card({ style, padded = true, elevated = false, ...rest }: CardProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const shadow = elevated ? Shadows[scheme === 'dark' ? 'dark' : 'light'].card : undefined;

  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: theme.border,
        },
        padded && { padding: Spacing.three },
        shadow,
        style,
      ]}
      {...rest}
    />
  );
}
