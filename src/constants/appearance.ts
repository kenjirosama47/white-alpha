/**
 * Constantes du modèle de préférences d'apparence (Phase 10.1 — voir
 * PLAN.md). Les valeurs par défaut reproduisent l'apparence actuelle de
 * l'app à l'identique : un compte qui n'a jamais ouvert l'écran Apparence
 * (pas encore implémenté) ne verra aucun changement visuel.
 */

import { DEFAULT_WOLF_AVATAR_ID } from '@/constants/avatars';
import { Colors } from '@/constants/theme';
import type { AppearancePreferences, BackgroundSlot } from '@/types/appearance';

/** Incrémentée à chaque changement de forme du schéma stocké (voir `appearance-storage.ts`). */
export const APPEARANCE_SCHEMA_VERSION = 1;

/** Suffixe `-v1` figé : une future Phase 10.x introduira une nouvelle clé plutôt que de faire migrer AsyncStorage lui-même. */
export const APPEARANCE_STORAGE_KEY = 'white-alpha/appearance-preferences-v1';

export const APPEARANCE_LIMITS = {
  // Plancher à 0.4 : en dessous, une carte redevient illisible sur un fond
  // personnalisé chargé (voir PLAN.md, risques d'accessibilité Phase 10.5).
  cardOpacity: { min: 0.4, max: 1 },
  blurLevel: { min: 0, max: 1 },
  // Plafond à 0.85 (jamais 1) : un assombrissement total masquerait le fond
  // choisi par l'utilisateur au lieu de simplement en garantir la lisibilité.
  darkenLevel: { min: 0, max: 0.85 },
  textScale: { min: 0.85, max: 1.3 },
} as const;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

/**
 * Couleurs reprises telles quelles de la palette sombre actuelle : bulles
 * envoyées = `accent`, bulles reçues = `surfaceHigh` (voir
 * `components/message-bubble.tsx`, environnement de discussion toujours
 * sombre) — pour que ces valeurs par défaut ne changent rien à l'existant.
 */
export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  schemaVersion: APPEARANCE_SCHEMA_VERSION,
  themeMode: 'system',
  accentColor: Colors.dark.accent,
  buttonColor: Colors.dark.accent,
  bubbleSentColor: Colors.dark.accent,
  bubbleReceivedColor: Colors.dark.surfaceHigh,
  cardOpacity: APPEARANCE_LIMITS.cardOpacity.max,
  blurLevel: APPEARANCE_LIMITS.blurLevel.min,
  darkenLevel: APPEARANCE_LIMITS.darkenLevel.min,
  textScale: 1,
  backgrounds: {
    home: { kind: 'default' },
    conversation: { kind: 'default' },
    profile: { kind: 'default' },
  },
  avatarPreset: DEFAULT_WOLF_AVATAR_ID,
};

/**
 * Palette de couleurs prédéfinies (Phase 10.3, écran Apparence) : teintes
 * originales composées pour l'identité sombre/naturelle/premium de White
 * Alpha (voir `constants/theme.ts`), aucune reprise d'un visuel ou d'une
 * palette tierce. Utilisée telle quelle pour les 4 réglages de couleur
 * (principale, boutons, bulles envoyées, bulles reçues) — un simple choix
 * parmi des teintes prédéfinies, jamais un sélecteur de couleur libre (pas
 * de nouvelle dépendance nécessaire).
 */
export const APPEARANCE_COLOR_PRESETS = [
  { id: 'forest', label: 'Vert forêt', hex: Colors.dark.accent },
  { id: 'moss', label: 'Vert mousse', hex: '#4B7F52' },
  { id: 'teal', label: 'Bleu sarcelle', hex: '#2C6E7A' },
  { id: 'slate_blue', label: 'Bleu ardoise', hex: '#3B5B7A' },
  { id: 'amber', label: 'Ambre', hex: '#B08A3E' },
  { id: 'copper', label: 'Cuivre', hex: '#A05A3B' },
  { id: 'wine', label: 'Lie-de-vin', hex: '#7A3B4E' },
  { id: 'graphite', label: 'Graphite', hex: '#4A4D46' },
] as const satisfies readonly { id: string; label: string; hex: string }[];

/**
 * Paliers discrets de taille de texte (Phase 10.3) : un sélecteur à choix
 * fixes plutôt qu'un curseur continu (pas de nouvelle dépendance de type
 * "slider" nécessaire), bornés par `APPEARANCE_LIMITS.textScale`.
 */
export const TEXT_SCALE_STEPS = [
  { label: 'Petit', value: APPEARANCE_LIMITS.textScale.min },
  { label: 'Normal', value: 1 },
  { label: 'Grand', value: 1.15 },
  { label: 'Très grand', value: APPEARANCE_LIMITS.textScale.max },
] as const satisfies readonly { label: string; value: number }[];

/** Options du sélecteur de thème (Phase 10.3) — reprend `ThemeMode` tel quel. */
export const THEME_MODE_OPTIONS = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
] as const satisfies readonly { value: AppearancePreferences['themeMode']; label: string }[];

/**
 * Options du sélecteur « Appliquer à » (Phase 10.4, galerie de décorations)
 * — reprend `BackgroundSlot` tel quel. Le libellé « Accueil » couvre à la
 * fois la page d'accueil et la liste des conversations : dans White Alpha,
 * c'est le même écran (`src/app/(app)/index.tsx`, `ConversationsScreen`).
 */
export const BACKGROUND_SLOT_OPTIONS = [
  { value: 'home', label: 'Accueil' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'profile', label: 'Profil' },
] as const satisfies readonly { value: BackgroundSlot; label: string }[];
