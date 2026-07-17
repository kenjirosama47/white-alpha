import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor, Typography, type TypographyVariant } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Types hérités (`default`, `title`, `small`, `smallBold`, `subtitle`,
 * `link`, `linkPrimary`, `code`) conservés à l'identique pour les écrans pas
 * encore migrés vers l'échelle typographique Phase 7.1 (`Typography`,
 * `constants/theme.ts`) — ni supprimés ni redéfinis, pour ne rien changer
 * visuellement sur les écrans existants tant qu'ils ne sont pas repris
 * (Phase 7.2+). Les nouveaux types (`display`, `body`, `bodySmall`, `label`,
 * `caption`) s'ajoutent en plus, jamais à la place.
 */
export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code'
    | TypographyVariant;
  themeColor?: ThemeColor;
};

const NEW_TYPOGRAPHY_VARIANTS = new Set<string>(Object.keys(Typography));

export function ThemedText({ style, type = 'default', themeColor, maxFontSizeMultiplier, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const newVariant = NEW_TYPOGRAPHY_VARIANTS.has(type) ? Typography[type as TypographyVariant] : null;

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? newVariant?.maxFontSizeMultiplier}
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        newVariant && { fontFamily: newVariant.fontFamily, fontSize: newVariant.fontSize, lineHeight: newVariant.lineHeight },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
