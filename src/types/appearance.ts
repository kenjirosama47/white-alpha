/**
 * Types du modèle de préférences d'apparence (Phase 10.1 — voir PLAN.md).
 * Stockage exclusivement local à ce stade : aucune synchronisation
 * Supabase, aucune photo personnelle envoyée au serveur, aucune URL
 * signée ni jeton dans ce modèle.
 */

import type { WolfAvatarId } from '@/constants/avatars';

export type ThemeMode = 'system' | 'light' | 'dark';

export type BackgroundSlot = 'home' | 'conversation' | 'profile';

/**
 * `catalog` référencera un identifiant de la galerie de décorations (Phase
 * 10.4, pas encore implémentée) : une simple chaîne pour l'instant, à
 * revalider contre le catalogue réel au moment de son introduction.
 * `personal` ne référence jamais qu'un chemin de fichier LOCAL
 * (`localUri`) — jamais une URL Supabase, jamais un chemin distant, jamais
 * un jeton (voir contrainte Phase 10.1, section 8).
 */
export type BackgroundConfig =
  | { kind: 'default' }
  | { kind: 'catalog'; decorationId: string }
  | { kind: 'personal'; localUri: string };

export type AppearancePreferences = {
  /** Version du schéma stocké — voir `migrateAppearancePreferences` dans `appearance-storage.ts`. */
  schemaVersion: number;
  themeMode: ThemeMode;
  /** Couleur hexadécimale `#RRGGBB`. Reprise par `useTheme()` à la Phase 10.2 (pas encore branchée). */
  accentColor: string;
  buttonColor: string;
  bubbleSentColor: string;
  bubbleReceivedColor: string;
  /** 0–1. Opacité des cartes quand un fond personnalisé est actif (jamais appliquée sur le fond par défaut). */
  cardOpacity: number;
  /** 0–1. Intensité du flou appliqué au fond (0 = aucun flou). */
  blurLevel: number;
  /** 0–1. Intensité de l'overlay noir semi-transparent posé sur le fond. */
  darkenLevel: number;
  /** Multiplicateur appliqué par-dessus `Typography` (1 = taille par défaut inchangée). */
  textScale: number;
  backgrounds: Record<BackgroundSlot, BackgroundConfig>;
  /**
   * Miroir local de l'avatar loup sélectionné, réservé à l'aperçu instantané
   * du futur écran Apparence (Phase 10.3, pas encore implémenté). N'est
   * JAMAIS la source de vérité : celle-ci reste le profil Supabase
   * (`profiles.avatar_preset`, voir `services/profiles.ts`). Aucun écran ne
   * lit ni n'écrit ce champ à ce stade (10.1).
   */
  avatarPreset: WolfAvatarId;
};
