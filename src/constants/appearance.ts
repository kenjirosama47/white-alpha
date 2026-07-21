/**
 * Constantes du modèle de préférences d'apparence (Phase 10.1 — voir
 * PLAN.md). Les valeurs par défaut reproduisent l'apparence actuelle de
 * l'app à l'identique : un compte qui n'a jamais ouvert l'écran Apparence
 * (pas encore implémenté) ne verra aucun changement visuel.
 */

import { DEFAULT_WOLF_AVATAR_ID } from '@/constants/avatars';
import { Colors } from '@/constants/theme';
import type { AppearancePreferences } from '@/types/appearance';

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
