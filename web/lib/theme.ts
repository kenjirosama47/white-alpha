/**
 * Palette White Alpha, portée depuis le projet mobile
 * (`src/constants/theme.ts`, Phase 7.1) — valeurs recopiées à l'identique,
 * jamais importées directement depuis `web/` vers `src/` (les deux projets
 * restent des dépôts de build indépendants, voir Phase 8.2). Toute
 * modification de palette doit être répercutée manuellement des deux côtés.
 */
export const Colors = {
  light: {
    background: '#F6F4EF',
    surface: '#FFFFFF',
    surfaceHigh: '#FFFFFF',
    text: '#14150F',
    textSecondary: '#6B6862',
    border: '#E3E0D8',
    accent: '#2F6B45',
    accentBright: '#2E9E5B',
    onAccent: '#F5F3ED',
    danger: '#B3453D',
    warning: '#96692A',
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
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;
