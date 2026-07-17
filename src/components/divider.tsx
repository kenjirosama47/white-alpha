import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type DividerProps = {
  style?: StyleProp<ViewStyle>;
};

/** Séparateur fin unique pour toute l'application (Phase 7.1). */
export function Divider({ style }: DividerProps) {
  const theme = useTheme();

  return <View style={[styles.line, { backgroundColor: theme.border }, style]} />;
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
});
