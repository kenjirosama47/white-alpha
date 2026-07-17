/**
 * Design System White Alpha (Phase 7.1) : tokens de couleurs, typographies,
 * espacements, rayons, ombres et tailles tactiles. Palette sombre, naturelle
 * et premium — le vert (accent) est réservé aux actions importantes, états
 * actifs, badges et éléments d'identité, jamais utilisé comme couleur de
 * fond générale (voir composants `Button`/`Badge`).
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#F6F4EF',
    surface: '#FFFFFF',
    surfaceHigh: '#FFFFFF',
    text: '#14150F',
    textSecondary: '#6B6862',
    border: '#E3E0D8',
    /** Vert forêt : accent principal (actions importantes, états actifs, badges). */
    accent: '#2F6B45',
    /** Vert de l'œil du loup : accent lumineux, usage ponctuel (glow, mise en avant). Version resserrée en clair pour rester lisible en texte sur fond clair. */
    accentBright: '#2E9E5B',
    /** Texte/icône affiché par-dessus un remplissage `accent` (bouton primaire). */
    onAccent: '#F5F3ED',
    danger: '#B3453D',
    warning: '#96692A',
    // Alias hérités (Phase 5 et antérieures) : conservés pour ne pas casser
    // les écrans pas encore migrés vers les nouveaux tokens (Phase 7.2+).
    // backgroundElement = surface, backgroundSelected = border.
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E3E0D8',
  },
  dark: {
    background: '#0D0F0C',
    surface: '#171913',
    surfaceHigh: '#21231B',
    text: '#F5F3ED',
    textSecondary: '#9C988E',
    border: '#33352B',
    accent: '#2F6B45',
    accentBright: '#4CD97B',
    onAccent: '#F5F3ED',
    danger: '#C4574F',
    warning: '#C99A4A',
    backgroundElement: '#171913',
    backgroundSelected: '#33352B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Inter (Regular/Medium/SemiBold/Bold), chargée via `useFonts` au démarrage
 * (voir `src/app/_layout.tsx`, gate combiné à la restauration de session).
 * `Fonts` (système, ci-dessous) reste le repli tant que le chargement n'est
 * pas terminé et pour les usages `mono` existants (non concernés par Inter).
 */
export const FontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * Échelle typographique centralisée. `maxFontSizeMultiplier` évite qu'un
 * réglage d'accessibilité extrême (très grande taille de police système)
 * casse la mise en page des titres, sans jamais désactiver le
 * redimensionnement dynamique (`allowFontScaling` reste actif partout).
 */
export const Typography = {
  display: { fontFamily: FontFamily.bold, fontSize: 40, lineHeight: 48, maxFontSizeMultiplier: 1.4 },
  title: { fontFamily: FontFamily.semiBold, fontSize: 28, lineHeight: 36, maxFontSizeMultiplier: 1.6 },
  subtitle: { fontFamily: FontFamily.semiBold, fontSize: 22, lineHeight: 28, maxFontSizeMultiplier: 1.8 },
  body: { fontFamily: FontFamily.regular, fontSize: 16, lineHeight: 24, maxFontSizeMultiplier: 2 },
  bodySmall: { fontFamily: FontFamily.regular, fontSize: 14, lineHeight: 20, maxFontSizeMultiplier: 2 },
  label: { fontFamily: FontFamily.medium, fontSize: 14, lineHeight: 20, maxFontSizeMultiplier: 2 },
  caption: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, maxFontSizeMultiplier: 2 },
} as const;

export type TypographyVariant = keyof typeof Typography;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/**
 * Le noir n'est jamais utilisé comme `shadowColor` en sombre (invisible sur
 * fond déjà proche du noir) : l'élévation en mode sombre se lit via
 * `surfaceHigh` + `border`, jamais une ombre portée.
 */
export const Shadows = {
  light: {
    card: {
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    modal: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
  },
  dark: {
    card: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
    modal: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  },
} as const;

/** `comfortable` (48) est la hauteur par défaut des composants tactiles (`Button`, `TextField`) ; `min` (44) est le plancher absolu (repris par les cibles tactiles existantes, ex. `RetryButton`). */
export const TouchTarget = {
  min: 44,
  comfortable: 48,
} as const;

export const IconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
