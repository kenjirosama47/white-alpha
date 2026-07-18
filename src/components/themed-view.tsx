import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
  /** Impose une palette indépendamment du thème système (Anomalie 2, build 16) — voir `useTheme`. */
  forcedScheme?: 'light' | 'dark';
};

export function ThemedView({ style, lightColor, darkColor, type, forcedScheme, ...otherProps }: ThemedViewProps) {
  const theme = useTheme(forcedScheme);

  return <View style={[{ backgroundColor: theme[type ?? 'background'] }, style]} {...otherProps} />;
}
